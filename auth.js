// ============================================
// VANTCALL Esports — Auth (Auth0: correo, Google, Discord, GitHub, Kick) + cuenta + zona + Stripe
// Usa Auth0 SPA SDK + Neon Data API (window.VantDB de auth0-config.js)
// ============================================
(function () {
  'use strict';

  const PLANS = {
    basic: { name: 'VANT BASIC', price: 9, link: 'https://buy.stripe.com/aFaaEX7Ff9FufJ4gQlebu01' },
    pro:   { name: 'VANT PRO',   price: 19, link: 'https://buy.stripe.com/4gMeVd3oZ2d2eF0eIdebu02' },
    elite: { name: 'VANT ELITE', price: 39, link: 'https://buy.stripe.com/aFa4gz7Ff6ti68u7fLebu03' },
  };
  const PLAN_RANK = { free: 0, basic: 1, pro: 2, elite: 3 };
  const PLAYER_COLS = 'id, username, display_name, avatar_url, region, summoner_name, verified, created_at, main_game, country';
  const USERNAME_RE = /^[A-Za-z0-9_.\-]{3,16}$/;

  const DB = window.VantDB;
  const A0 = window.VantAuth0;
  let session = null;
  let me = null;

  const mem = new Map();
  const flags = { get: (k) => (mem.has(k) ? mem.get(k) : null), set: (k, v) => mem.set(k, String(v)), del: (k) => mem.delete(k) };

  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // Siempre la carpeta raíz de la web (p. ej. /Vants/), aunque la URL sea /Vants/cuenta o /Vants/index.html
  const baseUrl = () => window.location.origin + window.location.pathname.replace(/[^/]*$/, '');
  const go = (route) => { if (window.location.hash !== '#/' + route) window.location.hash = '#/' + route; else if (typeof router === 'function') router(); };

  const ERRORS = [
    [/invalid login credentials|wrong email or password|invalid_grant/i, 'Correo o contraseña incorrectos.'],
    [/email not confirmed|verify your email|email_verified/i, 'Tu correo aún no está confirmado. Revisa tu bandeja de entrada (y spam).'],
    [/user already registered|already been registered|user already exists/i, 'Ya existe una cuenta con este correo. Inicia sesión o recupera tu contraseña.'],
    [/password should be|weak password|password is too weak|password strength|PasswordStrengthError/i, 'La contraseña es demasiado débil.'],
    [/rate limit|too many|security purposes/i, 'Demasiados intentos. Espera un minuto y vuelve a probar.'],
    [/provider is not enabled|unsupported provider|connection/i, 'Este método de inicio de sesión no está activado en este momento.'],
    [/duplicate key|unique/i, 'Ya existe un registro igual.'],
    [/row-level security|permission denied|insufficient/i, 'No tienes permiso para esta acción. Inicia sesión de nuevo.'],
    [/failed to fetch|network|timeout/i, 'Sin conexión con el servidor. Revisa tu conexión e inténtalo de nuevo.'],
    [/access_denied|consent_required/i, 'Cancelaste el inicio de sesión.'],
    [/invalid_token|expired|token.*expired/i, 'Tu sesión ha caducado. Inicia sesión de nuevo.'],
    [/login_required/i, 'Necesitas iniciar sesión.'],
    [/interaction_required/i, 'Se requiere tu autorización. Inténtalo de nuevo.'],
  ];
  const humanError = (e) => {
    const msg = (e && (e.message || e.error_description || e.error || e.msg)) || String(e);
    for (const [re, txt] of ERRORS) if (re.test(msg)) return txt;
    return 'No se pudo completar la operación: ' + msg;
  };

  function showMsg(el, text, kind) {
    if (!el) return;
    el.textContent = text;
    el.className = 'auth-msg auth-msg-' + (kind || 'info');
    el.hidden = !text;
  }

  function setBusy(form, busy, label) {
    const btn = form.querySelector('button[type="submit"]');
    if (!btn) return;
    if (busy) { btn.dataset.label = btn.textContent; btn.textContent = label || 'Procesando…'; btn.disabled = true; }
    else { btn.textContent = btn.dataset.label || btn.textContent; btn.disabled = false; }
  }

  function passwordProblem(p) {
    if (p.length < 12) return 'La contraseña debe tener al menos 12 caracteres.';
    if (!/[A-Z]/.test(p) || !/[a-z]/.test(p) || !/[0-9]/.test(p)) return 'Usa al menos una mayúscula, una minúscula y un número.';
    return '';
  }

  // ---------- sesión ----------
  async function loadSession() {
    if (!A0.client) return null;
    try {
      const isAuth = await A0.client.isAuthenticated();
      if (!isAuth) { session = null; return null; }
      const user = await A0.client.getUser();
      const token = await A0.getToken();
      session = { user, token, userId: user ? user.sub : null };
      return session;
    } catch {
      session = null;
      return null;
    }
  }

  async function loadMe() {
    if (!session) { me = null; return null; }
    let { data: pid } = await DB.rpc('current_player_id');
    if (!pid) {
      // Primer acceso con Auth0: crear jugador + perfil en Neon
      const u = session.user || {};
      const r = await DB.rpc('ensure_player', {
        p_username: u.nickname || (u.email || '').split('@')[0] || u.name || null,
        p_display_name: u.name || u.nickname || null,
        p_avatar_url: u.picture || null,
      });
      pid = r && r.data ? r.data : null;
      if (DB.invalidate) DB.invalidate('players');
    }
    const { data: player } = pid ? await DB.from('players').select(PLAYER_COLS).eq('id', pid).maybeSingle() : { data: null };
    if (!player) {
      me = { player: null, discord: null, plan: 'free', profile: null, steam: null, perks: [], adminRole: null };
      return me;
    }
    const [disc, prof, ent, steam, perks] = await Promise.all([
      DB.from('player_discord_accounts').select('discord_id, discord_username, avatar_url').eq('player_id', player.id).maybeSingle(),
      DB.from('profiles').select('bio, visibility').eq('player_id', player.id).maybeSingle(),
      DB.from('entitlements').select('tier, is_active, expires_at').eq('player_id', player.id).eq('is_active', true),
      DB.from('user_game_accounts').select('handle, display_name, avatar_url, profile_url, verified').eq('user_id', session.userId).eq('game', 'steam').maybeSingle(),
      DB.from('plan_content').select('tier, kind, title, body, cta_label, cta_url, sort_order').eq('published', true).order('tier').order('sort_order'),
    ]);
    let plan = 'free';
    for (const e of ent.data || []) {
      const t = String(e.tier || '').toLowerCase();
      if (PLAN_RANK[t] > PLAN_RANK[plan] && (!e.expires_at || new Date(e.expires_at) > new Date())) plan = t;
    }
    let adminRole = null;
    try { const r = await DB.rpc('web_admin_role'); adminRole = r.data || null; } catch (_) { adminRole = null; }
    if (adminRole === 'owner' || adminRole === 'admin') plan = 'elite';
    me = { player, discord: disc.data || null, profile: prof.data || null, plan, steam: (steam && steam.data) || null, perks: (perks && perks.data) || [], adminRole };
    return me;
  }

  function displayName() {
    if (!session || !session.user) return '';
    return (me && me.player && (me.player.display_name || me.player.username))
      || (session.user.name || session.user.nickname)
      || (session.user.email || '').split('@')[0];
  }

  function updateHeader() {
    const link = document.getElementById('auth-link');
    const label = document.getElementById('auth-link-label');
    if (!link || !label) return;
    if (session) {
      const plan = me && me.plan !== 'free' ? ' · ' + me.plan.toUpperCase() : '';
      label.textContent = displayName() + plan;
      link.setAttribute('href', '#/cuenta');
      link.setAttribute('aria-label', 'Mi cuenta');
    } else {
      label.textContent = 'Login';
      link.setAttribute('href', '#/login');
      link.setAttribute('aria-label', 'Iniciar sesión');
    }
    const adminLink = document.getElementById('admin-link');
    if (adminLink) adminLink.hidden = !(session && me && me.adminRole);
    document.querySelectorAll('[data-zona-link]').forEach((a) => a.classList.toggle('is-unlocked', Boolean(session && me && me.plan !== 'free')));
    document.querySelectorAll('[data-auth-cta]').forEach((a) => {
      a.setAttribute('href', session ? '#/cuenta' : '#/login');
      a.textContent = session ? 'MI CUENTA' : 'JUGAR GRATIS';
    });
  }

  // ---------- OAuth (Auth0 connections) ----------
  const PROVIDER_CONNECTION = {
    google: 'google-oauth2',
    discord: 'discord',
    github: 'github',
    twitch: 'twitch',
    spotify: 'spotify',
    kick: 'kick', // Custom Social Connection
  };

  async function oauth(provider, msgEl) {
    if (!A0.client) return showMsg(msgEl, 'No se pudo cargar el sistema de inicio de sesión. Recarga la página.', 'error');
    const connection = PROVIDER_CONNECTION[provider];
    if (!connection) return showMsg(msgEl, 'Proveedor no soportado.', 'error');
    try {
      await A0.client.loginWithRedirect({
        authorizationParams: {
          connection,
          redirect_uri: baseUrl(),
          audience: 'https://api.vants.app',
        },
      });
    } catch (e) {
      showMsg(msgEl, humanError(e), 'error');
    }
  }

  // ---------- Vinculación real de cuentas (Auth0 account linking) ----------
  // Requiere en Auth0: permitir a esta SPA pedir tokens de la Management API
  // (audience https://vants.eu.auth0.com/api/v2/) con read:current_user y update:current_user_identities.
  const MGMT_AUD = 'https://vants.eu.auth0.com/api/v2/';
  const MGMT_SCOPE = 'openid read:current_user update:current_user_identities';
  let linkedIds = [];

  let mgmtCache = null;
  async function mgmtToken(popup) {
    const opts = { authorizationParams: { audience: MGMT_AUD, scope: MGMT_SCOPE } };
    try { mgmtCache = await A0.client.getTokenSilently(opts); return mgmtCache; }
    catch (e) {
      if (!popup) return null;
      mgmtCache = await A0.client.getTokenWithPopup(opts, { popup });
      return mgmtCache;
    }
  }

  async function loadIdentities() {
    if (!session || !session.user) return [];
    try {
      const t = await mgmtToken(null);
      if (!t) return linkedIds;
      const r = await fetch(MGMT_AUD + 'users/' + encodeURIComponent(session.user.sub) + '?fields=identities&include_fields=true', { headers: { Authorization: 'Bearer ' + t } });
      if (r.ok) { const j = await r.json(); linkedIds = (j && j.identities) || []; }
    } catch (_) {}
    return linkedIds;
  }

  async function linkAccount(provider, msgEl, redraw) {
    const connection = PROVIDER_CONNECTION[provider];
    if (!connection) return showMsg(msgEl, 'Proveedor no soportado.', 'error');
    if (!session) return showMsg(msgEl, 'Inicia sesión primero.', 'error');
    // La ventana se abre en el mismo clic para que el navegador no la bloquee
    const popup = window.open('', 'auth0:authorize:popup', 'left=120,top=80,width=480,height=680,resizable,scrollbars=yes');
    try {
      // 1) Token de la Management API de la cuenta PRINCIPAL (antes de entrar con la segunda cuenta)
      let t = mgmtCache || await mgmtToken(null);
      if (!t) {
        await mgmtToken(popup);
        return showMsg(msgEl, 'Permiso concedido. Pulsa otra vez "Vincular ' + provider + '" para terminar.', 'info');
      }
      // 2) Iniciar sesión con la cuenta a vincular (cliente temporal, no toca tu sesión)
      showMsg(msgEl, 'Inicia sesión en la ventana emergente para vincular ' + provider + '…', 'info');
      const temp = new window.auth0.Auth0Client({
        domain: 'vants.eu.auth0.com',
        clientId: 'oaOmNizh7HrASWfmfM29bN284IMJvqPG',
        cacheLocation: 'memory',
        authorizationParams: { redirect_uri: baseUrl() },
      });
      await temp.loginWithPopup({ authorizationParams: { connection, prompt: 'login', scope: 'openid profile email' } }, { popup });
      const claims = await temp.getIdTokenClaims();
      if (!claims || !claims.__raw) throw new Error('No se recibió la identidad del proveedor.');
      if (claims.sub === session.user.sub) throw new Error('Esa cuenta ya es tu cuenta principal.');
      const r = await fetch(MGMT_AUD + 'users/' + encodeURIComponent(session.user.sub) + '/identities', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' },
        body: JSON.stringify({ link_with: claims.__raw }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error((j && (j.message || j.error)) || ('Error ' + r.status));
      linkedIds = Array.isArray(j) ? j : linkedIds;
      flags.set('vant_flash', JSON.stringify({ text: 'Cuenta de ' + provider + ' vinculada.', kind: 'success' }));
      if (redraw) redraw();
    } catch (e) {
      try { if (popup && !popup.closed) popup.close(); } catch (_) {}
      const m = (e && (e.error || e.message)) || '';
      if (/popup_closed|cancelled|window closed/i.test(m)) return showMsg(msgEl, 'Vinculación cancelada.', 'info');
      if (/consent|login_required|access_denied|unauthorized|Forbidden|403/i.test(m)) return showMsg(msgEl, 'Auth0 no permite todavía vincular cuentas desde la web (falta activar el acceso a la Management API para esta app).', 'error');
      showMsg(msgEl, humanError(e), 'error');
    }
  }

  async function loginWithEmail(email, password, msgEl) {
    try {
      await A0.client.loginWithCredentials({ username: email, password });
      return true;
    } catch (e) {
      showMsg(msgEl, humanError(e), 'error');
      return false;
    }
  }

  async function signUpWithEmail(email, password, username, msgEl) {
    try {
      const res = await fetch('https://vants.eu.auth0.com/dbconnections/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: 'oaOmNizh7HrASWfmfM29bN284IMJvqPG',
          email, password,
          connection: 'Username-Password-Authentication',
          user_metadata: { username },
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.description || err.message || 'Error al registrar');
      }
      return await loginWithEmail(email, password, msgEl);
    } catch (e) {
      showMsg(msgEl, humanError(e), 'error');
      return false;
    }
  }

  async function resetPassword(email, msgEl) {
    try {
      const res = await fetch('https://vants.eu.auth0.com/dbconnections/change_password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: 'oaOmNizh7HrASWfmfM29bN284IMJvqPG',
          email,
          connection: 'Username-Password-Authentication',
        }),
      });
      if (!res.ok) throw new Error('Error al enviar el correo');
      showMsg(msgEl, 'Si existe una cuenta con ese correo, recibirás un enlace para restablecer la contraseña.', 'success');
    } catch (e) {
      showMsg(msgEl, humanError(e), 'error');
    }
  }

  // ---------- handlers de formularios ----------
  const HANDLERS = {
    async login(form, msg) {
      const email = form.email.value.trim(), password = form.password.value;
      if (!email || !password) return showMsg(msg, 'Introduce tu correo y tu contraseña.', 'error');
      const ok = await loginWithEmail(email, password, msg);
      if (ok) {
        showMsg(msg, 'Sesión iniciada.', 'success');
        const next = flags.get('vant_next'); flags.del('vant_next');
        go(next || 'cuenta');
      }
    },
    async registro(form, msg) {
      const username = form.username.value.trim(), email = form.email.value.trim();
      const password = form.password.value, password2 = form.password2.value;
      if (!USERNAME_RE.test(username)) return showMsg(msg, 'El nickname debe tener 3-16 caracteres: letras, números, punto, guion o guion bajo.', 'error');
      if (!email) return showMsg(msg, 'Introduce tu correo.', 'error');
      const pp = passwordProblem(password); if (pp) return showMsg(msg, pp, 'error');
      if (password !== password2) return showMsg(msg, 'Las contraseñas no coinciden.', 'error');
      if (!form.age.checked) return showMsg(msg, 'Debes confirmar la edad mínima y aceptar los términos.', 'error');
      const { data: taken } = await DB.from('players').select('id').eq('username', username.toLowerCase()).maybeSingle();
      if (taken) return showMsg(msg, 'Ese nickname ya está en uso.', 'error');
      const ok = await signUpWithEmail(email, password, username, msg);
      if (ok) {
        showMsg(msg, 'Cuenta creada.', 'success');
        go('cuenta');
      }
    },
    async recuperar(form, msg) {
      const email = form.email.value.trim();
      if (!email) return showMsg(msg, 'Introduce tu correo.', 'error');
      await resetPassword(email, msg);
    },
    async perfil(form, msg) {
      if (!me || !me.player) return showMsg(msg, 'Tu perfil de jugador aún no está creado.', 'error');
      const upd = {
        display_name: form.display_name.value.trim().slice(0, 32) || null,
        region: form.region.value || null,
        main_game: form.main_game.value || null,
        country: form.country.value.trim().slice(0, 56) || null,
      };
      const { error } = await DB.from('players').update(upd).eq('id', me.player.id);
      if (error) return showMsg(msg, humanError(error), 'error');
      const bio = form.bio.value.trim().slice(0, 280);
      const vis = form.visibility.value;
      const { error: e2 } = await DB.from('profiles').update({ bio, visibility: vis }).eq('player_id', me.player.id);
      if (e2) return showMsg(msg, humanError(e2), 'error');
      DB.invalidate('p:'); DB.invalidate('players');
      await loadMe(); updateHeader();
      showMsg(msg, 'Perfil actualizado.', 'success');
    },
    async soporte(form, msg) {
      if (!me || !me.player) return showMsg(msg, 'Tu perfil de jugador aún no está creado.', 'error');
      const subject = form.subject.value.trim(), description = form.description.value.trim();
      if (subject.length < 4 || description.length < 10) return showMsg(msg, 'Añade un asunto y una descripción más detallada.', 'error');
      const { error } = await DB.from('support_tickets').insert({
        player_id: me.player.id, discord_id: me.discord ? me.discord.discord_id : null,
        subject: subject.slice(0, 120), description: description.slice(0, 2000), category: form.category.value, priority: 'normal', status: 'open',
      });
      if (error) return showMsg(msg, humanError(error), 'error');
      DB.rpc('log_web_event', { event_type: 'ticket_soporte', data: { asunto: subject.slice(0, 120) } });
      form.reset();
      showMsg(msg, 'Ticket enviado. El equipo te responderá por correo o Discord.', 'success');
      loadAccountLists(document.querySelector('[data-account]'));
    },
  };

  // ---------- checkout Stripe ----------
  async function startCheckout(key, msgEl, btn) {
    const plan = PLANS[key];
    if (!plan) return;
    if (!session) {
      flags.set('vant_next', 'checkout/' + key);
      showMsg(msgEl, 'Inicia sesión para que el plan quede asociado a tu cuenta. Redirigiendo…', 'info');
      setTimeout(() => go('login'), 900);
      return;
    }
    const current = (me && me.plan) || 'free';
    if (PLAN_RANK[current] >= PLAN_RANK[key]) return showMsg(msgEl, 'Ya tienes el plan ' + current.toUpperCase() + ', que incluye este.', 'info');
    btn.disabled = true; btn.textContent = 'Abriendo Stripe…';
    DB.rpc('log_web_event', { event_type: 'checkout_iniciado', data: { plan: key.toUpperCase(), precio: '€' + plan.price } });
    const url = new URL(plan.link);
    url.searchParams.set('client_reference_id', session.userId);
    if (session.user.email) url.searchParams.set('prefilled_email', session.user.email);
    url.searchParams.set('locale', 'es');
    try { window.top.location.href = url.toString(); } catch (_) { window.location.href = url.toString(); }
  }

  // ---------- torneos / RSVP ----------
  async function requirePlayer(msgEl) {
    if (!session) { flags.set('vant_next', window.location.hash.replace('#/', '')); showMsg(msgEl, 'Inicia sesión para continuar. Redirigiendo…', 'info'); setTimeout(() => go('login'), 900); return null; }
    if (!me) await loadMe();
    if (!me || !me.player) { showMsg(msgEl, 'Tu perfil de jugador aún no está listo. Recarga la página en unos segundos.', 'warning'); return null; }
    return me.player;
  }

  async function bindTournament(main, t) {
    const reg = main.querySelector('[data-register]');
    const unreg = main.querySelector('[data-unregister]');
    const msg = main.querySelector('[data-page-msg]');
    if (!reg) return;
    const mine = me && me.player && t.entries.some((e) => e.player && e.player.id === me.player.id);
    if (mine) { reg.hidden = true; unreg.hidden = false; }
    reg.addEventListener('click', async () => {
      const p = await requirePlayer(msg); if (!p) return;
      if (t.max_participants && t.entries.length >= t.max_participants) return showMsg(msg, 'El torneo está completo.', 'warning');
      reg.disabled = true;
      const { error } = await DB.from('tournament_entries').insert({ tournament_id: t.id, player_id: p.id, status: 'registered' });
      reg.disabled = false;
      if (error) return showMsg(msg, /duplicate|unique/i.test(error.message) ? 'Ya estás inscrito en este torneo.' : humanError(error), 'error');
      DB.rpc('log_web_event', { event_type: 'inscripcion_torneo', data: { torneo: t.name } });
      DB.invalidate('t:'); DB.invalidate('tournaments');
      showMsg(msg, 'Inscripción confirmada.', 'success');
      setTimeout(() => router(), 700);
    });
    unreg.addEventListener('click', async () => {
      const p = await requirePlayer(msg); if (!p) return;
      const { error } = await DB.from('tournament_entries').delete().eq('tournament_id', t.id).eq('player_id', p.id);
      if (error) return showMsg(msg, humanError(error), 'error');
      DB.invalidate('t:'); DB.invalidate('tournaments');
      showMsg(msg, 'Inscripción cancelada.', 'info');
      setTimeout(() => router(), 700);
    });
  }

  async function rsvp(eventId, btn, msgEl) {
    const p = await requirePlayer(msgEl); if (!p) return;
    btn.disabled = true;
    const { error } = await DB.from('event_rsvps').insert({ event_id: eventId, player_id: p.id, status: 'going' });
    btn.disabled = false;
    if (error && !/duplicate|unique/i.test(error.message)) return showMsg(msgEl, humanError(error), 'error');
    DB.rpc('log_web_event', { event_type: 'rsvp_evento', data: { evento: eventId } });
    btn.textContent = 'Confirmado'; btn.disabled = true;
    showMsg(msgEl, 'Asistencia confirmada.', 'success');
  }

  // ---------- cuenta ----------
  function renderAccount(root) {
    if (!session) {
      root.innerHTML = `<div class="login-page"><h1>Mi cuenta</h1><p class="login-sub">Necesitas iniciar sesión.</p><p class="login-switch"><a href="#/login" class="btn btn-primary">Iniciar sesión</a></p></div>`;
      return;
    }
    const u = session.user;
    const p = me && me.player;
    const plan = (me && me.plan) || 'free';
    const opt = (v, cur, label) => `<option value="${v}"${v === (cur || '') ? ' selected' : ''}>${label}</option>`;
    const steamAcc = me && me.steam;
    // Proveedores vinculados: identidades de Auth0 (si la Action las añade al token),
    // claim personalizado y la conexión con la que se ha iniciado sesión (prefijo del sub).
    const idList = [].concat(linkedIds || [], u.identities || [], u['https://vants.app/identities'] || [], u['https://api.vants.app/identities'] || []);
    const subProvider = String(u.sub || '').split('|')[0].toLowerCase();
    const isLinked = (k) => subProvider.includes(k) || idList.some((i) => String((i && (i.provider || i.connection)) || i || '').toLowerCase().includes(k));
    const hasGoogle = isLinked('google');
    const hasGithub = isLinked('github');
    const hasDiscord = Boolean(me && me.discord) || isLinked('discord');
    const hasKick = isLinked('kick');

    // Cargar módulo streamer si está disponible
    const streamerHtml = window.VantStreamer && p ? window.VantStreamer.renderStreamerCard(p) : '';
    const avatarHtml = window.VantStreamer && p ? window.VantStreamer.renderAvatarEditor(p) : '';
    const friendsHtml = window.VantStreamer && p ? window.VantStreamer.renderFriendSection([], [], p.id) : '';

    root.innerHTML = `
      <div class="account-head">
        <div class="player-avatar player-avatar-lg">${p && p.avatar_url ? `<img src="${esc(p.avatar_url)}" alt="">` : esc((displayName() || '?').slice(0, 2).toUpperCase())}</div>
        <div><h1>${esc(displayName())}</h1><div class="player-sub">${p ? '@' + esc(p.username) : ''}${u.email ? (p ? ' · ' : '') + esc(u.email) : ''}</div>
        ${p ? `<a class="link-inline" href="#/jugador/${encodeURIComponent(p.username)}">Ver perfil público</a>` : ''}
        <div class="account-quick"><a class="btn btn-sm ${plan !== 'free' ? 'btn-gold' : 'btn-secondary'}" href="#/zona">${plan !== 'free' ? 'Entrar a mi zona ' + esc(plan.toUpperCase()) : 'Desbloquear zona exclusiva'}</a>${me && me.adminRole ? '<a class="btn btn-sm btn-primary" href="#/admin">Panel admin</a>' : ''}</div></div>
      </div>
      <div class="auth-msg" data-auth-msg role="status" aria-live="polite" hidden></div>
      ${!p ? '<div class="auth-msg auth-msg-warning">Estamos creando tu perfil de jugador. Si no aparece en unos segundos, recarga la página.</div>' : ''}


      <div class="account-grid">
        <div class="account-item"><span>Plan</span><strong class="account-plan account-plan-${esc(plan)}">${esc(plan.toUpperCase())}</strong></div>
        <div class="account-item"><span>Correo</span><strong>${u.email ? (u.email_verified ? 'Verificado' : 'Pendiente de verificar') : 'Sin correo'}</strong></div>
        <div class="account-item"><span>Discord</span><strong>${hasDiscord ? 'Vinculado' + (me && me.discord && me.discord.discord_username ? ' · ' + esc(me.discord.discord_username) : '') : 'No vinculado'}</strong>
          ${hasDiscord ? '' : `<button type="button" class="btn btn-secondary btn-sm" data-link-discord>Vincular Discord</button>`}</div>
        <div class="account-item"><span>Google</span><strong>${hasGoogle ? 'Vinculado' : 'No vinculado'}</strong>
          ${hasGoogle ? '' : `<button type="button" class="btn btn-secondary btn-sm" data-link-google>Vincular Google</button>`}</div>
        <div class="account-item"><span>GitHub</span><strong>${hasGithub ? 'Vinculado' : 'No vinculado'}</strong>
          ${hasGithub ? '' : `<button type="button" class="btn btn-secondary btn-sm" data-link-github>Vincular GitHub</button>`}</div>
        <div class="account-item"><span>Kick</span><strong>${hasKick ? 'Vinculado' : 'No vinculado'}</strong>
          ${hasKick ? '' : `<button type="button" class="btn btn-secondary btn-sm" data-link-kick>Vincular Kick</button>`}</div>
        <div class="account-item account-item-steam"><span>Steam</span>
          ${steamAcc ? `<strong class="steam-acc">${steamAcc.avatar_url ? `<img src="${esc(steamAcc.avatar_url)}" alt="" width="22" height="22">` : ''}${steamAcc.profile_url ? `<a href="${esc(steamAcc.profile_url)}" target="_blank" rel="noopener noreferrer">${esc(steamAcc.display_name || steamAcc.handle)}</a>` : esc(steamAcc.display_name || steamAcc.handle)}</strong>`
          : `<strong>No vinculado</strong><span class="login-note">Steam se vinculará desde la app de escritorio.</span>`}</div>
      </div>


      ${plan !== 'free' && me && me.perks && me.perks.length ? `
      <h2 class="account-h2">Tus ventajas ${esc(plan.toUpperCase())}</h2>
      <div class="perk-grid">${me.perks.map((k) => `<div class="perk-card perk-${esc(k.tier)}"><span class="perk-tier">${esc(String(k.tier).toUpperCase())}</span><h3>${esc(k.title)}</h3><p>${esc(k.body || '')}</p>${k.cta_url && k.cta_label ? `<a class="link-inline" href="${esc(k.cta_url)}"${/^https?:/.test(k.cta_url) ? ' target="_blank" rel="noopener noreferrer"' : ''}>${esc(k.cta_label)}</a>` : ''}</div>`).join('')}</div>` : ''}

      ${p ? `
      <h2 class="account-h2">Perfil de competidor</h2>
      <form class="login-form account-form" data-form="perfil" novalidate>
        <div class="form-row">
          <div class="login-form-group"><label class="login-form-label" for="pf-dn">Nombre visible</label><input id="pf-dn" name="display_name" class="login-form-input" maxlength="32" value="${esc(p.display_name || '')}"></div>
          <div class="login-form-group"><label class="login-form-label" for="pf-country">País</label><input id="pf-country" name="country" class="login-form-input" maxlength="56" value="${esc(p.country || '')}"></div>
        </div>
        <div class="form-row">
          <div class="login-form-group"><label class="login-form-label" for="pf-region">Región</label><select id="pf-region" name="region" class="login-form-input">${opt('', p.region, '—')}${opt('EU', p.region, 'Europa')}${opt('LATAM', p.region, 'LATAM')}${opt('NA', p.region, 'Norteamérica')}${opt('BR', p.region, 'Brasil')}${opt('APAC', p.region, 'Asia-Pacífico')}</select></div>
          <div class="login-form-group"><label class="login-form-label" for="pf-game">Juego principal</label><select id="pf-game" name="main_game" class="login-form-input">${opt('', p.main_game, '—')}${opt('valorant', p.main_game, 'VALORANT')}${opt('cs2', p.main_game, 'Counter-Strike 2')}${opt('lol', p.main_game, 'League of Legends')}</select></div>
        </div>
        <div class="login-form-group"><label class="login-form-label" for="pf-bio">Bio</label><textarea id="pf-bio" name="bio" class="login-form-input" maxlength="280" rows="3">${esc((me.profile && me.profile.bio) || '')}</textarea></div>
        <div class="login-form-group"><label class="login-form-label" for="pf-vis">Visibilidad del perfil</label><select id="pf-vis" name="visibility" class="login-form-input">${opt('public', me.profile && me.profile.visibility, 'Público')}${opt('friends', me.profile && me.profile.visibility, 'Solo amigos')}${opt('private', me.profile && me.profile.visibility, 'Privado')}</select></div>
        <button type="submit" class="btn btn-secondary login-submit">Guardar perfil</button>
      </form>` : ''}


      <h2 class="account-h2">Mis torneos</h2>
      <div data-list="entries"><p class="login-note">Cargando…</p></div>
      <h2 class="account-h2">Compras y tickets</h2>
      <div data-list="purchases"><p class="login-note">Cargando…</p></div>
      <h2 class="account-h2">Soporte</h2>
      <div data-list="support"><p class="login-note">Cargando…</p></div>
      ${p ? `
      <details class="support-box"><summary>Abrir un ticket de soporte</summary>
        <div class="auth-msg" data-support-msg role="status" aria-live="polite" hidden></div>
        <form class="login-form" data-form="soporte" novalidate>
          <div class="login-form-group"><label class="login-form-label" for="st-cat">Categoría</label><select id="st-cat" name="category" class="login-form-input"><option value="cuenta">Cuenta y acceso</option><option value="pagos">Pagos</option><option value="torneos">Torneos</option><option value="ranked">Ranked</option><option value="otro">Otro</option></select></div>
          <div class="login-form-group"><label class="login-form-label" for="st-sub">Asunto</label><input id="st-sub" name="subject" class="login-form-input" maxlength="120" required></div>
          <div class="login-form-group"><label class="login-form-label" for="st-desc">Descripción</label><textarea id="st-desc" name="description" class="login-form-input" rows="4" maxlength="2000" required></textarea></div>
          <button type="submit" class="btn btn-secondary login-submit">Enviar ticket</button>
        </form>
      </details>` : ''}

      <div class="account-actions">
        ${plan !== 'elite' ? '<a href="#/precios" class="btn btn-primary">Mejorar plan</a>' : ''}
        <button type="button" class="btn btn-secondary" data-logout>Cerrar sesión</button>
      </div>`;
    loadAccountLists(root);
  }

  async function loadAccountLists(root) {
    if (!root || !me || !me.player) {
      root && root.querySelectorAll('[data-list]').forEach((el) => { el.innerHTML = '<p class="login-note">Disponible cuando tu perfil de jugador esté listo.</p>'; });
      return;
    }
    const pid = me.player.id;
    const set = (k, h) => { const el = root.querySelector(`[data-list="${k}"]`); if (el) el.innerHTML = h; };
    const [en, pu, tk, su] = await Promise.all([
      DB.from('tournament_entries').select('status, registered_at, tournament:tournaments(name, slug, starts_at)').eq('player_id', pid),
      DB.from('purchases').select('tier, amount_cents, currency, payment_status, paid_at, created_at').eq('player_id', pid).order('created_at', { ascending: false }),
      DB.from('tickets').select('tier, status, amount_cents, currency, purchased_at').eq('player_id', pid),
      DB.from('support_tickets').select('subject, status, category, created_at').eq('player_id', pid).order('created_at', { ascending: false }),
    ]);
    set('entries', (en.data || []).length ? `<ul class="account-purchases">${en.data.map((e) => e.tournament ? `<li><a href="#/torneo/${encodeURIComponent(e.tournament.slug)}">${esc(e.tournament.name)}</a><span>${esc(e.status)}</span><span>${e.tournament.starts_at ? new Date(e.tournament.starts_at).toLocaleDateString('es-ES') : '—'}</span><span></span></li>` : '').join('')}</ul>` : '<p class="login-note">No estás inscrito en ningún torneo. <a href="#/torneos">Ver torneos</a></p>');
    const buys = [...(pu.data || []).map((x) => ({ t: x.tier, a: x.amount_cents, c: x.currency, s: x.payment_status, d: x.paid_at || x.created_at })), ...(tk.data || []).map((x) => ({ t: x.tier, a: x.amount_cents, c: x.currency, s: x.status, d: x.purchased_at }))];
    set('purchases', buys.length ? `<ul class="account-purchases">${buys.map((b) => `<li><span>${esc(String(b.t || '').toUpperCase())}</span><span>${b.a != null ? (b.a / 100).toFixed(2) + ' ' + esc(String(b.c || 'eur').toUpperCase()) : '—'}</span><span>${esc(b.s === 'paid' || b.s === 'succeeded' ? 'Pagado' : b.s || '—')}</span><span>${b.d ? new Date(b.d).toLocaleDateString('es-ES') : ''}</span></li>`).join('')}</ul>` : '<p class="login-note">Aún no tienes compras.</p>');
    set('support', (su.data || []).length ? `<ul class="account-purchases">${su.data.map((s) => `<li><span>${esc(s.subject)}</span><span>${esc(s.category || '')}</span><span>${esc(s.status)}</span><span>${new Date(s.created_at).toLocaleDateString('es-ES')}</span></li>`).join('')}</ul>` : '<p class="login-note">No tienes tickets abiertos.</p>');
  }

  async function pollPlan(msgEl) {
    for (let i = 0; i < 10; i++) {
      await loadMe();
      if (me && me.plan !== 'free') { updateHeader(); return showMsg(msgEl, 'Pago confirmado. Tu plan ' + me.plan.toUpperCase() + ' ya está activo.', 'success'); }
      await new Promise((r) => setTimeout(r, 3000));
    }
    showMsg(msgEl, 'Stripe ha recibido tu pago. La activación puede tardar unos minutos; si no aparece, escríbenos a feispla@hotmail.com.', 'info');
  }

  // ---------- enlazado tras cada render ----------
  function bindForm(form, msg) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const h = HANDLERS[form.dataset.form];
      if (!h) return;
      showMsg(msg, '', 'info');
      setBusy(form, true);
      try { await h(form, msg); } catch (err) { showMsg(msg, humanError(err), 'error'); } finally { setBusy(form, false); }
    });
  }

  function afterRender(pageId) {
    const main = document.getElementById('main');
    if (!main) return;
    updateHeader();
    const msg = main.querySelector('[data-auth-msg]');
    if ((pageId === 'login' || pageId === 'registro') && session) showMsg(msg, 'Ya tienes la sesión iniciada como ' + displayName() + '.', 'info');
    const flash = flags.get('vant_flash');
    if (flash && msg) { const f = JSON.parse(flash); flags.del('vant_flash'); showMsg(msg, f.text, f.kind); }

    main.querySelectorAll('[data-oauth]').forEach((b) => b.addEventListener('click', () => oauth(b.dataset.oauth, msg)));
    if (pageId !== 'cuenta') main.querySelectorAll('form[data-form]').forEach((f) => bindForm(f, msg));
    main.querySelectorAll('[data-checkout]').forEach((b) => b.addEventListener('click', () => startCheckout(b.dataset.checkout, msg, b)));

    if (pageId === 'cuenta') {
      const root = main.querySelector('[data-account]');
      const draw = () => {
        renderAccount(root);
        const m = root.querySelector('[data-auth-msg]');
        const lo = root.querySelector('[data-logout]');
        if (lo) lo.addEventListener('click', () => logout());
        const ld = root.querySelector('[data-link-discord]');
        if (ld) ld.addEventListener('click', () => linkAccount('discord', m, draw));
        const lg = root.querySelector('[data-link-google]');
        if (lg) lg.addEventListener('click', () => linkAccount('google', m, draw));
        const lgh = root.querySelector('[data-link-github]');
        if (lgh) lgh.addEventListener('click', () => linkAccount('github', m, draw));
        const lk = root.querySelector('[data-link-kick]');
        if (lk) lk.addEventListener('click', () => linkAccount('kick', m, draw));
        const pf = root.querySelector('form[data-form="perfil"]'); if (pf) bindForm(pf, m);
        const st = root.querySelector('form[data-form="soporte"]'); if (st) bindForm(st, root.querySelector('[data-support-msg]'));
        // Bind streamer modules
        if (window.VantProfileExtras && window.VantProfileExtras.mountAccount) window.VantProfileExtras.mountAccount(root);
        if (window.VantStreamer && me && me.player) {
        }
        const fl = flags.get('vant_flash'); if (fl && m) { const f = JSON.parse(fl); flags.del('vant_flash'); showMsg(m, f.text, f.kind); }
      };
      if (session && !me) loadMe().then(draw); else draw();
      if (session) loadIdentities().then((ids) => { if (ids && ids.length > 1 && window.location.hash === '#/cuenta') draw(); });
      if (session && me && !me.player) setTimeout(() => loadMe().then(() => { if (window.location.hash === '#/cuenta') draw(); }), 2500);
    }

    if (pageId === 'precios' && session && !flags.get('vant_vp')) { flags.set('vant_vp', '1'); DB.rpc('log_web_event', { event_type: 'visita_precios', data: {} }); }
    if (pageId === 'checkout/exito') {
      if (session) pollPlan(msg); else showMsg(msg, 'Stripe ha recibido tu pago. Inicia sesión para ver tu plan activo.', 'info');
    }
  }

  // ---------- logout ----------
  async function logout() {
    DB.rpc('log_web_event', { event_type: 'cierre_sesion', data: {} }).catch(() => {});
    if (A0.client) {
      try {
        await A0.client.logout({ logoutParams: { returnTo: baseUrl() + '#/inicio' } });
      } catch (_) {}
    }
    session = null; me = null;
    if (DB.invalidate) DB.invalidate();
    updateHeader();
  }

  // ---------- arranque ----------
  async function boot() {
    if (!A0.client) { updateHeader(); return; }

    const query = window.location.search;
    if (query.includes('code=') && query.includes('state=')) {
      try {
        await A0.client.handleRedirectCallback();
        window.history.replaceState(null, '', baseUrl() + '#/cuenta');
      } catch (e) {
        flags.set('vant_flash', JSON.stringify({ text: humanError(e), kind: 'error' }));
        window.history.replaceState(null, '', baseUrl() + '#/login');
      }
    }

    await loadSession();
    if (session) await loadMe();
    updateHeader();

    const params = new URLSearchParams(window.location.search);
    const next = params.get('next');
    if (next) {
      window.history.replaceState(null, '', baseUrl() + '#/' + next);
    }
    if (typeof router === 'function') {
      const cur = window.location.hash.replace('#/', '').split('?')[0];
      if (['cuenta', 'login', 'registro', 'checkout/exito', 'admin', 'zona'].includes(cur) || cur.startsWith('torneo/')) router();
    }
  }

  // Interfaz pública (compatible con la app)
  window.VantAuth = {
    logout,
    isAdmin: () => Boolean(me && me.adminRole),
    get adminRole() { return me && me.adminRole; },
    plan: () => (me ? me.plan : 'free'),
    loadMe, afterRender, bindTournament, rsvp,
    client: () => A0.client,
    get session() { return session; },
    get me() { return me; },
  };

  document.addEventListener('DOMContentLoaded', async () => {
    await A0.initAuth0();
    await boot();
  });
})();
