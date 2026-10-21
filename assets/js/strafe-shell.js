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
  /* Cada grupo: t título, h enlace principal, sub submenú opcional
     (hrefs reales, mismos que data/menu-data.ts del webapp). */
  var NAV = [
    { t: 'Inicio', h: 'index.html' },
    { t: 'SALA', h: 'jugadores.html', sub: [
      ['jugadores.html', 'Sala de jugadores'],
      ['equipos.html', 'Equipos del circuito'],
      ['equipo.html', 'Equipo VANTS DE 5']
    ] },
    { t: 'PARTIDOS', h: 'partidos.html', sub: [
      ['partidos.html', 'Agenda en vivo'],
      ['resultados.html', 'Resultados'],
      ['calendario.html', 'Calendario']
    ] },
    { t: 'RANKING', h: 'ranking.html', sub: [
      ['ranking.html', 'Ranking global'],
      ['rangos.html', 'Rangos']
    ] },
    { t: 'TORNEOS', h: 'torneos.html', sub: [
      ['torneos.html', 'Calendario abierto'],
      ['torneo.html', 'Torneo actual · Ascensión S4'],
      ['llaves.html', 'Llaves · Bracket']
    ] },
    { t: 'CLIPS', h: 'clips.html', sub: [
      ['clips.html', 'Momentos destacados'],
      ['historia.html', 'Historia'],
      ['guia.html', 'Guía de la arena']
    ] },
    { t: 'TIENDA', h: 'tienda.html' },
    { t: 'DESCARGAR', h: 'descargar.html' },
    { t: 'NOTICIAS', h: 'noticias.html' }
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
  var activo = cur === 'torneo' ? 'torneos.html' : 'index.html';
  var activoSub = cur === 'torneo' ? 'torneo.html' : '';
  if (mTorneos) activo = 'torneos.html';
  if (cur === 'noticia') activo = 'noticias.html';
  if (cur === 'busqueda') activo = '';
  (function () {
    for (var i = 0; i < NAV.length; i++) {
      var hrefs = [NAV[i].h].concat(NAV[i].sub ? NAV[i].sub.map(function (s) { return s[0]; }) : []);
      for (var j = 0; j < hrefs.length; j++) {
        var navSin = String(hrefs[j]).toLowerCase().replace(/\.html$/, '').replace(/^\//, '').replace(/\/$/, '');
        if (cur && cur === navSin) { activo = NAV[i].h; activoSub = hrefs[j]; return; }
      }
    }
  })();

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
        var on = n.h === activo ? ' on' : '';
        if (!n.sub) return '<a href="' + n.h + '" class="sf-item' + on + '">' + n.t + '</a>';
        var panel = n.sub.map(function (s) {
          return '<a href="' + s[0] + '" role="menuitem"' + (s[0] === activoSub ? ' class="cur"' : '') + '>' + s[1] + '</a>';
        }).join('');
        return '<div class="sf-dd">' +
          '<a class="sf-dd-top' + on + '" href="' + n.h + '" aria-haspopup="true" aria-expanded="false">' + n.t +
          '<svg class="sf-caret" viewBox="0 0 12 8" aria-hidden="true"><path d="M1 1.5 6 6.5 11 1.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></a>' +
          '<div class="sf-dd-panel" role="menu">' + panel + '</div>' +
        '</div>';
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

  /* ---------- 4b · submenús: hover en escritorio, toque/teclado en el resto ----------
     El panel es position:fixed (colocado por JS bajo la barra) para no
     quedar recortado por el overflow-x del carrusel de navegación. */
  var sfNavIn = shell.querySelector('.sf-nav-in');
  var dds = [].slice.call(shell.querySelectorAll('.sf-dd'));
  function ddPanel(d) { return d.querySelector('.sf-dd-panel'); }
  function ddTop(d) { return d.querySelector('.sf-dd-top'); }
  function colocaPanel(d) {
    var p = ddPanel(d);
    p.style.top = sfNavIn.getBoundingClientRect().bottom + 'px';
    var izq = d.getBoundingClientRect().left;
    izq = Math.min(izq, window.innerWidth - p.offsetWidth - 8);
    p.style.left = Math.max(8, izq) + 'px';
  }
  function abreDd(d) {
    cierraDds(d);
    colocaPanel(d);
    d.classList.add('open');
    ddTop(d).setAttribute('aria-expanded', 'true');
  }
  function cierraDds(excepto) {
    dds.forEach(function (d) {
      if (d === excepto) return;
      d.classList.remove('open');
      ddTop(d).setAttribute('aria-expanded', 'false');
    });
  }
  var conHover = window.matchMedia('(hover: hover)');
  dds.forEach(function (d) {
    var top = ddTop(d);
    var tapPendiente = false;
    d.addEventListener('mouseenter', function () { if (conHover.matches) abreDd(d); });
    d.addEventListener('mouseleave', function () { if (conHover.matches) cierraDds(); });
    d.addEventListener('pointerdown', function (e) {
      /* primer toque: abrir el panel en vez de navegar */
      tapPendiente = e.pointerType === 'touch' && !d.classList.contains('open');
    });
    top.addEventListener('click', function (e) {
      if (tapPendiente) { tapPendiente = false; e.preventDefault(); abreDd(d); return; }
      if (!d.classList.contains('open') && !conHover.matches) { e.preventDefault(); abreDd(d); }
      cierraDds(d);
    });
    d.addEventListener('focusin', function () { abreDd(d); });
    d.addEventListener('focusout', function (e) { if (!d.contains(e.relatedTarget)) cierraDds(); });
    top.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { cierraDds(); top.focus(); }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        abreDd(d);
        var primero = ddPanel(d).querySelector('a');
        if (primero) primero.focus();
      }
    });
    ddPanel(d).addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { cierraDds(); top.focus(); }
    });
  });
  document.addEventListener('click', function (e) {
    if (!e.target || !e.target.closest || !e.target.closest('.sf-dd')) cierraDds();
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') cierraDds(); });
  sfNavIn.addEventListener('scroll', function () { cierraDds(); }, { passive: true });
  window.addEventListener('resize', function () { cierraDds(); });

  /* ---------- 5 · breadcrumb (arranca en el juego; sin enlace de portada duplicado) ---------- */
  var crumbEl = document.getElementById('sfCrumb');
  var homeLbl = NAV[0].t;
  function pintaCrumb() {
    if (!crumbEl) return;
    var g = body.getAttribute('data-game') || 'valorant';
    var partes = [GAME_NAMES[g] || 'VALORANT'];
    crumb.forEach(function (c) {
      var t = String(c).trim();
      if (t && t.toLocaleUpperCase('es') !== homeLbl.toLocaleUpperCase('es')) partes.push(c);
    });
    if (!partes.length) { crumbEl.hidden = true; return; }
    var html = '<b id="sfCrumbGame">' + partes[0] + '</b>';
    for (var i = 1; i < partes.length; i++) {
      html += '<i>|</i>' + (i === partes.length - 1 ? '<b>' + partes[i] + '</b>' : '<span>' + partes[i] + '</span>');
    }
    crumbEl.hidden = false;
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
