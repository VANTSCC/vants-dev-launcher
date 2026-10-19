/* ============================================================
   VANTS · STRAFE SHELL — v2
   ------------------------------------------------------------
   Convierte CUALQUIER página al shell strafe (barra superior de
   juegos + nav de tabs + breadcrumb) SIN tocar la lógica:
   · MUEVE los nodos reales #arenaLoginBtn / #miCuentaBtn /
     #proBadge del header viejo al nuevo (los listeners de
     arena.js/Auth0 sobreviven al movimiento).
   · Breadcrumb por body[data-crumb="A|B|C"] (o autodetectado).
   · Switch de juego (data-game) con evento 'vants:game'; en las
     rutas /es|en/tournaments/:juego/:estado navega al nuevo juego.
   · Selector de idioma ES/EN (i18n.js) + búsqueda global.
   · body class normalizada a 'sf' (strafe/strafe-t legacy).
   · No hace nada si la página ya trae .sf-top (index estático).
   Cero dependencias. Corre con defer DESPUÉS de arena.js.
   ============================================================ */
(function () {
  'use strict';
  var GAME_NAMES = { valorant: 'VALORANT', cs2: 'COUNTER-STRIKE 2' };
  var NAV = [
    ['index.html', 'Inicio'],
    ['partidos.html', 'Partidas'],
    ['/es/tournaments/valorant/upcoming/', 'Torneos'],
    ['equipos.html', 'Equipos'],
    ['jugadores.html', 'Jugadores'],
    ['ranking.html', 'Ranking'],
    ['llaves.html', 'Brackets'],
    ['clips.html', 'Clips'],
    ['noticias.html', 'Noticias']
  ];

  var mTorneos = location.pathname.match(/^\/(es|en)\/tournaments\/([a-z0-9-]{2,24})\/(upcoming|ongoing|archive)\/?$/);
  var langActual = (document.body.getAttribute('data-lang') || (mTorneos ? mTorneos[1] : '') || '').toLowerCase();

  function langSiguiente(l) {
    try { localStorage.setItem('vants-lang', l); } catch (e) {}
    if (mTorneos) {
      location.href = '/' + l + '/tournaments/' + mTorneos[2] + '/' + mTorneos[3] + '/';
      return;
    }
    var u = new URL(location.href);
    u.searchParams.set('lang', l);
    location.href = u.pathname + u.search;
  }

  /* ---------- 0 · fuente Barlow Semi Condensed si falta ---------- */
  if (!document.querySelector('link[href*="Barlow+Semi+Condensed"]')) {
    var f = document.createElement('link');
    f.rel = 'stylesheet';
    f.href = 'https://fonts.googleapis.com/css2?family=Barlow+Semi+Condensed:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700;800&display=swap';
    document.head.appendChild(f);
  }
  /* ---------- 0b · símbolo del logo VANTS si la página no lo trae ---------- */
  if (!document.getElementById('vmark')) {
    var sym = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    sym.setAttribute('width', '0'); sym.setAttribute('height', '0');
    sym.style.position = 'absolute'; sym.setAttribute('aria-hidden', 'true');
    sym.innerHTML = '<defs><linearGradient id="vm-plate" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b1f26"/><stop offset="1" stop-color="#08090c"/></linearGradient>' +
      '<linearGradient id="vm-edge" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff6b78"/><stop offset=".5" stop-color="#2a2f38"/><stop offset="1" stop-color="#ff0d2e"/></linearGradient>' +
      '<linearGradient id="vm-steel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".55" stop-color="#d9dde3"/><stop offset="1" stop-color="#8d949e"/></linearGradient>' +
      '<linearGradient id="vm-red" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff5a68"/><stop offset=".5" stop-color="#ff0d2e"/><stop offset="1" stop-color="#9e0019"/></linearGradient></defs>' +
      '<symbol id="vmark" viewBox="0 0 64 64"><path d="M12 2 H52 L62 12 V52 L52 62 H12 L2 52 V12 Z" fill="url(#vm-plate)" stroke="url(#vm-edge)" stroke-width="1.5"/>' +
      '<path d="M9 14 H23 L34.5 44.5 L32 52 Z" fill="url(#vm-steel)"/><path d="M55 14 H41 L32.4 37 L42.2 37 Z" fill="url(#vm-red)"/>' +
      '<path d="M38.6 41 L41 41 L32 52 L33.6 47.6 Z" fill="#ff0d2e" opacity=".9"/><path d="M9 14 H23 L23.8 16.2 H9.9 Z" fill="#fff" opacity=".75"/></symbol>';
    document.body.insertBefore(sym, document.body.firstChild);
  }

  /* ---------- 1 · clase del body ---------- */
  var body = document.body;
  body.classList.add('sf');
  body.classList.remove('strafe', 'strafe-t');

  /* ---------- 2 · index ya trae shell estático → solo complementos ---------- */
  if (document.querySelector('.sf-top')) { complementos(); return; }

  /* ---------- 3 · cosechar el header viejo ---------- */
  var oldNav = document.querySelector('header.nav') || document.querySelector('.nav');
  var loginBtn = document.getElementById('arenaLoginBtn');
  var cuentaBtn = document.getElementById('miCuentaBtn');
  var proBadge = document.getElementById('proBadge');

  var cur = (location.pathname.split('/').pop() || '').toLowerCase().replace(/\.html$/, '');
  var activo = cur === 'torneo' ? '/es/tournaments/valorant/upcoming/' : 'index';
  if (mTorneos) activo = '/es/tournaments/valorant/upcoming/';
  if (cur === 'noticia') activo = 'noticias.html';
  if (cur === 'busqueda') activo = '';
  for (var i = 0; i < NAV.length; i++) {
    var navSin = String(NAV[i][0]).toLowerCase().replace(/\.html$/, '').replace(/^\//, '').replace(/\/$/, '');
    if (cur && cur === navSin) { activo = NAV[i][0]; break; }
  }

  var game = body.getAttribute('data-game') || 'valorant';
  if (!GAME_NAMES[game]) game = 'valorant';
  var crumb = (body.getAttribute('data-crumb') || '').split('|').filter(Boolean);

  /* ---------- 4 · construir shell ---------- */
  var shell = document.createElement('div');
  shell.innerHTML =
    '<header class="sf-top"><div class="wrap sf-top-in">' +
      '<a class="sf-brand" href="index.html">' +
        '<svg class="mark" viewBox="0 0 64 64"><use href="#vmark"/></svg><b>VANTS</b><small>GAMES</small>' +
      '</a>' +
      '<div class="sf-titles">' +
        '<button class="sf-title gbtn' + (game === 'valorant' ? ' on' : '') + '" data-game="valorant" aria-label="VALORANT">' +
          '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M2.2 3h5.6l7.3 14-2.3 4L2.2 3Z"/><path d="M21.8 3h-5.6l-3.4 6.5 2.4 4.5L21.8 3Z"/></svg>VALORANT</button>' +
        '<button class="sf-title gbtn' + (game === 'cs2' ? ' on' : '') + '" data-game="cs2" aria-label="COUNTER-STRIKE 2">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="8.2"/><circle cx="12" cy="12" r="2.1"/><path d="M12 3.8v3.4M12 16.8v3.4M3.8 12h3.4M16.8 12h3.4"/></svg>COUNTER-STRIKE 2</button>' +
        '<span class="sf-title soon">+ MÁS JUEGOS PC</span>' +
      '</div>' +
      '<div class="sf-top-right">' +
        '<a class="sf-ico" href="busqueda.html" title="Búsqueda" aria-label="Búsqueda en VANTS"><i data-lucide="search"></i></a>' +
        '<a class="sf-ico" href="descargar.html" title="Descargar el HUB VANTS" aria-label="Descargar el HUB VANTS"><i data-lucide="download"></i></a>' +
        '<button class="sf-lang" type="button" aria-label="Cambiar idioma" title="Español / English">' +
          '<span class="sf-flag"></span><span class="sf-lang-cur">' + (langActual === 'en' ? 'EN' : 'ES') + '</span>' +
        '</button>' +
      '</div>' +
    '</div></header>' +
    '<nav class="sf-nav"><div class="wrap sf-nav-in">' +
      NAV.map(function (n) {
        return '<a href="' + n[0] + '"' + (n[0] === activo ? ' class="on"' : '') + '>' + n[1] + '</a>';
      }).join('') +
      '<a class="sf-nav-cta" href="membresias.html"><i data-lucide="crown"></i>MEMBRESÍAS</a>' +
    '</div></nav>' +
    '<div class="wrap sf-crumb" id="sfCrumb"></div>';

  /* insertar el shell donde estaba el header viejo (o al inicio) */
  var ancla = oldNav && oldNav.parentNode ? oldNav : body.firstChild;
  if (ancla) ancla.parentNode.insertBefore(shell, ancla); else body.insertBefore(shell, body.firstChild);
  if (oldNav) oldNav.parentNode.removeChild(oldNav);

  /* devolver los botones cosechados a la barra superior */
  var right = shell.querySelector('.sf-top-right');
  if (right) {
    if (proBadge) right.insertBefore(proBadge, right.firstChild);
    if (loginBtn) {
      loginBtn.className = 'sf-login';
      loginBtn.textContent = 'LOGIN';
      right.appendChild(loginBtn);
    }
    if (cuentaBtn) {
      cuentaBtn.className = 'sf-login solid';
      cuentaBtn.innerHTML = '<i data-lucide="layout-dashboard"></i>MI CUENTA';
      right.appendChild(cuentaBtn);
    }
    /* chip de cuenta de páginas autocontenidas (clips.html) */
    var acc = document.getElementById('clipAcc');
    if (acc && acc.parentNode) { acc.parentNode.removeChild(acc); right.appendChild(acc); }
  }

  /* retirar CUALQUIER header viejo suelto (body > header sin el shell nuevo) */
  try {
    document.querySelectorAll('body > header').forEach(function (h) {
      if (!h.querySelector('.sf-top')) h.parentNode.removeChild(h);
    });
  } catch (e) {}

  /* ---------- 5 · breadcrumb ---------- */
  var crumbEl = document.getElementById('sfCrumb');
  function pintaCrumb() {
    if (!crumbEl) return;
    var g = body.getAttribute('data-game') || 'valorant';
    var html = '<a href="index.html">INICIO</a><i>|</i><b id="sfCrumbGame">' + (GAME_NAMES[g] || 'VALORANT') + '</b>';
    crumb.forEach(function (c, ix) {
      html += '<i>|</i>' + (ix === crumb.length - 1 ? '<b>' + c + '</b>' : '<span>' + c + '</span>');
    });
    crumbEl.innerHTML = html;
  }
  pintaCrumb();

  /* ---------- 6 · switch de juego ---------- */
  shell.querySelectorAll('.sf-title[data-game]').forEach(function (b) {
    b.addEventListener('click', function () {
      var g = b.getAttribute('data-game');
      body.setAttribute('data-game', g);
      shell.querySelectorAll('.sf-title[data-game]').forEach(function (x) { x.classList.toggle('on', x === b); });
      pintaCrumb();
      /* En las rutas de torneos el switch navega al juego elegido
         (el listado lo pinta la misma página: nunca sale del diseño) */
      if (mTorneos) {
        var estado = mTorneos[3];
        location.href = '/' + (langActual || 'es') + '/tournaments/' + g + '/' + estado + '/';
        return;
      }
      try { document.dispatchEvent(new CustomEvent('vants:game', { detail: { game: g } })); } catch (e) {}
    });
  });

  /* ---------- 6b · selector de idioma ---------- */
  var langBtn = shell.querySelector('.sf-lang');
  if (langBtn) {
    langBtn.addEventListener('click', function () {
      langSiguiente(langActual === 'en' ? 'es' : 'en');
    });
  }

  /* ---------- 7 · iconos ---------- */
  function iconos() { try { if (window.lucide && lucide.createIcons) lucide.createIcons(); } catch (e) {} }
  iconos();
  window.addEventListener('load', iconos);

  /* ---------- 8 · páginas con shell estático (index): iconos + evento juego ---------- */
  function complementos() {
    window.addEventListener('load', function () { try { if (window.lucide && lucide.createIcons) lucide.createIcons(); } catch (e) {} });
    document.querySelectorAll('.sf-title[data-game]').forEach(function (b) {
      if (b.dataset.sfBound) return;
      b.dataset.sfBound = '1';
      b.addEventListener('click', function () {
        try { document.dispatchEvent(new CustomEvent('vants:game', { detail: { game: b.getAttribute('data-game') } })); } catch (e) {}
      });
    });
    /* selector de idioma del index estático */
    var lb = document.querySelector('.sf-top .sf-lang');
    if (lb && !lb.dataset.sfBound) {
      lb.dataset.sfBound = '1';
      lb.style.cursor = 'pointer';
      lb.setAttribute('role', 'button');
      lb.setAttribute('tabindex', '0');
      lb.setAttribute('aria-label', 'Cambiar idioma / Change language');
      var mIdx = location.pathname.match(/^\/(es|en)\/tournaments\/([a-z0-9-]{2,24})\/(upcoming|ongoing|archive)\/?$/);
      var langIdx = (document.body.getAttribute('data-lang') || (mIdx ? mIdx[1] : 'es')).toLowerCase();
      var cambia = function () {
        var destino = langIdx === 'en' ? 'es' : 'en';
        try { localStorage.setItem('vants-lang', destino); } catch (e) {}
        if (mIdx) { location.href = '/' + destino + '/tournaments/' + mIdx[2] + '/' + mIdx[3] + '/'; return; }
        var u = new URL(location.href);
        u.searchParams.set('lang', destino);
        location.href = u.pathname + u.search;
      };
      lb.addEventListener('click', cambia);
      lb.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); cambia(); } });
    }
  }
})();
