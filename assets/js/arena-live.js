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

  if (user) {
    if (loginBtn) loginBtn.hidden = true;
    var nm = String(user.name || user.nickname || user.email || 'JUGADOR').split('@')[0].toUpperCase();
    var ava = document.getElementById('accAva');
    var accName = document.getElementById('accName');
    var dot = document.getElementById('accLive');
    if (ava) ava.textContent = nm.slice(0, 2);
    if (accName) accName.textContent = nm.slice(0, 12);
    if (dot) dot.style.display = '';
    if (typeof toast === 'function') { try { toast('Sesión iniciada como ' + nm); } catch (e) {} }
  } else if (loginBtn && !esArchivo) {
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

  /* ---------------- 2) Neon: torneos reales ---------------- */
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
