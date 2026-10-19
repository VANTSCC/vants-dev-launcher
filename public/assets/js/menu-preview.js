/* ============================================================
   VANTS · MENÚ CAJÓN CON VISTA PREVIA (hover / touch)
   ------------------------------------------------------------
   Al pasar el mouse por una fila del cajón, el panel se ensancha y
   muestra una vista previa de esa sección (portada, descripción y qué
   hay dentro). Clic = abre la sección. En dispositivos táctiles, el
   primer toque muestra la vista previa con botón ABRIR.
   Módulo independiente: no toca arena.js ni el resto de la app.
   ============================================================ */
(function () {
  'use strict';
  var d = document.getElementById('menuDrawer');
  if (!d) return;
  var body = d.querySelector('.md-body');
  if (!body) return;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  var ACC = '#FF0D2E';
  var DATA = {
    perfil: {
      k: 'IDENTIDAD', t: 'PERFIL DE JUGADOR', i: 'user', c: ACC,
      d: 'Tu ficha única en el circuito: rango VANTS RANKED, insignias verificadas, estadísticas reales y todo lo editable en un solo lugar.',
      li: ['Banner, datos y equipo editables', 'Series VANTS RANKED y partidas FACEIT', 'Cuentas conectadas, ajustes y sesión']
    },
    partidos: {
      k: 'AGENDA', t: 'PARTIDOS', i: 'swords', c: ACC,
      d: 'Los partidos del día con horarios y resultados reales, hora de Caracas. Cobertura de vlr.gg, sin simulación.',
      li: ['Partidos y resultados en vivo', 'Cara a cara con detalle de la serie', 'Enlace a la fuente oficial']
    },
    ranking: {
      k: 'LÍDERES', t: 'RANKING', i: 'bar-chart-3', c: '#4CC9F0',
      d: 'La tabla real del circuito: rating, RR, partidos y winrate de cada jugador registrado en Neon.',
      li: ['Datos reales de la base', 'Ordená por cualquier columna', 'Buscador de jugadores y equipos']
    },
    llaves: {
      k: 'LLAVES', t: 'BRACKET', i: 'git-fork', c: ACC,
      d: 'El bracket principal del torneo: doble eliminación al mejor de tres, actualizado con cada serie.',
      li: ['Cuartos, semifinales y final', 'Llaves inferiores incluidas', 'Cada cruce abre su detalle']
    },
    torneos: {
      k: 'CALENDARIO', t: 'TORNEOS', i: 'trophy', c: '#F5C044',
      d: 'Torneos abiertos con inscripción por equipo: los PRO tienen fee y los FREE son entrada libre.',
      li: ['Calendario y premios', 'Inscripción con tu equipo', 'Cupos y fee por torneo']
    },
    rangos: {
      k: 'VANTS RANKED', t: 'RANGOS', i: 'medal', c: ACC,
      d: 'Ocho tiers, un solo destino: de FUNDICIÓN a VANTS APEX. Conocé cómo se gana RR y qué rango te espera.',
      li: ['Los 8 emblemas por tier', 'Sub-niveles I · II · III', 'Cómo subir y cómo se pierde RR']
    },
    jugadores: {
      k: 'IDENTIDADES', t: 'SALA DE JUGADORES', i: 'users', c: '#4CC9F0',
      d: 'Las identidades del circuito: perfiles reales creados al iniciar sesión, con insignias y canales vinculados.',
      li: ['Fichas reales de cada jugador', 'Canales en directo de creadores', 'Clips destacados de la comunidad']
    },
    equipo: {
      k: 'VANTS DE 5', t: 'EQUIPO', i: 'shield', c: '#F5C044',
      d: 'Tu equipo del circuito: nombre, tag y foto; inscripciones en vivo y campeones de la temporada.',
      li: ['Inscripciones en vivo', 'Mosaico de equipos asociados', 'Campeones con corona']
    },
    clips: {
      k: 'MOMENTOS', t: 'CLIPS', i: 'clapperboard', c: '#B44CFF',
      d: 'Los mejores momentos de la comunidad, subidos desde la app VANTS CLIPS y destacados por sus autores.',
      li: ['Vitrina pública de clips', 'Reproductor integrado', 'Cada clip atado a su cuenta']
    },
    historia: {
      k: 'LA MARCA', t: 'HISTORIA', i: 'book-open', c: '#93939D',
      d: 'De dónde viene VANTS: la ventaja que se gana, el logo y el circuito que creció desde 2019.',
      li: ['Origen y fundación', 'El sistema de insignias', 'Línea de tiempo del circuito']
    },
    guia: {
      k: 'CÓMO FUNCIONA', t: 'GUÍA', i: 'compass', c: '#3EE6A0',
      d: 'Todo lo que necesitás saber para competir: cuenta, perfil, torneos, rangos, pase y pagos.',
      li: ['Paso a paso para arrancar', 'Reglas y verificaciones', 'Preguntas frecuentes']
    },
    membresias: {
      k: 'VANTS PRO', t: 'MEMBRESÍAS', i: 'crown', c: '#F5C044',
      d: 'Elegí tu nivel: FREE para competir hoy, PRO para subir con stats avanzadas y CREATOR para streamers.',
      li: ['FREE · PRO · CREATOR', 'Insignias verificables', 'Pase de temporada y patrocinios']
    },
    tienda: {
      k: 'OFICIAL', t: 'TIENDA', i: 'shopping-bag', c: '#F5C044',
      d: 'La tienda oficial VANTS × VegaStore: indumentaria y gear del circuito, con envíos a toda LATAM.',
      li: ['Colección oficial', 'Gear y accesorios', 'Envíos y soporte']
    },
    descargar: {
      k: 'WINDOWS', t: 'DESCARGAR', i: 'monitor-down', c: '#4CC9F0',
      d: 'VANTS HUB para Windows: tu biblioteca, membresía, partidos y conexiones desde una app propia.',
      li: ['Instalador oficial', 'Login con tu cuenta VANTS', 'Auto-actualizaciones']
    }
  };

  function keyFor(href) {
    if (!href || href === '#' || href.indexOf('mdPerfil') >= 0) return 'perfil';
    var m = String(href).match(/([a-z\-]+)\.html/);
    return m ? m[1] : 'perfil';
  }

  /* ---- estructura: lista + panel de vista previa ---- */
  var split = document.createElement('div');
  split.className = 'md-split';
  body.parentNode.insertBefore(split, body);
  split.appendChild(body);

  var pv = document.createElement('aside');
  pv.className = 'md-preview';
  pv.setAttribute('aria-live', 'polite');
  pv.innerHTML =
    '<button type="button" class="pv-back" id="pvBack"><i data-lucide="arrow-left"></i>VOLVER</button>' +
    '<div class="pv-media">' +
      '<span class="pv-kick" id="pvKick"></span>' +
      '<span class="pv-ic" id="pvIc"><i data-lucide="crosshair"></i></span>' +
      '<svg class="pv-mark" viewBox="0 0 64 64" aria-hidden="true"><use href="#vmark"/></svg>' +
    '</div>' +
    '<div class="pv-body">' +
      '<p class="pv-title" id="pvTitle"></p>' +
      '<p class="pv-desc" id="pvDesc"></p>' +
      '<p class="pv-sub">DENTRO DE LA SECCIÓN</p>' +
      '<ul class="pv-list" id="pvList"></ul>' +
    '</div>' +
    '<div class="pv-foot">' +
      '<a class="pv-cta" id="pvCta" href="#"><i data-lucide="arrow-up-right"></i>ABRIR SECCIÓN</a>' +
      '<span class="pv-hint" id="pvHint"></span>' +
    '</div>';
  split.appendChild(pv);
  d.classList.add('has-preview');

  var touchMode = !window.matchMedia || !window.matchMedia('(hover: hover)').matches;
  var activeKey = null;

  function paint(key, href) {
    var x = DATA[key] || DATA.perfil;
    activeKey = key;
    $('#pvKick').textContent = '/// ' + x.k;
    $('#pvTitle').textContent = x.t;
    $('#pvDesc').textContent = x.d;
    $('#pvIc').innerHTML = '<i data-lucide="' + x.i + '"></i>';
    $('#pvList').innerHTML = (x.li || []).map(function (t) { return '<li>' + t + '</li>'; }).join('');
    pv.style.setProperty('--pvc', x.c || ACC);
    $('#pvCta').setAttribute('href', href || '#');
    $('#pvHint').textContent = touchMode ? 'Tocá ABRIR SECCIÓN para entrar' : 'Pasá el mouse por una opción · clic para abrir';
    if (window.lucide && lucide.createIcons) { try { lucide.createIcons(); } catch (e) {} }
  }

  var rows = $$('.md-row', body);
  rows.forEach(function (r) {
    var href = r.getAttribute('href') || '';
    var key = keyFor(href);
    r.setAttribute('data-pv', key);
    if (touchMode) {
      r.addEventListener('click', function (ev) {
        if (!d.classList.contains('pv-open')) {
          ev.preventDefault();
          paint(key, href);
          d.classList.add('pv-open');
        }
      });
    } else {
      r.addEventListener('mouseenter', function () { paint(key, href); marcar(r); });
      r.addEventListener('focus', function () { paint(key, href); marcar(r); });
    }
  });

  function marcar(r) {
    $$('.md-row', body).forEach(function (x) { x.classList.toggle('pv-on', x === r); });
  }

  var back = $('#pvBack');
  if (back) back.addEventListener('click', function () { d.classList.remove('pv-open'); });

  if (rows.length) paint(keyFor(rows[0].getAttribute('href') || ''), rows[0].getAttribute('href'));
  else paint('perfil', '#');

  /* al abrir el cajón se pinta la vista previa; al cerrarlo, se limpia el modo móvil */
  try {
    new MutationObserver(function () {
      if (d.classList.contains('show')) {
        if (!activeKey) paint('perfil', '#');
        if (!touchMode) {
          var act = $('.md-row[data-pv="' + activeKey + '"]', body);
          if (act) act.classList.add('pv-on');
        }
      } else {
        d.classList.remove('pv-open');
      }
    }).observe(d, { attributes: true, attributeFilter: ['class'] });
  } catch (eObs) {}

  /* ---- estilos (autocontenidos) ---- */
  var css = ''
    + '#menuDrawer.has-preview{width:min(880px,100vw)}'
    + '#menuDrawer .md-split{display:flex;flex:1;min-height:0}'
    + '#menuDrawer .md-split .md-body{flex:1;min-width:0}'
    + '#menuDrawer .md-preview{display:none;position:relative;--pvc:' + ACC + '}'
    + '@media (hover:hover) and (min-width:981px){'
    + '  #menuDrawer.has-preview{width:min(880px,100vw)}'
    + '  #menuDrawer .md-preview{display:flex;flex-direction:column;flex:none;width:420px;border-left:1px solid var(--line2);background:radial-gradient(120% 80% at 85% 0%,rgba(255,13,46,.14),transparent 55%),linear-gradient(180deg,#0C0C11,#09090C);overflow:hidden}'
    + '  #menuDrawer .md-preview .pv-back{display:none}'
    + '  #menuDrawer .md-row.pv-on{background:var(--panel2);border-left-color:var(--accent)}'
    + '}'
    + '@media (hover:none),(max-width:980px){'
    + '  #menuDrawer.pv-open{width:min(430px,100vw)}'
    + '  #menuDrawer.pv-open .md-preview{display:flex;flex-direction:column;position:absolute;inset:0;z-index:6;background:linear-gradient(180deg,#0C0C11,#09090C)}'
    + '  #menuDrawer.pv-open .pv-back{display:inline-flex}'
    + '}'
    + '.pv-back{display:none;align-items:center;gap:8px;margin:14px 18px 0;background:none;border:0;color:var(--muted);font:700 10px var(--mono);letter-spacing:.14em;cursor:pointer}'
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
    + '.pv-hint{font:500 9px var(--mono);letter-spacing:.12em;color:var(--dim);text-align:center}';
  var st = document.createElement('style');
  st.id = 'pv-style';
  st.textContent = css;
  document.head.appendChild(st);
})();
