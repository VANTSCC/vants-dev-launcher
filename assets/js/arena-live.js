/* ============================================================
   VANTS GAMES — capa viva (arena-live)
   ------------------------------------------------------------
   1) Auth0: botón ENTRAR → Universal Login (Google, Discord,
      GitHub, Kick o correo, según las conexiones activadas).
      Con sesión: el nav muestra el nombre del jugador.
   2) Neon: si la tabla tournaments tiene filas, sustituye la
      lista de demo por datos reales (proxy público, sin sesión)
      y enciende el indicador "DATOS EN VIVO · NEON".

   Todo es tolerante a fallos: si Auth0 o Neon no responden, la
   página sigue funcionando con su contenido de demostración.
   ============================================================ */
(async function () {
  'use strict';

  var $ = function (s) { return document.querySelector(s); };

  /* ---------------- 1) Auth0 ---------------- */
  if (!window.VantAuth0) return;
  try { await window.VantAuth0.initAuth0(); } catch (e) { console.warn('[arena] Auth0 no disponible', e); return; }
  var A0 = window.VantAuth0.client;
  if (!A0) return;

  // En preview local (file://) el login real no puede volver a una URL válida:
  // el botón ENTRAR se queda oculto y el resto de la capa sigue funcionando.
  var esArchivo = location.protocol === 'file:';

  // Vuelta del login: la raiz recibe ?code=...&state=... (exito) o
  // ?error=... (p.ej. conexiones sin configurar en el panel de Auth0).
  try {
    var q = new URLSearchParams(location.search);
    if (q.get('code') && q.get('state')) {
      await A0.handleRedirectCallback();
      history.replaceState({}, '', location.pathname + location.hash);
    } else if (q.get('error')) {
      if (typeof toast === 'function') {
        try { toast('Login no disponible: activa las conexiones en Auth0 (' + q.get('error') + ')', 'info'); } catch (e2) {}
      }
      history.replaceState({}, '', location.pathname + location.hash);
    }
  } catch (e) { /* callback ya procesado */ }

  // Limpieza del service worker y caches de la web antigua (visitantes recurrentes)
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(function (rs) {
      rs.forEach(function (r) { r.unregister(); });
    }).catch(function () {});
  }
  if (window.caches && caches.keys) {
    caches.keys().then(function (ks) { ks.forEach(function (k) { caches.delete(k); }); }).catch(function () {});
  }

  var user = null;
  try { user = await A0.getUser(); } catch (e) {}

  var loginBtn = document.getElementById('arenaLoginBtn');
  var accBtn = document.getElementById('accBtn');

  // ---------- DUEÑO / ADMIN (cuentas del propietario) ----------
  var OWNER_EMAILS = ['geimerjhoan099@gmail.com', 'admin@vants.games'];
  var esOwner = !!(user && user.email && OWNER_EMAILS.indexOf(String(user.email).toLowerCase()) !== -1);
  var chip = function (txt, color) { return '<span class="chip" style="color:' + color + ';border-color:' + color + '">' + txt + '</span>'; };

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
    if (typeof toast === 'function') { try { toast(esOwner ? '👑 Modo DUEÑO activo — panel admin desbloqueado' : 'Sesión iniciada como ' + nm); } catch (e) {} }

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
      A0.loginWithRedirect({
        authorizationParams: {
          // Misma URL de retorno que la app: UNA sola callback en Auth0
          // (https://feispla.github.io/Vants/). El retorno se procesa aquí
          // arriba y la sesión se comparte por localStorage.
          redirect_uri: location.origin + location.pathname.replace(/[^/]*$/, ''),
          scope: 'openid profile email',
        },
      }).catch(function () { loginBtn.disabled = false; });
    });
  }

  // Drawer del dueño: perfil real + colección completa del pase + panel
  if (accBtn) accBtn.addEventListener('click', function (e) {
    if (!esOwner) return;
    e.stopImmediatePropagation();
    var me = (window.VANTS_ME || {}).player || { username: 'geimerpedroza', display_name: 'Jhoan Pedroza', country: '', region: 'LATAM', verified: true };
    var insig = chip('👑 OWNER', '#F5C044') + ' ' + chip('🛡 ADMIN', '#4CC9F0') + ' ' + chip('STREAMER', '#9146FF') + ' ' + chip('✓ VERIFICADO', '#4CC9F0');
    var cos = (typeof PASS_REWARDS !== 'undefined' && typeof ART !== 'undefined') ? PASS_REWARDS.map(function (rw, i) {
      return '<div style="display:flex;gap:10px;align-items:center;background:var(--panel,#131317);border:1px solid var(--line,#222228);padding:8px 10px;margin:5px 0"><span style="width:44px;height:44px;flex:none;display:block">' + ART[rw.art]('own' + i, rw) + '</span><div><b style="font-size:11px">' + rw.name + '</b><br><span style="font-size:9px;color:var(--dim)">' + rw.type + ' · NIVEL ' + rw.lvl + '</span></div></div>';
    }).join('') : '';
    openDrawer('<div class="d-head"><span class="kicker">/// MI PERFIL · DUEÑO DE VANTS</span><button class="d-x" onclick="closeDrawer()"><i data-lucide="x"></i></button></div>' +
      '<div class="d-body">' +
      '<div style="display:flex;gap:14px;align-items:center;margin:16px 0">' +
      '<div style="width:70px;height:70px;border-radius:50%;background:#1a1a20;border:2px solid #F5C044;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:22px">' + String(me.username || 'O').slice(0, 2).toUpperCase() + '</div>' +
      '<div><div style="font-weight:900;font-size:18px;text-transform:uppercase">' + (me.display_name || me.username || 'DUEÑO') + '</div><div style="font:600 10px/1.6 var(--mono);color:var(--gold)">@' + (me.username || '') + ' · PROPIETARIO</div></div></div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">' + insig + '</div>' +
      '<p class="d-sec">PASE COMPETITIVO · COLECCIÓN COMPLETA (DUEÑO)</p>' + cos +
      '<p class="d-sec">PAÍS Y REGIÓN</p>' +
      '<div style="font:500 11px/1.8 var(--mono);color:var(--mut)">' + ((me.country || '—') + ' · ' + (me.region || '—')) + '<br><span style="color:var(--dim)">Edición de datos: panel admin o SQL Editor.</span></div>' +
      '<div style="display:flex;gap:10px;margin-top:18px">' +
      '<a class="btn btn-sm" href="./panel.html" style="flex:1;justify-content:center;background:#FF0D2E;color:#fff;text-decoration:none;font:700 10px var(--mono);padding:11px;text-align:center;cursor:pointer;border:0;letter-spacing:.08em">ABRIR PANEL ADMIN</a>' +
      '<button class="btn btn-ghost btn-sm" id="ow-salir" style="flex:1;justify-content:center;background:none;border:1px solid var(--line2);color:var(--ink);font:700 10px var(--mono);padding:11px;cursor:pointer">CERRAR SESIÓN</button></div>' +
      '</div>');
    if (window.lucide) lucide.createIcons();
    var s = document.getElementById('ow-salir');
    if (s) s.onclick = function () { A0.logout({ logoutParams: { returnTo: RAIZ } }); };
  }, { capture: true });
  var DB = window.VantDB;
  if (!DB) return;

  function liveBadge(on, n) {
    var el = document.getElementById('liveDataBadge');
    if (!el) return;
    el.innerHTML = on
      ? '<span class="dot"></span>DATOS EN VIVO · NEON · ' + n + ' TORNEOS'
      : 'DATOS DE DEMOSTRACIÓN';
    el.classList.toggle('on', !!on);
  }

  try {
    var rows = await DB.tournaments(); // proxy público sin sesión (cache 30s)
    if (Array.isArray(rows) && rows.length) {
      var list = rows.map(function (t) {
        var d = t.starts_at ? new Date(t.starts_at) : null;
        return {
          id: String(t.slug || t.id),
          day: d ? String(d.getDate()).padStart(2, '0') : '—',
          mon: d ? d.toLocaleString('es-ES', { month: 'short' }).replace('.', '').toUpperCase() : '',
          name: t.name || 'Torneo VANTS',
          tier: String(t.tier || 'open').toUpperCase(),
          tags: [String(t.status || 'abierto').toUpperCase()],
          prize: Number(t.prize_pool) || 0,
          slots: Number(t.max_participants) || 0,
          filled: Number(t.current_participants) || 0,
          fee: 0,
        };
      });
      ['valorant', 'cs2'].forEach(function (g) { if (DATA[g]) DATA[g].tournaments = list; });
      if (typeof renderTournaments === 'function') renderTournaments();
      liveBadge(true, list.length);
    } else {
      liveBadge(false, 0);
    }
  } catch (e) {
    console.warn('[arena] Neon no disponible', e);
    liveBadge(false, 0);
  }
})();
