/* ============================================================
   VANTS · VISTA PREVIA DE CATEGORÍAS
   ------------------------------------------------------------
   · Nav superior: al pasar el mouse por SALA/PARTIDOS/RANKING/...,
     se despliega un panel de vista previa. Clic = abre la sección.
   · Inicio: sección EXPLORAR (las categorías del viejo cajón) con
     panel de vista previa al pasar el mouse. Clic = abre.
   · El cajón MENÚ fue eliminado: todo vive en la portada.
   Módulo independiente: no toca arena.js ni Auth0.
   ============================================================ */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var ACC = '#FF0D2E';

  var DATA = {
    perfil: { k: 'IDENTIDAD', t: 'PERFIL DE JUGADOR', i: 'user', c: ACC,
      d: 'Tu ficha única en el circuito: rango VANTS RANKED, insignias verificadas, estadísticas reales y todo lo editable en un solo lugar.',
      li: ['Banner, datos y equipo editables', 'Series VANTS RANKED y partidas FACEIT', 'Cuentas conectadas, ajustes y sesión'] },
    partidos: { k: 'AGENDA', t: 'PARTIDOS', i: 'swords', c: ACC,
      d: 'Los partidos del día con horarios y resultados reales, hora de Caracas. Cobertura de vlr.gg, sin simulación.',
      li: ['Partidos y resultados en vivo', 'Cara a cara con detalle de la serie', 'Enlace a la fuente oficial'] },
    ranking: { k: 'LÍDERES', t: 'RANKING', i: 'bar-chart-3', c: '#4CC9F0',
      d: 'La tabla real del circuito: rating, RR, partidos y winrate de cada jugador registrado en Neon.',
      li: ['Datos reales de la base', 'Ordená por cualquier columna', 'Buscador de jugadores y equipos'] },
    llaves: { k: 'LLAVES', t: 'BRACKET', i: 'git-fork', c: ACC,
      d: 'El bracket principal del torneo: doble eliminación al mejor de tres, actualizado con cada serie.',
      li: ['Cuartos, semifinales y final', 'Llaves inferiores incluidas', 'Cada cruce abre su detalle'] },
    torneos: { k: 'CALENDARIO', t: 'TORNEOS', i: 'trophy', c: '#F5C044',
      d: 'Torneos abiertos con inscripción por equipo: los PRO tienen fee y los FREE son entrada libre.',
      li: ['Calendario y premios', 'Inscripción con tu equipo', 'Cupos y fee por torneo'] },
    rangos: { k: 'VANTS RANKED', t: 'RANGOS', i: 'medal', c: ACC,
      d: 'Ocho tiers, un solo destino: de FUNDICIÓN a VANTS APEX. Conocé cómo se gana RR y qué rango te espera.',
      li: ['Los 8 emblemas por tier', 'Sub-niveles I · II · III', 'Cómo subir y cómo se pierde RR'] },
    jugadores: { k: 'IDENTIDADES', t: 'SALA DE JUGADORES', i: 'users', c: '#4CC9F0',
      d: 'Las identidades del circuito: perfiles reales creados al iniciar sesión, con insignias y canales vinculados.',
      li: ['Fichas reales de cada jugador', 'Canales en directo de creadores', 'Clips destacados de la comunidad'] },
    equipo: { k: 'VANTS DE 5', t: 'EQUIPO', i: 'shield', c: '#F5C044',
      d: 'Tu equipo del circuito: nombre, tag y foto; inscripciones en vivo y campeones de la temporada.',
      li: ['Inscripciones en vivo', 'Mosaico de equipos asociados', 'Campeones con corona'] },
    clips: { k: 'MOMENTOS', t: 'CLIPS', i: 'clapperboard', c: '#B44CFF',
      d: 'Los mejores momentos de la comunidad, subidos desde la app VANTS CLIPS y destacados por sus autores.',
      li: ['Vitrina pública de clips', 'Reproductor integrado', 'Cada clip atado a su cuenta'] },
    historia: { k: 'LA MARCA', t: 'HISTORIA', i: 'book-open', c: '#93939D',
      d: 'De dónde viene VANTS: la ventaja que se gana, el logo y el circuito que creció desde 2019.',
      li: ['Origen y fundación', 'El sistema de insignias', 'Línea de tiempo del circuito'] },
    guia: { k: 'CÓMO FUNCIONA', t: 'GUÍA', i: 'compass', c: '#3EE6A0',
      d: 'Todo lo que necesitás saber para competir: cuenta, perfil, torneos, rangos, pase y pagos.',
      li: ['Paso a paso para arrancar', 'Reglas y verificaciones', 'Preguntas frecuentes'] },
    membresias: { k: 'VANTS PRO', t: 'MEMBRESÍAS', i: 'crown', c: '#F5C044',
      d: 'Elegí tu nivel: FREE para competir hoy, PRO para subir con stats avanzadas y CREATOR para streamers.',
      li: ['FREE · PRO · CREATOR', 'Insignias verificables', 'Pase de temporada y patrocinios'] },
    tienda: { k: 'OFICIAL', t: 'TIENDA', i: 'shopping-bag', c: '#F5C044',
      d: 'La tienda oficial VANTS × VegaStore: indumentaria y gear del circuito, con envíos a toda LATAM.',
      li: ['Colección oficial', 'Gear y accesorios', 'Envíos y soporte'] },
    descargar: { k: 'WINDOWS', t: 'DESCARGAR', i: 'monitor-down', c: '#4CC9F0',
      d: 'VANTS HUB para Windows: tu biblioteca, membresía, partidos y conexiones desde una app propia.',
      li: ['Instalador oficial', 'Login con tu cuenta VANTS', 'Auto-actualizaciones'] }
  };

  function keyFor(href) {
    if (!href || href === '#' || href.indexOf('hcPerfil') >= 0 || href.indexOf('mdPerfil') >= 0) return 'perfil';
    var m = String(href).match(/([a-z\-]+)\.html/);
    return m ? m[1] : 'perfil';
  }

  var touchMode = !window.matchMedia || !window.matchMedia('(hover: hover)').matches;

  /* ---------------- estilos ---------------- */
  var css = ''
    + '.pv-media{position:relative;flex:none;height:200px;border-bottom:1px solid var(--line2);background:radial-gradient(90% 120% at 20% 0%,color-mix(in srgb,var(--pvc) 22%,transparent),transparent 60%),linear-gradient(160deg,#101014,#0A0A0D 70%);overflow:hidden}'
    + '.pv-media:after{content:"";position:absolute;inset:0;background:repeating-linear-gradient(0deg,transparent 0 3px,rgba(255,255,255,.015) 3px 4px);pointer-events:none}'
    + '.pv-kick{position:absolute;top:18px;left:22px;font:700 9px var(--mono);letter-spacing:.3em;color:var(--pvc)}'
    + '.pv-ic{position:absolute;left:22px;bottom:20px;width:66px;height:66px;display:flex;align-items:center;justify-content:center;border:1px solid color-mix(in srgb,var(--pvc) 55%,transparent);background:color-mix(in srgb,var(--pvc) 10%,#0B0B0E);clip-path:polygon(14px 0,100% 0,100% calc(100% - 14px),calc(100% - 14px) 100%,0 100%,0 14px)}'
    + '.pv-ic svg{width:28px;height:28px;color:var(--pvc)}'
    + '.pv-mark{position:absolute;right:-28px;bottom:-36px;width:200px;height:200px;opacity:.07;filter:grayscale(1)}'
    + '.pv-body{padding:20px 22px 12px;overflow-y:auto;flex:1;min-height:0}'
    + '.pv-title{font:800 24px/1.05 var(--sans);letter-spacing:.02em;text-transform:uppercase;color:var(--text);margin:0 0 10px}'
    + '.pv-desc{font:500 11.5px/1.75 var(--mono);color:var(--muted);margin:0 0 16px}'
    + '.pv-sub{font:700 8.5px var(--mono);letter-spacing:.28em;color:var(--dim);margin:0 0 8px}'
    + '.pv-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:7px}'
    + '.pv-list li{position:relative;padding-left:16px;font:600 10.5px/1.6 var(--mono);color:var(--muted)}'
    + '.pv-list li:before{content:"";position:absolute;left:0;top:7px;width:6px;height:6px;background:var(--pvc)}'
    + '.pv-foot{flex:none;padding:14px 22px 20px;border-top:1px solid var(--line);display:flex;flex-direction:column;gap:10px}'
    + '.pv-cta{display:flex;align-items:center;justify-content:center;gap:8px;background:var(--pvc);color:#fff;font:800 11px var(--mono);letter-spacing:.1em;padding:13px;clip-path:polygon(10px 0,100% 0,100% calc(100% - 10px),calc(100% - 10px) 100%,0 100%,0 10px);text-decoration:none}'
    + '.pv-cta svg{width:14px;height:14px}'
    + '.pv-hint{font:500 9px var(--mono);letter-spacing:.12em;color:var(--dim);text-align:center}'
    /* nav dropdown */
    + '#navPv{position:fixed;z-index:130;width:370px;max-width:calc(100vw - 24px);background:linear-gradient(180deg,#0C0C11,#09090C);border:1px solid var(--line2,#303039);box-shadow:0 30px 70px rgba(0,0,0,.65);clip-path:polygon(16px 0,100% 0,100% calc(100% - 16px),calc(100% - 16px) 100%,0 100%,0 16px);opacity:0;transform:translateY(-6px);pointer-events:none;transition:opacity .16s ease,transform .16s ease;--pvc:' + ACC + ';display:flex;flex-direction:column;overflow:hidden}'
    + '#navPv.on{opacity:1;transform:none;pointer-events:auto}'
    + '#navPv .pv-media{height:128px}'
    + '#navPv .pv-kick{top:14px;left:18px}'
    + '#navPv .pv-ic{left:18px;bottom:14px;width:52px;height:52px}'
    + '#navPv .pv-ic svg{width:22px;height:22px}'
    + '#navPv .pv-mark{width:150px;height:150px;right:-24px;bottom:-30px}'
    + '#navPv .pv-body{padding:16px 18px 8px}'
    + '#navPv .pv-title{font-size:19px;margin-bottom:8px}'
    + '#navPv .pv-desc{font-size:10.5px;margin-bottom:12px}'
    + '#navPv .pv-list li{font-size:10px}'
    + '#navPv .pv-foot{padding:12px 18px 14px}'
    + '#navPv .pv-hint{display:none}'
    + '@media (max-width:980px),(hover:none){#navPv{display:none}}'
    /* inicio · explorar */
    + '.home-cats .hc-grid{display:flex;border:1px solid var(--line2);background:linear-gradient(180deg,#0C0C10,#0A0A0C);clip-path:polygon(18px 0,100% 0,100% calc(100% - 18px),calc(100% - 18px) 100%,0 100%,0 18px)}'
    + '.hc-list{flex:1;min-width:0;display:flex;flex-direction:column}'
    + '.hc-row{display:flex;align-items:center;gap:13px;padding:11px 18px;border-bottom:1px solid rgba(34,34,40,.55);border-left:3px solid transparent;text-decoration:none;transition:.16s;cursor:pointer}'
    + '.hc-row:hover,.hc-row.pv-on{background:#131318;border-left-color:var(--accent)}'
    + '.hc-row>svg:first-child{width:17px;height:17px;color:var(--muted);flex:none;transition:.16s}'
    + '.hc-row:hover>svg:first-child{color:var(--accent)}'
    + '.hc-row .md-txt{flex:1;display:flex;flex-direction:column;gap:2px;font:800 11.5px/1 var(--sans);letter-spacing:.07em;color:var(--text);text-transform:uppercase}'
    + '.hc-row .md-txt small{font:600 8.5px/1.2 var(--mono);letter-spacing:.12em;color:var(--dim);text-transform:uppercase}'
    + '.hc-row .md-go{width:14px;height:14px;color:var(--dim);flex:none}'
    + '.hc-row .md-new{font:800 8px/1 var(--mono);letter-spacing:.14em;color:#0A0A0C;background:var(--accent);padding:3px 6px;flex:none}'
    + '.hc-perfil{border-bottom:1px solid var(--line2)}'
    + '.hc-cols{display:grid;grid-template-columns:1fr 1fr 1fr}'
    + '.hc-col{border-right:1px solid var(--line);padding-bottom:4px}'
    + '.hc-col:last-child{border-right:0}'
    + '.hc-col .md-label{font:700 8.5px/1 var(--mono);letter-spacing:.28em;color:var(--dim);padding:12px 18px 7px}'
    + '.hc-preview{width:380px;flex:none;border-left:1px solid var(--line2);display:flex;flex-direction:column;--pvc:' + ACC + ';background:radial-gradient(120% 80% at 85% 0%,rgba(255,13,46,.12),transparent 55%),linear-gradient(180deg,#0C0C11,#09090C)}'
    + '.hc-preview .pv-media{height:170px}'
    + '.hc-preview .pv-body{padding:18px 20px 8px}'
    + '.hc-preview .pv-title{font-size:21px}'
    + '.hc-preview .pv-desc{font-size:11px}'
    + '.hc-preview .pv-foot{padding:12px 20px 16px}'
    + '@media (max-width:980px){'
    + '  .home-cats .hc-grid{flex-direction:column}'
    + '  .hc-preview{display:none}'
    + '  .hc-cols{grid-template-columns:1fr 1fr}'
    + '}'
    + '@media (max-width:620px){'
    + '  .hc-cols{grid-template-columns:1fr}'
    + '  .hc-row{padding:10px 14px}'
    + '}';
  var st = document.createElement('style');
  st.id = 'pv-style';
  st.textContent = css;
  document.head.appendChild(st);

  /* ---------------- relleno genérico ---------------- */
  function buildHTML() {
    return '<div class="pv-media"><span class="pv-kick" data-pv-kick></span>'
      + '<span class="pv-ic" data-pv-ic><i data-lucide="crosshair"></i></span>'
      + '<svg class="pv-mark" viewBox="0 0 64 64" aria-hidden="true"><use href="#vmark"/></svg></div>'
      + '<div class="pv-body"><p class="pv-title" data-pv-title></p><p class="pv-desc" data-pv-desc></p>'
      + '<p class="pv-sub">DENTRO DE LA SECCIÓN</p><ul class="pv-list" data-pv-list></ul></div>'
      + '<div class="pv-foot"><a class="pv-cta" data-pv-cta href="#"><i data-lucide="arrow-up-right"></i>ABRIR SECCIÓN</a>'
      + '<span class="pv-hint" data-pv-hint></span></div>';
  }
  function fill(root, key, href) {
    var x = DATA[key] || DATA.perfil;
    root.style.setProperty('--pvc', x.c || ACC);
    var k = $('[data-pv-kick]', root); if (k) k.textContent = '/// ' + x.k;
    var ic = $('[data-pv-ic]', root); if (ic) ic.innerHTML = '<i data-lucide="' + x.i + '"></i>';
    var tt = $('[data-pv-title]', root); if (tt) tt.textContent = x.t;
    var ds = $('[data-pv-desc]', root); if (ds) ds.textContent = x.d;
    var ls = $('[data-pv-list]', root); if (ls) ls.innerHTML = (x.li || []).map(function (t) { return '<li>' + t + '</li>'; }).join('');
    var ct = $('[data-pv-cta]', root); if (ct) ct.setAttribute('href', href || '#');
    var hn = $('[data-pv-hint]', root); if (hn) hn.textContent = touchMode ? 'Tocá ABRIR SECCIÓN para entrar' : 'Pasá el mouse por una opción · clic para abrir';
    if (window.lucide && lucide.createIcons) { try { lucide.createIcons(); } catch (e) {} }
  }

  /* ---------------- 1) NAV SUPERIOR ---------------- */
  var navPv = document.createElement('div');
  navPv.id = 'navPv';
  navPv.setAttribute('aria-live', 'polite');
  navPv.innerHTML = buildHTML();
  document.body.appendChild(navPv);

  var hideTimer = null;
  function showNavPv(link) {
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
    var href = link.getAttribute('href') || '';
    var key = keyFor(href);
    if (!DATA[key]) return;
    fill(navPv, key, href);
    var r = link.getBoundingClientRect();
    var w = 370;
    var left = Math.min(Math.max(12, r.left), Math.max(12, window.innerWidth - w - 12));
    navPv.style.left = left + 'px';
    navPv.style.top = (r.bottom + 10) + 'px';
    navPv.classList.add('on');
  }
  function hideNavPv(delay) {
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(function () { navPv.classList.remove('on'); }, delay || 160);
  }
  $$('.nav-links a').forEach(function (a) {
    var key = keyFor(a.getAttribute('href') || '');
    if (!DATA[key]) return;
    a.setAttribute('data-pv', key);
    if (touchMode) return;
    a.addEventListener('mouseenter', function () { showNavPv(a); });
    a.addEventListener('focus', function () { showNavPv(a); });
    a.addEventListener('mouseleave', function () { hideNavPv(160); });
  });
  navPv.addEventListener('mouseenter', function () { if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; } });
  navPv.addEventListener('mouseleave', function () { hideNavPv(120); });
  window.addEventListener('scroll', function () { navPv.classList.remove('on'); }, { passive: true });
  window.addEventListener('resize', function () { navPv.classList.remove('on'); });

  /* ---------------- 2) INICIO · EXPLORAR ---------------- */
  var hcPrev = document.getElementById('hcPreview');
  if (hcPrev) {
    hcPrev.innerHTML = buildHTML();
    var hcRows = $$('.hc-row');
    var activeKey = null;
    function paintHc(key, href) {
      activeKey = key;
      fill(hcPrev, key, href);
      $$('.hc-row').forEach(function (x) { x.classList.toggle('pv-on', x.getAttribute('data-pv') === key && key !== 'perfil'); });
    }
    hcRows.forEach(function (r) {
      var href = r.getAttribute('href') || '';
      var key = keyFor(href);
      r.setAttribute('data-pv', key);
      if (!touchMode) {
        r.addEventListener('mouseenter', function () { paintHc(key, href); });
        r.addEventListener('focus', function () { paintHc(key, href); });
      }
    });
    paintHc('perfil', '#');

    var perfilRow = document.getElementById('hcPerfil');
    if (perfilRow) {
      perfilRow.addEventListener('click', function (e) {
        e.preventDefault();
        try {
          var a = window.VANTS_AUTH;
          if (a && a.sub && window.openPlayerProfile) {
            var mio = (window.VANTS_ME && window.VANTS_ME.player) || null;
            if (!mio && a.playerId) { mio = (window.VANTS_PLAYERS || []).find(function (x) { return String(x.id) === String(a.playerId); }) || null; }
            if (mio) { window.openPlayerProfile(mio); return; }
          }
        } catch (err) {}
        var lb = document.getElementById('arenaLoginBtn');
        if (lb && !lb.hidden) { lb.click(); return; }
        if (typeof window.toast === 'function') { try { window.toast('Ingresá para abrir tu perfil de jugador', 'info'); } catch (e2) {} }
      });
    }
  }
})();
