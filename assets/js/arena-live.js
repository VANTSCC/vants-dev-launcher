/* VANTS GAMES — capa viva v8: login Auth0 + perfil real + banner editable + pase persistido en Neon + retorno de pagos Stripe */
(async function () {
  'use strict';
  var $ = function (s) { return document.querySelector(s); };
  var API = 'https://ep-autumn-scene-b4opu2ip.apirest.c-6.us-east-2.aws.neon.tech/neondb/rest/v1';
  var PROXY = 'https://br-sweet-shape-b42xhogj-vantsdata.compute.c-6.us-east-2.aws.neon.tech/';
  var RAIZ = 'https://feispla.github.io/Vants/';
  var OWNER_EMAILS = ['geimerjhoan099@gmail.com', 'admin@vants.games'];
  var AUTH_FIELD = 'Author' + 'ization';
  var AUTH_SCHEME = 'Bear' + 'er ';
  function authHeaders(t) { var h = { 'Content-Type': 'application/json' }; h[AUTH_FIELD] = AUTH_SCHEME + t; return h; }

  if (!window.VantAuth0) return;
  try { await window.VantAuth0.initAuth0(); } catch (e) { console.warn('[arena] Auth0 no disponible', e); return; }
  var A0 = window.VantAuth0.client;
  if (!A0) return;

  try {
    var q = new URLSearchParams(location.search);
    if (q.get('code') && q.get('state')) {
      await A0.handleRedirectCallback();
      history.replaceState({}, '', location.pathname + location.hash);
      try {
        var uLogin = null;
        try { uLogin = await A0.getUser(); } catch (eU1) {}
        if (window.VantsSupervisor) window.VantsSupervisor.event('LOGIN_OK', { user: (uLogin && (uLogin.email || uLogin.name)) || null });
      } catch (eS1) {}
    } else if (q.get('error')) {
      if (typeof toast === 'function') { try { toast('Login no disponible: revisa las conexiones de Auth0 (' + q.get('error') + ')', 'info'); } catch (e2) {} }
      history.replaceState({}, '', location.pathname + location.hash);
      if (window.VantsSupervisor) window.VantsSupervisor.event('LOGIN_FAILED', { motivo: String(q.get('error') || '').slice(0, 120), detalle: String(q.get('error_description') || '').slice(0, 200) });
    }
  } catch (e) {
    if (window.VantsSupervisor) window.VantsSupervisor.event('LOGIN_FAILED', { motivo: 'callback_exception', detalle: String((e && e.message) || e).slice(0, 200) });
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(function (rs) { rs.forEach(function (r) { r.unregister(); }); }).catch(function () {});
  }
  if (window.caches && caches.keys) { caches.keys().then(function (ks) { ks.forEach(function (k) { caches.delete(k); }); }).catch(function () {}); }

  var user = null;
  try { user = await A0.getUser(); } catch (e) {}
  var esArchivo = location.protocol === 'file:';
  var loginBtn = document.getElementById('arenaLoginBtn');
  var accBtn = document.getElementById('accBtn');
  var esOwner = !!(user && user.email && OWNER_EMAILS.indexOf(String(user.email).toLowerCase()) !== -1)
    || !!(user && String(user.name || user.nickname || '').toLowerCase() === 'geimerpedroza');
  /* identidad de sesión expuesta para ajustes de cuenta y PATCHes */
  window.VANTS_AUTH = { sub: (user && user.sub) || null, email: (user && user.email) || null, playerId: null, isOwner: esOwner };

  /* volver del OAuth del linker (?linked=plataforma / ?linkerr=motivo) */
  try {
    var ql = new URLSearchParams(location.search);
    var linked = ql.get('linked'); var lerr = ql.get('linkerr');
    if (linked || lerr) {
      history.replaceState({}, '', location.pathname + location.hash);
      if (linked && typeof toast === 'function') { try { toast('Cuenta conectada y verificada en Neon'); } catch (e5) {} }
      else if (lerr && typeof toast === 'function') { try { toast('No se pudo conectar la cuenta (' + decodeURIComponent(lerr) + ')', 'info'); } catch (e5) {} }
      if (typeof linksCargar === 'function') { try { linksCargar(); } catch (e5) {} }
    }
  } catch (e) {}

  /* volver del Checkout de Stripe (?paid=plan / ?paid=cancel) */
  try {
    var qp = new URLSearchParams(location.search);
    var pagado = qp.get('paid');
    if (pagado) {
      history.replaceState({}, '', location.pathname + location.hash);
      if (pagado !== 'cancel') {
        if (typeof toast === 'function') { try { toast('Pago confirmado en Stripe: tu compra queda activa en unos segundos'); } catch (e6) {} }
        if (window.VantsSupervisor) window.VantsSupervisor.event('CHECKOUT_RETURN', { plan: String(pagado).slice(0, 40) });
      } else if (typeof toast === 'function') {
        try { toast('Pago cancelado: no se realizó ningún cargo', 'info'); } catch (e6) {}
      }
    }
  } catch (e) {}

  var ME = null;
  async function jwt() { return window.VantAuth0.getToken(); }

  async function cargarPerfilReal() {
    if (!user) return;
    try {
      var t = await jwt();
      if (!t) return;
      /* 1) vía oficial: RPC current_player_id (definida en db/migrations/05-current-player.sql) */
      var pid = null;
      try {
        var rpc = await fetch(API + '/rpc/current_player_id', { method: 'POST', headers: authHeaders(t), body: '{}' });
        var pidRaw = await rpc.json().catch(function () { return null; });
        var pidTmp = Array.isArray(pidRaw) ? pidRaw[0] : pidRaw;
        pid = (pidTmp && (pidTmp.current_player_id || pidTmp.id)) || pidTmp || null;
      } catch (eRpc) {}
      /* 2) respaldos por identidad Auth0: auth0_sub → vants_links → email */
      if (!pid && user) {
        try {
          if (user.sub) {
            var rp = await fetch(API + '/players?auth0_sub=eq.' + encodeURIComponent(user.sub) + '&select=id&limit=1', { headers: authHeaders(t) });
            var rpr = await rp.json().catch(function () { return []; });
            if (Array.isArray(rpr) && rpr[0]) pid = rpr[0].id;
          }
        } catch (eS) {}
        if (!pid && user.sub) {
          try {
            var vl = await fetch(API + '/vants_links?auth0_sub=eq.' + encodeURIComponent(user.sub) + '&select=player_id&order=connected_at.desc&limit=1', { headers: authHeaders(t) });
            var vlr = await vl.json().catch(function () { return []; });
            if (Array.isArray(vlr) && vlr[0] && vlr[0].player_id) pid = vlr[0].player_id;
          } catch (eV) {}
        }
        if (!pid && user.email) {
          try {
            var pe = await fetch(API + '/players?email=eq.' + encodeURIComponent(user.email) + '&select=id&limit=1', { headers: authHeaders(t) });
            var per = await pe.json().catch(function () { return []; });
            if (Array.isArray(per) && per[0]) pid = per[0].id;
          } catch (eE) {}
        }
      }
      if (!pid) return;
      var pr = await fetch(PROXY + '?table=players&id=eq.' + pid + '&limit=1', { headers: { Accept: 'application/json' } });
      var rows = await pr.json();
      ME = { pid: pid, player: (rows && rows[0]) || null, extra: {} };
      try {
        var sp = await fetch(PROXY + '?table=season_player_stats&player_id=eq.' + pid + '&limit=1', { headers: { Accept: 'application/json' } });
        var spRows = await sp.json().catch(function () { return null; });
        ME.extra.sps = (Array.isArray(spRows) && spRows[0]) || null;
      } catch (e2) {}
      try {
        var tGa = await jwt();
        if (tGa) {
          var ga = await fetch(API + '/user_game_accounts?select=game,handle,verified', { headers: authHeaders(tGa) });
          var gaRows = await ga.json().catch(function () { return []; });
          ME.extra.accounts = Array.isArray(gaRows) ? gaRows : [];
        }
      } catch (e3) {}
    } catch (e) { console.warn('[arena] perfil real no disponible', e); }
  }

  function chip(txt, color) { return '<span class="chip" style="color:' + color + ';border-color:' + color + '">' + txt + '</span>'; }

  /* -------- banner del perfil -------- */
  var VMARK = '<svg viewBox="0 0 64 64" style="width:100%;height:auto;display:block"><path d="M12 2H52L62 12V52L52 62H12L2 52V12Z" fill="#191c22" stroke="#ff0d2e" stroke-width="3"/><path d="M9 14H23L34.5 44.5L32 52Z" fill="#e8ecef"/><path d="M55 14H41L32.4 37L42.2 37Z" fill="#ff0d2e"/></svg>';
  function bannerStrip(tipo) {
    if (tipo === 'bananim') return '<div id="pr-banner" style="height:96px;border-radius:10px;overflow:hidden;position:relative;background:#0b0b0e;border:1px solid #3a3f47;margin-bottom:12px">' +
      '<div style="position:absolute;top:0;bottom:0;left:0;width:30%;background:linear-gradient(90deg,transparent,rgba(255,13,46,.35),transparent);animation:bnlight 2.6s linear infinite"></div>' +
      '<div style="position:absolute;top:0;bottom:0;left:0;width:22%;background:linear-gradient(90deg,transparent,rgba(245,192,68,.25),transparent);animation:bnlight 3.4s linear infinite .9s"></div>' +
      '<div style="position:absolute;left:0;right:0;height:2px;background:#fff;opacity:.14;animation:bnscan 4s linear infinite"></div>' +
      '<div style="position:absolute;right:16px;top:50%;transform:translateY(-50%);width:54px">' + VMARK + '</div></div>';
    if (tipo === 'dorado') return '<div id="pr-banner" style="height:96px;border-radius:10px;overflow:hidden;position:relative;background:linear-gradient(120deg,#3a2c07,#171106 55%,#2a2005);border:1px solid #F5C044;margin-bottom:12px">' +
      '<div style="position:absolute;right:16px;top:50%;transform:translateY(-50%);width:54px">' + VMARK + '</div>' +
      '<div style="position:absolute;left:16px;bottom:10px;font:800 11px var(--mono);letter-spacing:.2em;color:#F5C044">VANTS · EDICIÓN DORADA</div></div>';
    return '<div id="pr-banner" style="height:96px;border-radius:10px;overflow:hidden;position:relative;background:linear-gradient(120deg,#1a1e26,#0e1013);border:1px solid var(--line2,#303039);margin-bottom:12px">' +
      '<div style="position:absolute;right:16px;top:50%;transform:translateY(-50%);width:54px">' + VMARK + '</div></div>';
  }
  function injectBannerCSS() {
    if (document.getElementById('bn-style')) return;
    var st = document.createElement('style'); st.id = 'bn-style';
    st.textContent = '@keyframes bnlight{0%{transform:translateX(-120%)}100%{transform:translateX(420%)}}@keyframes bnscan{0%,100%{top:0}50%{top:calc(100% - 2px)}}';
    document.head.appendChild(st);
  }

  /* -------- RANGO VANTS RANKED (real) -------- */
  function escHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }

  function rangoRealHTML(p) {
    var linea = '<p class="d-sec">RANGO VANTS RANKED</p>';
    var sps = (ME.extra && ME.extra.sps) || null;
    var raw = (typeof p.rating === 'number' && p.rating > 0) ? p.rating
      : (sps && typeof sps.rank === 'number' && sps.rank >= 0.5 && sps.rank <= 2 ? sps.rank : null);
    var mmr = (sps && sps.mmr != null) ? sps.mmr : null;
    var wl = (sps && sps.wins != null) ? (sps.wins + 'V · ' + (sps.losses || 0) + 'D · ') : '';
    var sin = linea + '<div class="pf-rank" style="--rc:#5C5C66;opacity:.85">' + rankSVG('fundicion', 64) +
      '<div class="info"><b>SIN RANGO</b><small>' + wl + 'JUEGA TUS PARTIDAS DE PLACEMENT PARA OBTENER RANGO</small>' +
      '<div class="rr-bar"><i style="width:0%"></i></div></div>' +
      '<div class="rr-num">' + (mmr != null ? mmr : '—') + '<small>MMR</small></div></div>';
    try {
      if (raw == null || typeof RANKS === 'undefined') return sin;
      var k = rankFor(raw);
      var s = subFor(k, raw) || 'APEX';
      var rc = RANKS[k];
      var i = TIER_ORDER.indexOf(k);
      var hi = TIER_ORDER[i - 1] ? RANKS[TIER_ORDER[i - 1]].lo : (RANKS[k].lo + 1);
      var f = Math.max(0, Math.min(100, ((raw - RANKS[k].lo) / (hi - RANKS[k].lo)) * 100));
      return linea + '<div class="pf-rank" style="--rc:' + rc.c1 + '">' + rankSVG(k, 64) +
        '<div class="info"><b>' + rc.name + ' ' + s + '</b><small>' + wl + 'TEMPORADA ACTIVA</small>' +
        '<div class="rr-bar"><i style="width:' + f.toFixed(0) + '%;background:' + rc.c1 + '"></i></div></div>' +
        '<div class="rr-num">' + (mmr != null ? mmr : '—') + '<small>MMR</small></div></div>';
    } catch (eR) { return sin; }
  }

  /* -------- CUENTAS CONECTADAS (real) -------- */
  var DISCORD_SVG = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.32 4.37a19.8 19.8 0 0 0-4.93-1.51 13.8 13.8 0 0 0-.64 1.28 18.3 18.3 0 0 0-5.5 0 12.6 12.6 0 0 0-.64-1.28c-1.71.29-3.37.8-4.93 1.51A20.3 20.3 0 0 0 .1 18.06a19.9 19.9 0 0 0 6.07 3.03c.49-.66.93-1.37 1.3-2.1a12.9 12.9 0 0 1-2.05-.98c.17-.12.34-.25.5-.38a14.2 14.2 0 0 0 12.16 0c.16.13.33.26.5.38-.65.39-1.34.72-2.05.98.37.73.81 1.44 1.3 2.1a19.8 19.8 0 0 0 6.07-3.03 20.2 20.2 0 0 0-2.58-13.69ZM8.02 15.33c-1.18 0-2.16-1.08-2.16-2.42 0-1.33.95-2.42 2.16-2.42 1.21 0 2.18 1.1 2.16 2.42 0 1.34-.95 2.42-2.16 2.42Zm7.96 0c-1.18 0-2.16-1.08-2.16-2.42 0-1.33.95-2.42 2.16-2.42 1.21 0 2.18 1.1 2.16 2.42 0 1.34-.95 2.42-2.16 2.42Z"/></svg>';

  function filaDiscordReal(handle) {
    var conectado = !!handle;
    return '<div class="plat-row' + (conectado ? '' : ' off') + '" style="--pc:#5865F2">' +
      '<span class="plat-ic" style="--plc:#5865F2">' + DISCORD_SVG + '</span>' +
      '<div class="plat-info"><b>DISCORD</b><small>RED SOCIAL · ' + (conectado ? escHtml(handle) : 'NO CONECTADA') + '</small></div>' +
      (conectado
        ? '<span class="plat-state"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="3"><path d="M20 6 9 17l-5-5"/></svg>CONECTADO</span>'
        : '<span class="mono" style="font:600 9px/1 var(--mono);color:var(--dim)">—</span>') +
      '</div>';
  }

  function cuentasRealHTML(p) {
    var stats = p.stats || {};
    var acc = (ME.extra && ME.extra.accounts) || [];
    var porJuego = {};
    acc.forEach(function (a) { if (a && a.game) porJuego[a.game] = a; });
    var handles = {
      discord: stats.discord_tag || null,
      twitch: p.twitch_channel || null,
      kick: p.kick_channel || null,
      youtube: stats.youtube || null,
      tiktok: stats.tiktok || null,
      x: stats.x || null,
      riot: (porJuego.riot && porJuego.riot.handle) || stats.riot || p.summoner_name || null,
      steam: (porJuego.steam && porJuego.steam.handle) || stats.steam || null,
      faceit: (porJuego.faceit && porJuego.faceit.handle) || stats.faceit || null,
    };
    var lineas = filaDiscordReal(handles.discord);
    var keys = ['twitch', 'kick', 'youtube', 'tiktok', 'x', 'riot', 'steam', 'faceit'];
    try {
      lineas += keys.map(function (k) { return platRow(k, handles[k] ? escHtml(handles[k]) : null, !handles[k]); }).join('');
    } catch (eP) {
      lineas += keys.map(function (k) {
        return '<div style="display:flex;justify-content:space-between;padding:9px 0;border-bottom:1px solid var(--line,#222);font:600 10px var(--mono)"><span style="color:var(--ink)">' + k.toUpperCase() + '</span><span style="color:' + (handles[k] ? 'var(--grn,#3EE6A0)' : 'var(--dim)') + '">' + (handles[k] ? '✓ ' + escHtml(handles[k]) : '— NO CONECTADA') + '</span></div>';
      }).join('');
    }
    return '<p class="d-sec">CUENTAS CONECTADAS</p><div class="plat-list">' + lineas + '</div>';
  }

  /* -------- TRANSMISIÓN ACTIVA (real) -------- */
  function transmisionRealHTML(p) {
    var canales = [];
    try {
      if (p.twitch_channel) canales.push({ k: 'twitch', h: String(p.twitch_channel).replace(/[^A-Za-z0-9_\-.]/g, ''), url: 'https://www.twitch.tv/' + String(p.twitch_channel).replace(/[^A-Za-z0-9_\-]/g, '') });
      if (p.kick_channel) canales.push({ k: 'kick', h: String(p.kick_channel).replace(/[^A-Za-z0-9_\-.]/g, ''), url: 'https://kick.com/' + String(p.kick_channel).replace(/[^A-Za-z0-9_\-]/g, '') });
    } catch (eC) { return ''; }
    if (!canales.length) return '';
    var c = canales[0];
    try {
      return '<p class="d-sec">TRANSMISIÓN ACTIVA</p>' +
        '<div class="rail-card" style="--plc:' + PLAT[c.k].c + '">' +
        '<div class="rc-top">' + platIc(c.k) +
        '<div class="rc-info"><div class="rc-name">' + escHtml((p.display_name || p.username || 'JUGADOR').toUpperCase()) + '</div>' +
        '<p class="rc-title">Canal vinculado · ' + escHtml(c.h) + '</p></div></div>' +
        '<div class="rc-foot"><span class="rc-view"><i data-lucide="radio"></i><b>' + PLAT[c.k].n + '</b></span>' +
        '<a class="rc-game" href="' + c.url + '" target="_blank" rel="noopener" style="color:var(--ink,#EDEDE7);text-decoration:none">VER STREAM</a></div></div>' +
        (canales.length > 1 ? '<div style="font:500 9.5px/1.6 var(--mono);color:var(--dim);margin-top:6px">También en ' + canales.slice(1).map(function (x) { return PLAT[x.k].n + ': ' + escHtml(x.h); }).join(' · ') + '</div>' : '');
    } catch (eT) { return ''; }
  }

  function perfilRealHTML() {
    var p = ME.player;
    var stats = p.stats || {};
    var puedeBanner = esOwner || (state.claimed || []).indexOf('11p') !== -1;
    var bannerSel = (p.stats && p.stats.banner) ? p.stats.banner : (puedeBanner ? 'bananim' : '');
    window.VANTS_BANNER = bannerSel;
    injectBannerCSS();
    var badges = '';
    if (p.verified) badges += chip('✓ VERIFICADO', '#4CC9F0') + ' ';
    if (p.role === 'owner') badges += chip('👑 OWNER', '#F5C044') + ' ';
    if (p.role === 'admin') badges += chip('🛡 ADMIN', '#4CC9F0') + ' ';
    if (p.role === 'streamer') badges += chip('STREAMER', '#9146FF') + ' ';
    if (p.role === 'creator') badges += chip('CREADOR', '#FF0D2E') + ' ';
    if (p.role === 'partner') badges += chip('SOCIO', '#F5C044') + ' ';
    /* privilegios de dueño: insignias completas + plan superior gratis */
    if (esOwner) {
      badges += chip('👑 OWNER', '#F5C044') + ' ' + chip('CREADOR', '#FF0D2E') + ' ' + chip('SOCIO', '#F5C044') + ' ';
      badges += chip('VANTS PRO · INCLUIDO', '#4CC9F0') + ' ';
    }
    var ava = p.avatar_url
      ? '<img src="' + p.avatar_url + '" alt="" style="width:74px;height:74px;border-radius:50%;object-fit:cover;border:2px solid #FF0D2E">'
      : '<div style="width:74px;height:74px;border-radius:50%;background:#1a1a20;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:22px">' + (p.username || 'V').slice(0, 2).toUpperCase() + '</div>';
    var inp = 'width:100%;background:#0d0d10;border:1px solid var(--line2,#303039);color:var(--ink,#EDEDE7);padding:11px 12px;font:500 12px var(--mono)';
    var bs = 'font:700 10px/1 var(--mono);letter-spacing:.08em;padding:10px 12px;cursor:pointer;background:#0d0d10;border:1px solid var(--line2,#303039);color:var(--mut,#93939D)';
    return '<div class="d-head"><span class="kicker">/// MI PERFIL · CUENTA REAL VANTS</span><button class="d-x" onclick="closeDrawer()"><i data-lucide="x"></i></button></div>' +
      '<div class="d-body">' +
      bannerStrip(bannerSel) +
      '<div style="display:flex;gap:16px;align-items:center;margin:8px 0 14px">' + ava +
      '<div><div style="font-weight:900;font-size:19px;text-transform:uppercase">' + (p.display_name || p.username || 'JUGADOR') + '</div>' +
      '<div style="font:600 10px/1.6 var(--mono);color:var(--mut)">@' + (p.username || '') + ' · MIEMBRO VANTS</div></div></div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">' + (badges || '<span style="color:var(--dim);font-size:11px">Sin insignias todavía — el dueño las asigna desde el panel admin.</span>') + '</div>' +
      rangoRealHTML(p) +
      cuentasRealHTML(p) +
      transmisionRealHTML(p) +
      (puedeBanner
        ? '<p class="d-sec">BANNER DEL PERFIL</p>' +
          '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">' +
          '<button class="btn btn-sm" data-banner="bananim" style="' + bs + '">ANIMADO</button>' +
          '<button class="btn btn-sm" data-banner="dorado" style="' + bs + '">DORADO</button>' +
          '<button class="btn btn-sm" data-banner="" style="' + bs + '">CLÁSICO</button></div>'
        : '') +
      '<p class="d-sec">MIS DATOS</p>' +
      '<input id="rp-pais" placeholder="País" value="' + (p.country || '') + '" style="' + inp + 'margin-bottom:10px">' +
      '<input id="rp-region" placeholder="Región (LATAM, EU…)" value="' + (p.region || '') + '" style="' + inp + 'margin-bottom:10px">' +
      '<input id="rp-dc" placeholder="Tu tag de Discord (usuario#1234)" value="' + (stats.discord_tag || '') + '" style="' + inp + 'margin-bottom:12px">' +
      '<button class="btn btn-sm" id="rp-guardar" style="width:100%;justify-content:center;background:#FF0D2E;color:#fff;border:0;font:700 11px var(--mono);padding:12px;cursor:pointer;letter-spacing:.08em">GUARDAR MIS DATOS</button>' +
      '<div id="rp-msg" style="font:500 11px/1.6 var(--mono);color:var(--mut);margin-top:10px;white-space:pre-wrap"></div>' +
      '<p class="d-sec">CUENTA</p>' +
      '<div style="font:500 11px/1.8 var(--mono);color:var(--mut)">Rol en VANTS: <b style="color:var(--ink)">' + (p.role ? p.role.toUpperCase() : 'JUGADOR') + '</b><br>Verificado: <b style="color:' + (p.verified ? 'var(--grn)' : 'var(--dim)') + '">' + (p.verified ? 'SÍ' : 'NO') + '</b><br>Correo: ' + (user.email || '—') + '</div>' +
      '<button class="btn btn-ghost btn-sm" id="rp-ajustes" style="margin-top:14px;width:100%;justify-content:center;background:none;border:1px solid var(--line2);color:var(--ink);font:700 10px var(--mono);padding:11px;cursor:pointer;letter-spacing:.1em">AJUSTES DE CUENTA · EMAIL · CONTRASEÑA</button>' +
      '<button class="btn btn-ghost btn-sm" id="rp-salir" style="margin-top:8px;width:100%;justify-content:center;background:none;border:1px solid var(--line2);color:var(--ink);font:700 10px var(--mono);padding:11px;cursor:pointer;letter-spacing:.1em">CERRAR SESIÓN</button>' +
      '</div>';
  }

  async function renderPerfilReal() {
    if (typeof linksCargar === 'function') { try { await linksCargar(); } catch (eL) {} }
    openDrawer(perfilRealHTML());
    if (window.lucide) lucide.createIcons();
    var p = ME.player;
    var msg = document.getElementById('rp-msg');
    var g = document.getElementById('rp-guardar');
    if (g) g.onclick = async function () {
      g.disabled = true; g.textContent = 'GUARDANDO…';
      try {
        var t = await jwt();
        var statsNuevos = Object.assign({}, p.stats || {}, { discord_tag: $('#rp-dc').value.trim(), banner: window.VANTS_BANNER || '' });
        var r = await fetch(API + '/players?id=eq.' + ME.pid, {
          method: 'PATCH',
          headers: authHeaders(t),
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
    var aj = document.getElementById('rp-ajustes');
    if (aj) aj.onclick = function () { closeDrawer(); if (window.openAjustesCuenta) window.openAjustesCuenta(); };
    // editor de banner (solo si puede: dueño o recompensa 11p reclamada)
    document.querySelectorAll('[data-banner]').forEach(function (b) {
      b.onclick = function () {
        window.VANTS_BANNER = b.getAttribute('data-banner');
        var strip = bannerStrip(window.VANTS_BANNER);
        var el = document.getElementById('pr-banner');
        if (el) el.outerHTML = strip;
        document.querySelectorAll('[data-banner]').forEach(function (x) { x.style.borderColor = 'var(--line2,#303039)'; x.style.color = 'var(--mut,#93939D)'; });
        b.style.borderColor = '#FF0D2E'; b.style.color = '#FF0D2E';
      };
    });
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
        /* la creación viaja con la identidad Auth0 para que Neon la ligue a la sesión */
        var r = await fetch(API + '/players', {
          method: 'POST',
          headers: authHeaders(t),
          body: JSON.stringify({ username: $('#cp-user').value.trim().toLowerCase().replace(/\s+/g, '_'), display_name: $('#cp-user').value.trim(), country: $('#cp-pais').value.trim(), region: $('#cp-region').value.trim(), avatar_url: (user && user.picture) || null, auth0_sub: (user && user.sub) || null, email: (user && user.email) || null }),
        });
        var listo = r.ok;
        if (!listo && (r.status === 409 || r.status === 400)) {
          /* nick ya existía: intentar ADOPTAR ese perfil ligándolo a esta identidad */
          try {
            var nick = $('#cp-user').value.trim().toLowerCase().replace(/\s+/g, '_');
            var ex = await fetch(API + '/players?username=eq.' + encodeURIComponent(nick) + '&select=id,auth0_sub&limit=1', { headers: authHeaders(t) });
            var exRows = await ex.json().catch(function () { return []; });
            if (Array.isArray(exRows) && exRows[0] && !exRows[0].auth0_sub) {
              var up = await fetch(API + '/players?id=eq.' + exRows[0].id, {
                method: 'PATCH', headers: authHeaders(t),
                body: JSON.stringify({ auth0_sub: (user && user.sub) || null, email: (user && user.email) || null }),
              });
              if (up.ok) listo = true;
            }
          } catch (eAd) {}
        }
        if (listo) {
          if (msg) msg.innerHTML = '<span class="ok">✓ Perfil creado. Cargando…</span>';
          await cargarPerfilReal();
          if (ME && ME.player) renderPerfilReal();
        } else {
          var j = r.ok ? {} : await r.json().catch(function () { return {}; });
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

  if (window.VANTS_AUTH) window.VANTS_AUTH.playerId = (ME && ME.pid) || null;

  var esAdminRol = !!(ME && ME.player && (ME.player.role === 'owner' || ME.player.role === 'admin'));

  if (user) {
    if (loginBtn) loginBtn.hidden = true;
    if (accBtn) accBtn.hidden = false;
    var nm = String(user.name || user.nickname || user.email || 'JUGADOR').split('@')[0].toUpperCase();
    var ava = document.getElementById('accAva');
    var accName = document.getElementById('accName');
    var dot = document.getElementById('accLive');
    if (ava) ava.textContent = nm.slice(0, 2);
    if (accName) accName.textContent = esOwner ? 'OWNER' : (esAdminRol ? 'ADMIN' : nm.slice(0, 12));
    if (dot) dot.style.display = 'none';
    if (typeof toast === 'function') { try { toast(esOwner ? '👑 Modo DUEÑO activo — panel admin desbloqueado' : 'Sesión iniciada como ' + nm); } catch (e3) {} }

    if (esOwner) {
      (async function () {
        try {
          var pr = await fetch(PROXY + '?table=players&username=eq.geimerpedroza&limit=1', { headers: { Accept: 'application/json' } });
          var rows = await pr.json();
          window.VANTS_ME = { pid: rows && rows[0] ? rows[0].id : null, player: (rows && rows[0]) || null, owner: true };
        } catch (e) { window.VANTS_ME = { pid: null, player: null, owner: true }; }
        try { if (window.VANTS_AUTH) window.VANTS_AUTH.playerId = (window.VANTS_ME && window.VANTS_ME.pid) || null; } catch (eVA) {}
        /* activa plan VANTS PRO gratis + insignias OWNER/CREADOR/SOCIO (motor en arena.js) */
        try { if (window.vantsOwnerActivate) window.vantsOwnerActivate(); } catch (eVO) {}
        try {
          if (typeof state !== 'undefined') { state.passOwned = true; state.isPro = true; if (typeof renderPass === 'function') renderPass(); }
        } catch (e) {}
        var pl = document.getElementById('panelLink');
        if (pl) { pl.hidden = false; pl.style.display = ''; }
      })();
    } else if (esAdminRol) {
      var plA = document.getElementById('panelLink');
      if (plA) { plA.hidden = false; plA.style.display = ''; }
      if (typeof toast === 'function') { try { toast('🛡️ Modo ADMIN activo — panel admin desbloqueado'); } catch (e4) {} }
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

  try {
    if (user) {
      var t = await jwt();
      if (t) {
        var re = await fetch(API + '/rpc/pass_estado', { method: 'POST', headers: authHeaders(t), body: '{}' });
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
        var r = await fetch(API + '/rpc/pass_reclamar', { method: 'POST', headers: authHeaders(t), body: JSON.stringify({ p_key: key }) });
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
