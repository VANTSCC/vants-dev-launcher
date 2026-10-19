/* ============================================================
   VANTS · plataforma.js — lógica de la plataforma de torneos
   ------------------------------------------------------------
   Módulo INDEPENDIENTE (no toca arena.js/Auth0/strafe-home).
   · Estados reutilizables: skeleton / empty / error(reintentar).
   · Consume la API pública del Worker:
     /api/games /api/tournaments[/slug] /api/matches /api/teams
     /api/players /api/articles[/slug] /api/search
   · Páginas que activa (por body[data-plataforma]):
     equipos · noticias · noticia · busqueda
   · Chip DEMO visible en todo dato is_demo=true (nunca pasa por real).
   Usa window.VANTS_API (api-client.js) si está; si no, fetch directo.
   ============================================================ */
(function () {
  'use strict';
  if (window.__VANTS_PLATAFORMA__) return;
  window.__VANTS_PLATAFORMA__ = true;

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var I = function () { return (window.VANTS_I18N && window.VANTS_I18N.t) ? window.VANTS_I18N : null; };

  var MES = { es: ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'], en: ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'] };
  function lang() { return (window.VANTS_I18N && window.VANTS_I18N.lang) || 'es'; }
  function fechaCorta(iso) {
    try { var d = new Date(iso); if (isNaN(d.getTime())) return '—'; return d.getDate() + ' ' + MES[lang()][d.getMonth()]; } catch (e) { return '—'; }
  }
  function fechaLarga(iso) {
    try { var d = new Date(iso); if (isNaN(d.getTime())) return '—'; return d.toLocaleDateString(lang() === 'en' ? 'en-GB' : 'es-ES', { day: 'numeric', month: 'long', year: 'numeric' }); } catch (e) { return '—'; }
  }

  /* ---------------- fetch tolerante ---------------- */
  function get(url) {
    try {
      if (window.VANTS_API && typeof window.VANTS_API.get === 'function') return window.VANTS_API.get(url);
    } catch (e) {}
    return fetch(url, { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, status: r.status, data: j }; }); })
      .catch(function (e) { return { ok: false, status: 0, data: null, error: e }; });
  }

  /* ---------------- estados UI reutilizables ---------------- */
  function skeleton(host, n) {
    var filas = '';
    for (var i = 0; i < (n || 3); i++) filas += '<div class="pf-skel-row"><span class="pf-skel sk-ic"></span><span class="pf-skel sk-main"></span><span class="pf-skel sk-col"></span><span class="pf-skel sk-col"></span></div>';
    host.innerHTML = '<div class="pf-skeleton" role="status" aria-live="polite">' + filas + '</div>';
  }
  function empty(host, mensaje) {
    host.innerHTML = '<div class="pf-empty"><b>' + esc((I() && I().t('sin_datos')) || 'SIN RESULTADOS') + '</b>' + esc(mensaje || '') + '</div>';
  }
  function error(host, onRetry) {
    host.innerHTML = '<div class="pf-error"><b>' + esc((I() && I().t('error_red')) || 'No se pudieron cargar los datos.') + '</b><button class="pf-retry" type="button">' + esc((I() && I().t('reintentar')) || 'REINTENTAR') + '</button></div>';
    var b = $('.pf-retry', host);
    if (b && typeof onRetry === 'function') b.addEventListener('click', onRetry);
  }

  /* ---------------- chip DEMO ---------------- */
  function chipDemo(isDemo) {
    return isDemo ? '<span class="sf-badge demo" title="' + esc((I() && I().t('demo_title')) || 'Datos de demostración') + '">' + esc((I() && I().t('demo')) || 'DEMO') + '</span>' : '';
  }

  /* ---------------- PÁGINA: EQUIPOS ---------------- */
  function paginaEquipos() {
    var host = $('#pfEquipos');
    if (!host) return;
    skeleton(host, 4);
    get('/api/teams' + (location.search || '')).then(function (r) {
      var items = r.ok && r.data && r.data.ok && Array.isArray(r.data.data) ? r.data.data : null;
      if (!items) { error(host, paginaEquipos); return; }
      if (!items.length) { empty(host, (I() && I().t('sin_datos')) || ''); return; }
      host.innerHTML = '<div class="pf-cards">' + items.map(function (t) {
        return '<article class="pf-card">' +
          '<div class="pf-card-head"><span class="pf-avatar" aria-hidden="true">' + esc((t.tag || t.nombre || '?').slice(0, 3).toUpperCase()) + '</span>' +
          '<h3>' + esc(t.nombre) + chipDemo(t.is_demo) + '</h3></div>' +
          '<p class="pf-meta">' + esc(String(t.game || '—').toUpperCase()) + ' · ' + esc(t.region || '—') + '</p>' +
          '<p class="pf-meta dim">' + esc(t.slug) + '</p></article>';
      }).join('') + '</div>';
    }).catch(function () { error(host, paginaEquipos); });
  }

  /* ---------------- PÁGINA: NOTICIAS ---------------- */
  function paginaNoticias() {
    var host = $('#pfNoticias');
    if (!host) return;
    skeleton(host, 3);
    get('/api/articles' + (location.search || '')).then(function (r) {
      var d = r.ok && r.data && r.data.ok && r.data.data ? r.data.data : null;
      if (!d) { error(host, paginaNoticias); return; }
      var items = d.items || [];
      if (!items.length) { empty(host, (I() && I().t('sin_datos')) || ''); return; }
      host.innerHTML = '<div class="pf-arts">' + items.map(function (a) {
        return '<article class="pf-art">' +
          '<div class="pf-art-body"><h3><a href="/noticia?slug=' + encodeURIComponent(a.slug) + '">' + esc(a.titulo) + '</a>' + chipDemo(a.is_demo) + '</h3>' +
          '<p>' + esc(a.resumen || '') + '</p>' +
          '<p class="pf-meta dim">' + esc((I() && I().t('publicado')) || 'Publicado') + ' ' + esc(fechaLarga(a.publicado_at)) + (a.autor ? ' · ' + esc((I() && I().t('autor')) || 'Por') + ' ' + esc(a.autor) : '') + '</p></div>' +
          '<a class="pf-art-go" href="/noticia?slug=' + encodeURIComponent(a.slug) + '" aria-label="' + esc(a.titulo) + '"><i data-lucide="chevron-right"></i></a></article>';
      }).join('') + '</div>';
    }).catch(function () { error(host, paginaNoticias); });
  }

  /* ---------------- PÁGINA: FICHA DE ARTÍCULO ---------------- */
  function paginaNoticia() {
    var host = $('#pfNoticia');
    if (!host) return;
    var slug = new URLSearchParams(location.search).get('slug') || '';
    if (!slug) { empty(host, ''); return; }
    skeleton(host, 2);
    get('/api/articles/' + encodeURIComponent(slug)).then(function (r) {
      var a = r.ok && r.data && r.data.ok && r.data.data ? r.data.data : null;
      if (!a) { empty(host, ''); return; }
      var cuerpo = String(a.cuerpo || '').split(/\n+/).filter(Boolean).map(function (p) { return '<p>' + esc(p) + '</p>'; }).join('');
      host.innerHTML = '<article class="pf-art-full">' +
        '<h2>' + esc(a.titulo) + chipDemo(a.is_demo) + '</h2>' +
        '<p class="pf-meta dim">' + esc((I() && I().t('publicado')) || 'Publicado') + ' ' + esc(fechaLarga(a.publicado_at)) + (a.autor ? ' · ' + esc(a.autor) : '') + '</p>' +
        (cuerpo || '<p></p>') +
        '<p><a class="pf-volver" href="/noticias">‹ ' + esc((I() && I().t('nav_noticias')) || 'Noticias') + '</a></p></article>';
      document.title = a.titulo + ' | VANTS';
      var md = document.querySelector('meta[name="description"]');
      if (md && a.resumen) md.setAttribute('content', a.resumen);
    }).catch(function () { error(host, paginaNoticia); });
  }

  /* ---------------- PÁGINA: BÚSQUEDA ---------------- */
  function paginaBusqueda() {
    var host = $('#pfBusqueda');
    var input = $('#pfBuscaInput');
    if (!host) return;
    var q = (new URLSearchParams(location.search).get('q') || '').trim();
    if (input && q && input.value !== q) input.value = q;
    if (q.length < 2) { empty(host, (I() && I().t('vacio_busqueda')) || ''); return; }
    skeleton(host, 3);
    get('/api/search?q=' + encodeURIComponent(q)).then(function (r) {
      var d = r.ok && r.data && r.data.ok && r.data.data ? r.data.data : null;
      if (!d) { error(host, function () { paginaBusqueda(); }); return; }
      var hay = (d.torneos || []).length + (d.equipos || []).length + (d.jugadores || []).length + (d.articulos || []).length;
      var tit = '<h2 class="pf-search-title">' + esc(((I() && I().t('resultados_para')) || 'Resultados para "{q}"').split('{q}').join(q)) + '</h2>';
      if (!hay) { host.innerHTML = tit + ''; empty(host, ((I() && I().t('vacio_busqueda_res')) || 'Sin resultados para "{q}".').split('{q}').join(q)); return; }
      var secciones = [];
      function lista(titulo, filas, hrefFn) {
        if (!filas.length) return;
        secciones.push('<h3 class="pf-search-h">' + esc(titulo) + '</h3><ul class="pf-search-list">' +
          filas.map(function (x) { return '<li><a href="' + hrefFn(x) + '">' + esc(x.nombre || x.titulo || '') + chipDemo(x.is_demo) + '</a></li>'; }).join('') + '</ul>');
      }
      lista((I() && I().t('secciones.torneos')) || 'Torneos', d.torneos || [], function (x) { return '/torneo?slug=' + encodeURIComponent(x.slug); });
      lista((I() && I().t('secciones.equipos')) || 'Equipos', d.equipos || [], function (x) { return '/equipos'; });
      lista((I() && I().t('secciones.jugadores')) || 'Jugadores', d.jugadores || [], function (x) { return '/jugadores'; });
      lista((I() && I().t('secciones.articulos')) || 'Artículos', d.articulos || [], function (x) { return '/noticia?slug=' + encodeURIComponent(x.slug); });
      host.innerHTML = tit + secciones.join('');
    }).catch(function () { error(host, function () { paginaBusqueda(); }); });
  }

  /* ---------------- boot por body[data-plataforma] ---------------- */
  function boot() {
    var modo = document.body.getAttribute('data-plataforma');
    if (modo === 'equipos') paginaEquipos();
    else if (modo === 'noticias') paginaNoticias();
    else if (modo === 'noticia') paginaNoticia();
    else if (modo === 'busqueda') paginaBusqueda();
    // Re-render al cambiar idioma (los textos de estados se regeneran)
    document.addEventListener('vants:lang', function () {
      if (modo === 'equipos') paginaEquipos();
      else if (modo === 'noticias') paginaNoticias();
      else if (modo === 'noticia') paginaNoticia();
      else if (modo === 'busqueda') paginaBusqueda();
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.VANTS_PLAT = { skeleton: skeleton, empty: empty, error: error, chipDemo: chipDemo, get: get, fechaCorta: fechaCorta, fechaLarga: fechaLarga };
})();
