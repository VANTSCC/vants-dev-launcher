/* VANTS GAMES — capa viva v5: login Auth0 + perfil real + pase persistido en Neon */
(function () {
  'use strict';
  var $ = function (s) { return document.querySelector(s); };
  var API = 'https://ep-autumn-scene-b4opu2ip.apirest.c-6.us-east-2.aws.neon.tech/neondb/rest/v1';
  var PROXY = 'https://br-sweet-shape-b42xhogj-vantsdata.compute.c-6.us-east-2.aws.neon.tech/';
  var RAIZ = 'https://feispla.github.io/Vants/';

  if (!window.VantAuth0) return;
  try { await window.VantAuth0.initAuth0(); } catch (e) { console.warn('[arena] Auth0 no disponible', e); return; }
  var A0 = window.VantAuth0.client;
  if (!A0) return;

  try {
    var q = new URLSearchParams(location.search);
    if (q.get('code') && q.get('state')) {
      await A0.handleRedirectCallback();
      history.replaceState({}, '', location.pathname + location.hash);
    } else if (q.get('error')) {
      if (typeof toast === 'function') { try { toast('Login no disponible: revisa las conexiones de Auth0 (' + q.get('error') + ')', 'info'); } catch (e2) {} }
      history.replaceState({}, '', location.pathname + location.hash);
    }
  } catch (e) {}

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(function (rs) { rs.forEach(function (r) { r.unregister(); }); }).catch(function () {});
  }
  if (window.caches && caches.keys) { caches.keys().then(function (ks) { ks.forEach(function (k) { caches.delete(k); }); }).catch(function () {}); }

  var user = null;
  try { user = await A0.getUser(); } catch (e) {}
  var esArchivo = location.protocol === 'file:';
  var loginBtn = document.getElementById('arenaLoginBtn');
  var accBtn = document.getElementById('accBtn');

  var ME = null;
  async function jwt() { return window.VantAuth0.getToken(); }

  async function cargarPerfilReal() {
    if (!user) return;
    try {
      var t = await jwt();
      if (!t) return;
      var rpc = await fetch(API + '/rpc/current_player_id', { method: 'POST', headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }, body: '{}' });
      var pidRaw = await rpc.json().catch(function () { return null; });
      var pid = Array.isArray(pidRaw) ? pidRaw[0] : pidRaw;
      pid = pid && (pid.current_player_id || pid.id) || pid;
      if (!pid) return;
      var pr = await fetch(PROXY + '?table=players&id=eq.' + pid + '&limit=1', { headers: { Accept: 'application/json' } });
      var rows = await pr.json();
      ME = { pid: pid, player: (rows && rows[0]) || null };
    } catch (e) { console.warn('[arena] perfil real no disponible', e); }
  }

  function chip(txt, color) { return '<span class="chip" style="color:' + color + ';border-color:' + color + '">' + txt + '</span>'; }

  function perfilRealHTML() {
    var p = ME.player;
    var stats = p.stats || {};
    var badges = '';
    if (p.verified) badges += chip('✓ VERIFICADO', '#4CC9F0') + ' ';
    if (p.role === 'owner') badges += chip('👑 OWNER', '#F5C044') + ' ';
    if (p.role === 'admin') badges += chip('🛡 ADMIN', '#4CC9F0') + ' ';
    if (p.role === 'streamer') badges += chip('STREAMER', '#9146FF') + ' ';
    var ava = p.avatar_url
      ? '<img src="' + p.avatar_url + '" alt="" style="width:74px;height:74px;border-radius:50%;object-fit:cover;border:2px solid #FF0D2E">'
      : '<div style="width:74px;height:74px;border-radius:50%;background:#1a1a20;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:22px">' + (p.username || 'V').slice(0, 2).toUpperCase() + '</div>';
    var inp = 'width:100%;background:#0d0d10;border:1px solid var(--line2,#303039);color:var(--ink,#EDEDE7);padding:11px 12px;font:500 12px var(--mono)';
    return '<div class="d-head"><span class="kicker">/// MI PERFIL · CUENTA REAL VANTS</span><button class="d-x" onclick="closeDrawer()"><i data-lucide="x"></i></button></div>' +
      '<div class="d-body">' +
      '<div style="display:flex;gap:16px;align-items:center;margin:18px 0 14px">' + ava +
      '<div><div style="font-weight:900;font-size:19px;text-transform:uppercase">' + (p.display_name || p.username || 'JUGADOR') + '</div>' +
      '<div style="font:600 10px/1.6 var(--mono);color:var(--mut)">@' + (p.username || '') + ' · MIEMBRO VANTS</div></div></div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">' + (badges || '<span style="color:var(--dim);font-size:11px">Sin insignias todavía — el dueño las asigna desde el panel admin.</span>') + '</div>' +
      '<p class="d-sec">MIS DATOS</p>' +
      '<input id="rp-pais" placeholder="País" value="' + (p.country || '') + '" style="' + inp + 'margin-bottom:10px">' +
      '<input id="rp-region" placeholder="Región (LATAM, EU…)" value="' + (p.region || '') + '" style="' + inp + 'margin-bottom:10px">' +
      '<input id="rp-dc" placeholder="Tu tag de Discord (usuario#1234)" value="' + (stats.discord_tag || '') + '" style="' + inp + 'margin-bottom:12px">' +
      '<button class="btn btn-sm" id="rp-guardar" style="width:100%;justify-content:center;background:#FF0D2E;color:#fff;border:0;font:700 11px var(--mono);padding:12px;cursor:pointer;letter-spacing:.08em">GUARDAR MIS DATOS</button>' +
      '<div id="rp-msg" style="font:500 11px/1.6 var(--mono);color:var(--mut);margin-top:10px;white-space:pre-wrap"></div>' +
      '<p class="d-sec">CUENTA</p>' +
      '<div style="font:500 11px/1.8 var(--mono);color:var(--mut)">Rol en VANTS: <b style="color:var(--ink)">' + (p.role ? p.role.toUpperCase() : 'JUGADOR') + '</b><br>Verificado: <b style="color:' + (p.verified ? 'var(--grn)' : 'var(--dim)') + '">' + (p.verified ? 'SÍ' : 'NO') + '</b><br>Correo: ' + (user.email || '—') + '</div>' +
      '<button class="btn btn-ghost btn-sm" id="rp-salir" style="margin-top:18px;width:100%;justify-content:center;background:none;border:1px solid var(--line2);color:var(--ink);font:700 10px var(--mono);padding:11px;cursor:pointer;letter-spacing:.1em">CERRAR SESIÓN</button>' +
      '</div>';
  }

  function renderPerfilReal() {
    openDrawer(perfilRealHTML());
    if (window.lucide) lucide.createIcons();
    var p = ME.player;
    var msg = document.getElementById('rp-msg');
    var g = document.getElementById('rp-guardar');
    if (g) g.onclick = async function () {
      g.disabled = true; g.textContent = 'GUARDANDO…';
      try {
        var t = await jwt();
        var statsNuevos = Object.assign({}, p.stats || {}, { discord_tag: $('#rp-dc').value.trim() });
        var r = await fetch(API + '/players?id=eq.' + ME.pid, {
          method: 'PATCH',
          headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' },
          body: JSON.stringify({ country: $('#rp-pais').value.trim(), region: $('#rp-region').value.trim(), stats: statsNuevos }),
        });
        if (r.ok) {
          p.country = $('#rp-pais').value.trim(); p.region = $('#rp-region').value.trim(); p.stats = statsNuevos;
          g.textContent = '✓ GUARDADO EN NEON';
          if (msg) msg.textContent = '';
          if (typeof toast === 'function') { try { toast('Perfil actualizado en Neon'); } catch (e3) {} }
        } else {
          var j = await r.json().catch(function () { return {}; });
          if (msg) msg.textContent = 'La base rechazó el guardado (HTTP ' + r.status + '): ' + (j.message || '') + '\nPlan B: UPDATE players SET country=…, region=… WHERE id=\'' + ME.pid + '\'; en el SQL Editor de Neon.';
          g.textContent = 'ERROR — ver mensaje';
        }
      } catch (e) { if (msg) msg.textContent = 'Error de red: ' + e; }
      setTimeout(function () { g.disabled = false; g.textContent = 'GUARDAR MIS DATOS'; }, 1800);
    };
    var s = document.getElementById('rp-salir');
    if (s) s.onclick = function () { A0.logout({ logoutParams: { returnTo: RAIZ } }); };
  }

  function renderCrearPerfil(nombreSugerido) {
    var inp = 'width:100%;background:#0d0d10;border:1px solid var(--line2,#303039);color:var(--ink,#EDEDE7);padding:11px 12px;font:500 12px var(--mono)';
    openDrawer('<div class="d-head"><span class="kicker">/// MI PERFIL · PRIMERA VEZ</span><button class="d-x" onclick="closeDrawer()"><i data-lucide="x"></i></button></div>' +
      '<div class="d-body">' +
      '<p style="font:500 12px/1.7 var(--mono);color:var(--mut);margin:16px 0">Crea tu jugador oficial en la base de VANTS. Se guarda en Neon y queda ligado a tu cuenta.</p>' +
      '<input id="cp-user" placeholder="Tu usuario (nick)" value="' + (nombreSugerido || '') + '" style="' + inp + 'margin-bottom:10px">' +
      '<input id="cp-pais" placeholder="País" style="' + inp + 'margin-bottom:10px">' +
      '<input id="cp-region" placeholder="Región (LATAM, EU…)" style="' + inp + 'margin-bottom:12px">' +
      '<button class="btn btn-sm" id="cp-crear" style="width:100%;justify-content:center;background:#FF0D2E;color:#fff;border:0;font:700 11px var(--mono);padding:12px;cursor:pointer;letter-spacing:.08em">CREAR MI PERFIL EN NEON</button>' +
      '<div id="cp-msg" style="font:500 11px/1.6 var(--mono);color:var(--mut);margin-top:12px;white-space:pre-wrap"></div>' +
      '</div>');
    if (window.lucide) lucide.createIcons();
    var c = document.getElementById('cp-crear');
    var msg = document.getElementById('cp-msg');
    c.onclick = async function () {
      c.disabled = true; c.textContent = 'CREANDO…';
      try {
        var t = await jwt();
        var r = await fetch(API + '/players', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: $('#cp-user').value.trim().toLowerCase().replace(/\s+/g, '_'), display_name: $('#cp-user').value.trim(), country: $('#cp-pais').value.trim(), region: $('#cp-region').value.trim(), avatar_url: (user && user.picture) || null }),
        });
        if (r.ok) {
          if (msg) msg.innerHTML = '<span class="ok">✓ Perfil creado. Cargando…</span>';
          await cargarPerfilReal();
          if (ME && ME.player) renderPerfilReal();
        } else {
          var j = await r.json().catch(function () { return {}; });
          if (msg) msg.textContent = 'La base rechazó la creación (HTTP ' + r.status + '): ' + (j.message || '') + '\nPlan B: crea el jugador en el SQL Editor de Neon.';
          c.disabled = false; c.textContent = 'REINTENTAR';
        }
      } catch (e) { if (msg) msg.textContent = 'Error de red: ' + e; c.disabled = false; }
    };
  }

  if (accBtn) accBtn.addEventListener('click', function (e) {
    if (!user) return;
    e.stopImmediatePropagation();
    if (ME && ME.player) { renderPerfilReal(); return; }
    openDrawer('<div class="d-head"><span class="kicker">/// MI PERFIL</span><button class="d-x" onclick="closeDrawer()"><i data-lucide="x"></i></button></div><div class="d-body"><p style="font:500 12px/1.7 var(--mono);color:var(--mut);margin:18px 0">Cargando tu perfil real desde Neon…</p></div>');
    (async function () {
      await cargarPerfilReal();
      if (ME && ME.player) renderPerfilReal();
      else renderCrearPerfil(String((user && (user.name || user.email)) || '').split('@')[0]);
    })();
  }, { capture: true });

  await cargarPerfilReal();

  var OWNER_EMAILS = ['geimerjhoan099@gmail.com', 'admin@vants.games'];
  var esOwner = !!(user && user.email && OWNER_EMAILS.indexOf(String(user.email).toLowerCase()) !== -1);

  if (user) {
    if (loginBtn) loginBtn.hidden = true;
    if (accBtn) accBtn.hidden = false;
    var nm = String(user.name || user.nickname || user.email || 'JUGADOR').split('@')[0].toUpperCase();
    var ava = document.getElementById('accAva');
    var accName = document.getElementById('accName');
    var dot = document.getElementById('accLive');
    if (ava) ava.textContent = nm.slice(0, 2);
    if (accName) accName.textContent = esOwner ? 'OWNER' : nm.slice(0, 12);
    if (dot) dot.style.display = 'none';
    if (typeof toast === 'function') { try { toast(esOwner ? '👑 Modo DUEÑO activo — panel admin desbloqueado' : 'Sesión iniciada como ' + nm); } catch (e3) {} }

    if (esOwner) {
      (async function () {
        try {
          var pr = await fetch(PROXY + '?table=players&username=eq.geimerpedroza&limit=1', { headers: { Accept: 'application/json' } });
          var rows = await pr.json();
          window.VANTS_ME = { pid: rows && rows[0] ? rows[0].id : null, player: (rows && rows[0]) || null, owner: true };
        } catch (e) { window.VANTS_ME = { pid: null, player: null, owner: true }; }
        try {
          if (typeof state !== 'undefined') { state.passOwned = true; state.isPro = true; if (typeof renderPass === 'function') renderPass(); }
        } catch (e) {}
        var pl = document.getElementById('panelLink');
        if (pl) { pl.hidden = false; pl.style.display = ''; }
      })();
    }
  } else if (loginBtn && !esArchivo) {
    if (accBtn) accBtn.hidden = true;
    loginBtn.hidden = false;
    loginBtn.addEventListener('click', function () {
      loginBtn.disabled = true;
      A0.loginWithRedirect({ authorizationParams: { redirect_uri: location.origin + location.pathname.replace(/[^/]*$/, ''), scope: 'openid profile email' } }).catch(function () { loginBtn.disabled = false; });
    });
  }

  var DB = window.VantDB;
  if (!DB) return;
  function liveBadge(on, n) {
    var el = document.getElementById('liveDataBadge');
    if (!el) return;
    el.innerHTML = on ? '<span class="dot"></span>DATOS EN VIVO · NEON · ' + n + ' TORNEOS' : 'DATOS DE DEMOSTRACIÓN';
    el.classList.toggle('on', !!on);
  }
  try {
    var rows = await DB.tournaments();
    if (Array.isArray(rows) && rows.length) {
      var list = rows.map(function (t) {
        var d = t.starts_at ? new Date(t.starts_at) : null;
        return { id: String(t.slug || t.id), day: d ? String(d.getDate()).padStart(2, '0') : '—', mon: d ? d.toLocaleString('es-ES', { month: 'short' }).replace('.', '').toUpperCase() : '', name: t.name || 'Torneo VANTS', tier: String(t.tier || 'open').toUpperCase(), tags: [String(t.status || 'abierto').toUpperCase()], prize: Number(t.prize_pool) || 0, slots: Number(t.max_participants) || 0, filled: Number(t.current_participants) || 0, fee: 0 };
      });
      ['valorant', 'cs2'].forEach(function (g) { if (DATA[g]) DATA[g].tournaments = list; });
      if (typeof renderTournaments === 'function') renderTournaments();
      liveBadge(true, list.length);
    } else { liveBadge(false, 0); }
  } catch (e) { console.warn('[arena] Neon no disponible', e); liveBadge(false, 0); }

  /* -------- PASE: progreso real en Neon (pass_estado / pass_reclamar) -------- */
  try {
    if (user) {
      var t = await jwt();
      if (t) {
        var re = await fetch(API + '/rpc/pass_estado', { method: 'POST', headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }, body: '{}' });
        var e = await re.json();
        if (e && e.nivel != null) {
          Object.assign(state, { lvl: e.nivel, xp: e.xp, xpMax: e.xp_max, claimed: e.reclamadas || [], passOwned: !!e.premium });
          if (typeof renderPass === 'function') renderPass();
          var pc = document.getElementById('paseNeonChip');
          if (pc) { pc.textContent = 'PROGRESO GUARDADO EN NEON · NIVEL ' + e.nivel; pc.classList.add('on'); }
        }
      }
    }
  } catch (e) { console.warn('[arena] pase Neon', e); }

  if (typeof claimReward === 'function') {
    claimReward = async function (i) {
      var rw = PASS_REWARDS[i];
      var key = rw.lvl + (rw.prem ? 'p' : 'f');
      try {
        var t = await jwt();
        var r = await fetch(API + '/rpc/pass_reclamar', { method: 'POST', headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_key: key }) });
        var res = await r.json().catch(function () { return {}; });
        if (res.ok) {
          state.claimed = res.reclamadas || state.claimed;
          state.xp = res.xp; state.lvl = res.nivel; state.xpMax = res.xp_max;
          if (typeof passSave === 'function') passSave();
          if (typeof renderPass === 'function') renderPass();
          if (typeof openReward === 'function') openReward(i);
          if (typeof toast === 'function') { try { toast(res.xp_ganado > 0 ? '+' + res.xp_ganado + ' XP acreditados al pase' : 'Recompensa reclamada: ' + rw.name); } catch (e5) {} }
        } else if (typeof toast === 'function') { try { toast('No se pudo reclamar: ' + (res.error || 'error'), 'info'); } catch (e5) {} }
      } catch (e) { if (typeof toast === 'function') { try { toast('Error de red al reclamar', 'info'); } catch (e6) {} } }
    };
  }
})();
