/* ============================================================
   STRAFE HOME · v1 — Comportamiento del index estilo strafe.com
   ------------------------------------------------------------
   Módulo 100% INDEPENDIENTE (mismo patrón que strafe.css):
   · NO toca arena.js / arena-live.js / Auth0 / RR.
   · Tabs de estado EN CURSO / PRÓXIMOS / ARCHIVO que filtran
     la tabla de torneos (como strafe.com).
   · Filas alimentadas con datos REALES de Neon
     (window.VantDB.tournaments()) + fallback S4 si la base
     no responde. Cada fila lleva a torneos.html (inscripción).
   ============================================================ */
(function () {
  'use strict';
  if (window.__SF_HOME__) return;
  var SF = { version: '1.0.0', estado: 'curso' };
  window.__SF_HOME__ = SF;

  var $ = function (s, r) { return (r || document).querySelector(s); };
  function safe(fn) { try { fn(); } catch (e) { /* silencio total */ } }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  /* ---------------- CLASIFICACIÓN POR ESTADO ---------------- */
  function estadoDe(t) {
    var s = String(t.status || '').toLowerCase();
    if (/final|cerrad|complet|archiv|terminad|done/.test(s)) return 'arch';
    if (/abierto|open|ongoing|curso|activo|live|inscripc/.test(s)) return 'curso';
    return 'prox';
  }

  /* ---------------- FILAS ---------------- */
  var TROPHY = '<i data-lucide="trophy"></i>';

  function fila(t) {
    var ed = estadoDe(t);
    var badge = ed === 'curso' ? '<span class="sf-badge">ABIERTO</span>'
      : ed === 'arch' ? '<span class="sf-badge dim">FINALIZADO</span>'
      : '<span class="sf-badge red">PRÓXIMO</span>';
    var fecha = 'POR ANUNCIAR';
    if (t.starts_at) {
      var d = new Date(t.starts_at);
      if (!isNaN(d.getTime())) fecha = String(d.getDate()).padStart(2, '0') + ' ' + d.toLocaleString('es-ES', { month: 'short' }).replace('.', '').toUpperCase();
    } else if (t.day && t.mon) {
      fecha = t.day + ' ' + t.mon;
    }
    var premio = (t.prize_pool != null && Number(t.prize_pool) > 0)
      ? '$' + Number(t.prize_pool).toLocaleString('es-ES')
      : 'POR ANUNCIAR';
    var cupos = (t.max_participants != null && Number(t.max_participants) > 0)
      ? (Number(t.current_participants) || 0) + ' / ' + Number(t.max_participants)
      : 'ABIERTOS';
    var tier = esc(String(t.tier || 'open').toUpperCase());
    return '<a class="sf-row" href="torneos.html" data-est="' + ed + '">' +
      '<span class="sf-ric">' + TROPHY + '</span>' +
      '<span class="sf-rmain"><span class="sf-rname">' + esc(t.name || 'Torneo VANTS') + '</span>' +
      '<span class="sf-rmeta"><span class="tg">' + tier + '</span><span>VANTS · ' + esc(t.game ? String(t.game).toUpperCase() : 'VALORANT') + '</span>' + badge + '</span></span>' +
      '<span class="sf-rcol c-prize"><small>PREMIO</small><b' + (t.prize_pool != null && Number(t.prize_pool) > 0 ? ' class="lm"' : '') + '>' + esc(premio) + '</b></span>' +
      '<span class="sf-rcol c-fechas"><small>FECHAS</small><b>' + esc(fecha) + '</b></span>' +
      '<span class="sf-rcol c-slots"><small>EQUIPOS</small><b>' + esc(cupos) + '</b></span>' +
      '<span class="sf-rgo"><i data-lucide="chevron-right"></i></span></a>';
  }

  function pintar(rows) {
    var host = $('#sfRows');
    if (!host) return;
    var visibles = rows.filter(function (t) { return estadoDe(t) === SF.estado; });
    if (SF.estado === 'arch' && !visibles.length) {
      host.innerHTML = '<div class="sf-empty">ARCHIVO VACÍO POR AHORA — CADA TEMPORADA PASA A VIVIR AQUÍ.</div>';
    } else if (!visibles.length) {
      host.innerHTML = '<div class="sf-empty">SIN TORNEOS EN ESTE ESTADO · EL CALENDARIO SE ANUNCIA POR DISCORD Y LA WEB.</div>';
    } else {
      host.innerHTML = visibles.slice(0, 8).map(fila).join('');
    }
    var lbl = $('#sfTState');
    if (lbl) lbl.textContent = SF.estado === 'curso' ? 'EN CURSO' : SF.estado === 'prox' ? 'PRÓXIMOS' : 'ARCHIVO';
    var cnt = $('#sfTCount');
    if (cnt) cnt.textContent = rows.length + ' TORNEOS · TEMPORADA 4';
    safe(function () { if (window.lucide && window.lucide.createIcons) window.lucide.createIcons(); });
  }

  /* ---------------- TABS ---------------- */
  safe(function () {
    var tabs = document.querySelectorAll('.sf-tab[data-est]');
    tabs.forEach(function (b) {
      b.addEventListener('click', function () {
        SF.estado = b.getAttribute('data-est');
        tabs.forEach(function (x) { x.classList.toggle('on', x === b); });
        if (SF.cache) pintar(SF.cache);
        else pintar(FALLBACK);
      });
    });
  });

  /* ---------------- FALLBACK S4 (si Neon no responde) ---------------- */
  var FALLBACK = [
    { name: 'ASCENSIÓN SERIES S4', status: 'abierto', tier: 'open', game: 'valorant', prize_pool: null, day: '24', mon: 'OCT' },
    { name: 'VANTS RANKED NOCTURNA', status: 'abierto', tier: 'ranked', game: 'valorant', prize_pool: null },
    { name: 'COPA COMUNIDAD S4', status: 'proximamente', tier: 'open', game: 'valorant', prize_pool: null, day: '08', mon: 'NOV' }
  ];

  /* ---------------- CARGA DE DATOS REALES ---------------- */
  safe(function () {
    pintar(FALLBACK); /* pinta algo de inmediato */
    var t0 = setTimeout(function cargar() {
      try {
        var DB = window.VantDB;
        if (!DB || typeof DB.tournaments !== 'function') { t0 = setTimeout(cargar, 900); return; }
        Promise.resolve(DB.tournaments()).then(function (rows) {
          clearTimeout(t0);
          if (Array.isArray(rows) && rows.length) { SF.cache = rows; pintar(rows); }
          else { SF.cache = FALLBACK; pintar(FALLBACK); }
        }).catch(function () { SF.cache = FALLBACK; pintar(FALLBACK); });
      } catch (e) { SF.cache = FALLBACK; pintar(FALLBACK); }
    }, 400);
  });

  /* ---------------- TARJETA DISCORD (sin invite aún) ---------------- */
  safe(function () {
    var d = $('#sfDiscord');
    if (!d) return;
    d.addEventListener('click', function (e) {
      e.preventDefault();
      toast('El invite del Discord oficial se entrega con tu cuenta: ingresa y lo verás en tu panel.', 'info');
    });
  });

  /* ---------------- BREADCRUMB SINCRONIZADO CON EL JUEGO ---------------- */
  safe(function () {
    var el = $('#sfCrumbGame');
    if (!el || !window.MutationObserver) return;
    var sync = function () {
      var g = (document.body.getAttribute('data-game') || 'valorant').toUpperCase();
      el.textContent = g === 'CS2' ? 'COUNTER-STRIKE 2' : g;
    };
    new MutationObserver(sync).observe(document.body, { attributes: true, attributeFilter: ['data-game'] });
    sync();
  });
})();
