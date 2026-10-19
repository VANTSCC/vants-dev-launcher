/* ============================================================
   TORNEUM HOME · v1 — Comportamiento del index estilo Torneum
   ------------------------------------------------------------
   Módulo 100% INDEPENDIENTE (mismo patrón que torneum.css):
   · NO toca arena.js / arena-live.js / Auth0 / RR.
   · Spotlight de torneos: datos reales de Neon (window.VantDB)
     con fallback estático de la S4 si la base no responde.
   · Contadores animados, marquee, flechas del carrusel,
     tarjeta de Discord (sin invite aún → toast informativo).
   ============================================================ */
(function () {
  'use strict';
  if (window.__TM_HOME__) return;
  var TM = { version: '1.0.0' };
  window.__TM_HOME__ = TM;

  var $ = function (s, r) { return (r || document).querySelector(s); };
  function safe(fn) { try { fn(); } catch (e) { /* silencio total */ } }
  function toast(msg, kind) {
    try { if (typeof window.toast === 'function') { window.toast(msg, kind || 'info'); return; } } catch (e) {}
    console.log('[tm]', msg);
  }

  /* ---------------- 1 · SPOTLIGHT TORNEOS ---------------- */
  var FALLBACK = [
    { name: 'ASCENSIÓN SERIES S4', tag: 'ONGOING', alt: false, desc: 'El circuito abierto de la Temporada 4. Bracket doble, BO3 y parte del pozo.', meta1: '5v5 · DOBLE ELIM.', meta2: 'PREMIO: POR ANUNCIAR', game: 'VALORANT' },
    { name: 'VANTS RANKED NOCTURNA', tag: 'ONGOING', alt: false, desc: 'Cola ranked de la noche: series cortas, RR en juego cada partida.', meta1: '5v5 · SERIES BO1/BO3', meta2: 'RR + INSIGNIAS', game: 'CS2' },
    { name: 'COPA COMUNIDAD S4', tag: 'PRÓXIMAMENTE', alt: true, desc: 'Torneo abierto de la comunidad, inscripción libre desde Discord o la web.', meta1: '5v5 · SINGLE ELIM.', meta2: 'ENTRADA GRATUITA', game: 'MIXTO' }
  ];

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function cardFallback(t) {
    return '<div class="tm-tcard" data-href="torneos.html" role="link" tabindex="0">' +
      '<div class="tm-timg"><span class="tm-badge' + (t.alt ? ' b2' : '') + '">' + esc(t.tag) + '</span>' +
      '<div class="tm-tlogo">VANTS<small>' + esc(t.game) + '</small></div></div>' +
      '<div class="tm-tbody"><div class="tm-tname">' + esc(t.name) + '</div>' +
      '<div class="tm-tby">Por <b>VANTS GAMES</b></div>' +
      '<div class="tm-tdesc">' + esc(t.desc) + '</div>' +
      '<div class="tm-tmeta"><span><i data-lucide="swords"></i>' + esc(t.meta1) + '</span>' +
      '<span><i data-lucide="gift"></i>' + esc(t.meta2) + '</span></div>' +
      '<div class="tm-tfoot"><a class="tm-tgo" href="torneos.html">INSCRIBIRSE</a></div></div></div>';
  }

  function cardReal(t) {
    var ongoing = String(t.status || '').toLowerCase().indexOf('abierto') >= 0 || String(t.status || '').toLowerCase() === 'ongoing';
    var badge = ongoing ? 'INSCRIPCIÓN ABIERTA' : String(t.status || 'PRÓXIMAMENTE').toUpperCase();
    var premio = (t.prize_pool != null && Number(t.prize_pool) > 0) ? ('$' + Number(t.prize_pool).toLocaleString('es-ES') + ' EN PREMIOS') : 'PREMIO POR ANUNCIAR';
    var cupo = (t.max_participants != null) ? (Number(t.current_participants) || 0) + '/' + Number(t.max_participants) + ' CUPOS' : 'CUPOS ABIERTOS';
    return '<div class="tm-tcard" data-href="torneos.html" role="link" tabindex="0">' +
      '<div class="tm-timg"><span class="tm-badge' + (ongoing ? '' : ' b2') + '">' + esc(badge) + '</span>' +
      '<div class="tm-tlogo">VANTS<small>' + esc(String(t.tier || 'open').toUpperCase()) + '</small></div></div>' +
      '<div class="tm-tbody"><div class="tm-tname">' + esc(t.name || 'Torneo VANTS') + '</div>' +
      '<div class="tm-tby">Por <b>VANTS GAMES</b></div>' +
      '<div class="tm-tdesc">' + esc(t.description || 'Serie oficial de la arena VANTS. Resultados verificados y VANTS RATING en juego.') + '</div>' +
      '<div class="tm-tmeta"><span><i data-lucide="users"></i>' + esc(cupo) + '</span>' +
      '<span><i data-lucide="gift"></i>' + esc(premio) + '</span></div>' +
      '<div class="tm-tfoot"><a class="tm-tgo" href="torneos.html">INSCRIBIRSE</a></div></div></div>';
  }

  function pintarSpotlight(cards, nota, vivo) {
    var row = $('#tmSpot');
    if (!row) return;
    row.innerHTML = cards.join('');
    var b = $('#liveDataBadge');
    if (b) { b.textContent = nota; b.style.color = vivo ? '#A9FA56' : '#8A8F98'; }
    safe(function () { if (window.lucide && window.lucide.createIcons) window.lucide.createIcons(); });
  }

  function fallbackStatic() {
    pintarSpotlight(FALLBACK.map(cardFallback), 'CALENDARIO S4 · DATOS LOCALES', false);
  }

  safe(function () {
    var t0 = setTimeout(function () { if (!$('#tmSpot') || !$('#tmSpot').children.length) fallbackStatic(); }, 3500);
    function cargar() {
      clearTimeout(t0);
      try {
        var DB = window.VantDB;
        if (!DB || typeof DB.tournaments !== 'function') { fallbackStatic(); return; }
        Promise.resolve(DB.tournaments()).then(function (rows) {
          if (Array.isArray(rows) && rows.length) {
            var cards = rows.slice(0, 8).map(cardReal);
            pintarSpotlight(cards, 'DATOS EN VIVO · NEON · ' + rows.length + ' TORNEOS', true);
          } else { fallbackStatic(); }
        }).catch(fallbackStatic);
      } catch (e) { fallbackStatic(); }
    }
    if (document.readyState === 'complete' || document.readyState === 'interactive') setTimeout(cargar, 400);
    else window.addEventListener('DOMContentLoaded', function () { setTimeout(cargar, 400); });
  });

  /* ---------------- 2 · FLECHAS DEL CARRUSEL ---------------- */
  safe(function () {
    var row = $('#tmSpot');
    var prev = $('#tmPrev'), next = $('#tmNext');
    if (!row) return;
    if (prev && next) {
      var paso = function () { return Math.max(300, row.clientWidth * 0.6); };
      prev.addEventListener('click', function () { row.scrollBy({ left: -paso(), behavior: 'smooth' }); });
      next.addEventListener('click', function () { row.scrollBy({ left: paso(), behavior: 'smooth' }); });
    }
    /* cards navegable (div con data-href, para no anidar <a>) */
    row.addEventListener('click', function (e) {
      var card = e.target.closest ? e.target.closest('.tm-tcard') : null;
      if (!card || e.target.closest('a')) return;
      var href = card.getAttribute('data-href');
      if (href) window.location.href = href;
    });
    row.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      var card = e.target.closest ? e.target.closest('.tm-tcard') : null;
      if (card && card.getAttribute('data-href')) window.location.href = card.getAttribute('data-href');
    });
  });

  /* ---------------- 3 · MARQUEE ---------------- */
  safe(function () {
    var tr = $('#tmMarquee');
    if (!tr) return;
    var bloque = '';
    for (var i = 0; i < 8; i++) bloque += '<span>DONDE NACE LA VENTAJA <i>✦</i></span><span>JUEGA · COMPITE · GANA <i>✦</i></span><span>VANTS GAMES <i>✦</i></span>';
    tr.innerHTML = bloque + bloque; /* duplicado para bucle infinito sin salto */
  });

  /* ---------------- 4 · CONTADORES ANIMADOS ---------------- */
  safe(function () {
    var stats = document.querySelectorAll('#stats-tm [data-count]');
    if (!stats.length) return;
    function fmt(n, k) { return k ? (n >= 1000 ? (Math.round(n / 100) / 10) + 'K' : String(n)) : String(n); }
    function animar(el) {
      var objetivo = Number(el.getAttribute('data-count')) || 0;
      var suf = el.getAttribute('data-suffix') || '';
      var conK = el.getAttribute('data-k') === '1';
      var t0 = null, dur = 1400;
      function paso(ts) {
        if (!t0) t0 = ts;
        var p = Math.min(1, (ts - t0) / dur);
        var v = Math.round(objetivo * (1 - Math.pow(1 - p, 3)));
        el.textContent = fmt(v, conK) + (p === 1 ? suf : '');
        if (p < 1) requestAnimationFrame(paso);
      }
      requestAnimationFrame(paso);
    }
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { animar(en.target); obs.unobserve(en.target); } });
    }, { threshold: 0.4 });
    stats.forEach(function (el) { obs.observe(el); });
  });

  /* ---------------- 5 · TARJETA DISCORD (sin invite aún) ---------------- */
  safe(function () {
    var d = $('#tmDiscordCard');
    if (!d) return;
    d.addEventListener('click', function (e) {
      e.preventDefault();
      toast('🔗 El invite del Discord oficial se entrega con tu cuenta: ingresa y lo verás en tu panel. Próximamente también aquí.', 'info');
    });
  });

  /* ---------------- 6 · CARDS DE JUEGO → CAMBIAR ARENA ---------------- */
  safe(function () {
    document.querySelectorAll('.tm-gcard[data-pick]').forEach(function (c) {
      c.addEventListener('click', function () {
        var g = c.getAttribute('data-pick');
        var btn = document.querySelector('.gbtn[data-game="' + g + '"]');
        if (btn) btn.click();
      });
    });
  });
})();
