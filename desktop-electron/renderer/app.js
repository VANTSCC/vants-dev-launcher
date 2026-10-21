// ═══════════════════════════════════════════════════════════════
// VANTS HUB · app.js — renderer (estilo FACEIT, cajones VANTS)
// Sesión Auth0 · Mi Cuenta · Partidos · Bracket · Líderes ·
// En Vivo · Biblioteca con portadas · Membresía (planes dentro
// del hub) · Conexiones gestionadas 100% desde el hub · Buscador
// ═══════════════════════════════════════════════════════════════
'use strict';
const H = window.vantsHub;

let SESION = null;      // perfil público { sub, name, email, picture, pid }
let YO = null;          // fila players propia
let BIBLIOTECA = [];
let presModo = 'online';
let periodo = 'mo';     // mo | yr (planes)
const timers = {};

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function api(ruta, opts) {
  const r = await H.api(ruta, opts);
  if (r && r.__noauth) throw new Error('sin sesión');
  if (r && r.__error) throw new Error(r.__error);
  return r;
}

// ───────── controles de ventana (titlebar propia) ─────────
$('#win-min').addEventListener('click', () => H.ventana('min'));
$('#win-max').addEventListener('click', () => H.ventana('max'));
$('#win-close').addEventListener('click', () => H.ventana('close'));

// ───────── navegación por cajones ─────────
function irACajon(nombre) {
  $$('.nav-it').forEach(b => b.classList.toggle('activa', b.dataset.cajon === nombre));
  $$('.cajon').forEach(c => c.classList.toggle('activo', c.id === 'cajon-' + nombre));
  const cargas = {
    inicio: cargarInicio, cuenta: cargarCuenta, partidos: cargarPartidos,
    bracket: cargarBracket, lideres: cargarLideres, vivo: cargarVivo,
    biblioteca: cargarBiblioteca, membresia: cargarMembresia, conexiones: cargarConexiones
  };
  if (cargas[nombre]) cargas[nombre]();
  $('#main').scrollTop = 0;
}
$$('.nav-it').forEach(b => b.addEventListener('click', () => irACajon(b.dataset.cajon)));
$$('[data-ir]').forEach(b => b.addEventListener('click', () => irACajon(b.dataset.ir)));
$('#btn-conexiones-ir').addEventListener('click', () => irACajon('conexiones'));
$('#btn-tienda').addEventListener('click', () => H.abrir('https://vants.vants.workers.dev/tienda.html'));
$('#btn-ver-en-web').addEventListener('click', () => H.abrir('https://vants.vants.workers.dev/jugadores.html'));
$('#rail-web').addEventListener('click', () => H.abrir('https://vants.vants.workers.dev/'));

// ───────── sesión ─────────
async function refrescarSesion() {
  SESION = await H.sesion();
  pintarSesion();
  const cajonActivo = ($('.cajon.activo') || {}).id || '';
  if (cajonActivo === 'cajon-cuenta') cargarCuenta();
  if (cajonActivo === 'cajon-partidos') cargarPartidos();
}
function pintarSesion() {
  const con = !!SESION;
  $('#btn-login').classList.toggle('oculto', con);
  $('#btn-logout').classList.toggle('oculto', !con);
  $('#cuenta-sin').classList.toggle('oculto', con);
  $('#cuenta-panel').classList.toggle('oculto', !con);
  $('#conn-sin').classList.toggle('oculto', con);
  $('#hero-hola').textContent = con
    ? 'Hola, ' + String(SESION.name || 'jugador').split(' ')[0].toUpperCase()
    : 'Bienvenido a VANTS HUB';
  $('#hero-sub').textContent = con
    ? 'Tu cuenta está conectada a la arena. Juega, compite y sigue el torneo desde aquí.'
    : 'Tu cuenta, tus partidos, el bracket y tu biblioteca — todo en un solo lugar.';
  capsula(con ? (SESION.pid ? 'SESIÓN ACTIVA' : 'SESIÓN SIN PERFIL') : 'SIN SESIÓN', con);
  const av = $('#rail-avatar-img');
  if (av) av.src = SESION && SESION.picture ? SESION.picture : 'logo.png';
}
function capsula(txt, ok) {
  const c = $('#estado-capsula');
  c.textContent = txt;
  c.classList.toggle('off', !ok);
}
$('#btn-login').addEventListener('click', async () => {
  $('#btn-login').lastChild.textContent = ' INICIANDO…';
  const r = await H.login();
  $('#btn-login').lastChild.textContent = ' INICIAR SESIÓN';
  if (r && r.ok) refrescarSesion();
  else if (r && r.error) modalAviso('No se pudo iniciar sesión', r.error);
});
$('#btn-logout').addEventListener('click', async () => { await H.logout(); YO = null; refrescarSesion(); });

// ───────── estado global del hub ─────────
H.onEstado((d) => {
  if (d.sesion !== undefined) { SESION = d.sesion; pintarSesion(); }
  if (d.presencia) { presModo = d.presencia; pintarPresOpciones(); }
  const jugando = d.juego;
  const p = $('#hero-punto');
  const railDot = $('#rail-dot');
  const cls = jugando ? 'naranja' : (SESION ? 'verde' : '');
  if (p) p.className = 'dot ' + cls;
  if (railDot) railDot.className = 'rail-dot ' + (jugando ? 'naranja' : (SESION ? 'verde' : ''));
  $('#hero-estado-juego') && ($('#hero-estado-juego').textContent = SESION ? (SESION.email || '') : '');
  capsula(jugando ? ('JUGANDO · ' + jugando.toUpperCase()) : (SESION ? 'EN LÍNEA · LATIENDO' : 'SIN SESIÓN'), !!SESION);
});

// ───────── INICIO ─────────
async function cargarInicio() {
  cargarVivoEn('inicio-vivo');
  cargarRapido();
}
async function cargarRapido() {
  const cont = $('#inicio-rapido');
  if (!BIBLIOTECA.length) { try { BIBLIOTECA = (await H.biblioteca()).juegos || []; } catch (e) { BIBLIOTECA = []; } }
  cont.innerHTML = BIBLIOTECA.length
    ? BIBLIOTECA.slice(0, 8).map(j =>
      `<button class="chip-juego" data-id="${esc(j.id)}"><img src="${esc(coverDe(j))}" alt="" />${esc(j.nombre)}</button>`).join('')
    : '<div class="dim">no se detectaron juegos (solo Windows: Steam / Riot / Epic)</div>';
  $$('#inicio-rapido .chip-juego').forEach(b => b.addEventListener('click', () => jugarPorId(b.dataset.id)));
}
async function jugarPorId(id) {
  const j = BIBLIOTECA.find(x => String(x.id) === String(id));
  if (j) await H.jugar(j);
}

// ───────── portadas ─────────
const COVER_MAP = [
  [/counter[- ]?strike|cs2|cs:go/i, 'cs2'],
  [/valorant/i, 'valorant'],
  [/dota/i, 'dota2'],
  [/apex/i, 'apex'],
  [/fortnite/i, 'fortnite'],
  [/gta|grand theft/i, 'gtav'],
  [/rainbow|siege|r6/i, 'r6'],
  [/overwatch/i, 'ow2'],
  [/rocket\s*league/i, 'rocket'],
  [/league\s*of\s*legends|\blol\b/i, 'lol'],
  [/ea\s*sports?\s*fc|\bfc\s*2[0-9]/i, 'fc26']
];
function coverDe(j) {
  const n = String((j && j.nombre) || '');
  for (const [re, id] of COVER_MAP) if (re.test(n)) return 'covers/' + id + '.jpg';
  return 'covers/_fallback.jpg';
}

// ───────── MI CUENTA ─────────
async function cargarCuenta() {
  if (!SESION) return;
  try {
    const filas = await api('/players?auth0_sub=eq.' + encodeURIComponent(SESION.sub) + '&select=id,username,display_name,role,verified,rating,xp,avatar_url,country,region,main_game&limit=1');
    YO = Array.isArray(filas) && filas[0] ? filas[0] : null;
  } catch (e) { YO = null; }
  if (YO) {
    $('#pct-nombre').textContent = (YO.display_name || YO.username || SESION.name || '—') + (YO.verified ? ' ✅' : '');
    $('#pct-email').textContent = SESION.email || YO.username || '';
    $('#pct-rol').textContent = (YO.role === 'owner') ? 'OWNER · VANTS' : (YO.role || 'JUGADOR').toUpperCase();
    $('#pct-xp').textContent = (YO.xp || 0) + ' XP';
    $('#pct-rating').textContent = 'RATING ' + (YO.rating != null ? YO.rating : '—');
    if (YO.avatar_url) { $('#pct-avatar').src = YO.avatar_url; } else $('#pct-avatar').src = 'logo.png';
    SESION.pid = YO.id;
  }
  pintarPresOpciones();
}
function pintarPresOpciones() {
  $$('.opt-pres').forEach(b => b.classList.toggle('activa', b.dataset.pres === presModo));
  const rd = $('#rail-pres-dot');
  if (rd) {
    rd.className = 'dot ' + (presModo === 'invisible' ? 'gris' : presModo === 'jugando' ? 'naranja' : 'verde');
    $('#rail-pres').title = 'Estado: ' + (presModo === 'invisible' ? 'INVISIBLE' : presModo === 'jugando' ? 'JUGANDO' : 'EN LÍNEA');
  }
}
$$('.opt-pres').forEach(b => b.addEventListener('click', async () => {
  presModo = b.dataset.pres;
  pintarPresOpciones();
  await H.presencia(presModo);
}));
// ciclo rápido desde el rail: online → jugando → invisible → online
$('#rail-pres').addEventListener('click', async () => {
  presModo = presModo === 'online' ? 'jugando' : presModo === 'jugando' ? 'invisible' : 'online';
  pintarPresOpciones();
  await H.presencia(presModo);
});

// ───────── PARTIDOS ─────────
async function cargarPartidos() {
  if (!SESION || !SESION.pid) {
    $('#partidos-faceit').innerHTML = $('#partidos-series').innerHTML = '<div class="dim">inicia sesión para ver tus partidas</div>';
    return;
  }
  try {
    const fm = await api('/faceit_matches?player_id=eq.' + SESION.pid + '&order=played_at.desc&limit=15');
    $('#partidos-faceit').innerHTML = (Array.isArray(fm) && fm.length) ? fm.map(m => {
      const res = (m.resultado || '').toLowerCase();
      const cls = res === 'win' ? 'ganada' : (res === 'loss' ? 'perdida' : 'pendiente');
      return `<div class="fila">
        <span class="chip ${cls}">${res === 'win' ? 'GANADA' : res === 'loss' ? 'PERDIDA' : 'PENDIENTE'}</span>
        <div class="nom">${esc(m.mapa || m.map || 'partida FACEIT')}</div>
        <div class="meta">${esc((m.played_at || '').slice(0, 16).replace('T', ' '))} · +${esc(m.xp != null ? m.xp : 0)} XP</div>
      </div>`;
    }).join('') : '<div class="dim">todavía no hay partidas FACEIT registradas</div>';
  } catch (e) { $('#partidos-faceit').innerHTML = '<div class="dim">' + esc(e.message) + '</div>'; }
  try {
    const sr = await api('/series_ranked?or=(retador_id.eq.' + SESION.pid + ',rival_id.eq.' + SESION.pid + ')&order=creado_at.desc&limit=15');
    $('#partidos-series').innerHTML = (Array.isArray(sr) && sr.length) ? sr.map(s => {
      const ganadas = s.ganadas_retador != null ? s.ganadas_retador + '–' + s.ganadas_rival : '';
      const res = (s.estado || '').toLowerCase();
      const cls = res === 'final' ? (s.ganador_id === SESION.pid ? 'ganada' : 'perdida') : 'pendiente';
      return `<div class="fila">
        <span class="chip ${cls}">${cls === 'ganada' ? 'GANADA' : cls === 'perdida' ? 'PERDIDA' : 'EN CURSO'}</span>
        <div class="nom">BO${esc(s.bo || '?')} · ${esc(ganadas)}</div>
        <div class="meta">${esc((s.creado_at || '').slice(0, 16).replace('T', ' '))}</div>
      </div>`;
    }).join('') : '<div class="dim">sin series ranked todavía — reta a alguien desde la web</div>';
  } catch (e) { $('#partidos-series').innerHTML = '<div class="dim">' + esc(e.message) + '</div>'; }
}

// ───────── BRACKET ─────────
async function cargarBracket() {
  refrescarPeriodico('bracket', cargarBracketDatos, 30000);
  return cargarBracketDatos();
}
async function cargarBracketDatos() {
  try {
    const eq = await api('/v_torneo_equipos?select=id,tournament_id,name,tag,captain,region,status&order=created_at.asc');
    $('#bracket-equipos').innerHTML = (Array.isArray(eq) && eq.length)
      ? eq.map(e => `<span class="chip ${e.status === 'confirmado' ? 'ganada' : ''}">${esc(e.tag)} · ${esc(e.name)}${e.status === 'confirmado' ? ' ✔' : ' ⏳'}</span>`).join('')
      : '<div class="dim">aún no hay equipos inscritos — inscribe el tuyo desde la web</div>';
  } catch (e) { $('#bracket-equipos').innerHTML = '<div class="dim">' + esc(e.message) + '</div>'; }
  try {
    const ms = await api('/v_torneo_bracket?order=ronda.asc,slot.asc');
    const filas = Array.isArray(ms) ? ms : [];
    if (!filas.length) { $('#bracket-llaves').innerHTML = '<div class="dim">el bracket se siembra solo cuando el torneo completa 8 equipos confirmados</div>'; return; }
    const col = (ronda, titulo) => {
      const ls = filas.filter(f => f.ronda === ronda);
      return `<div class="col-llave"><h4>${titulo}</h4>${ls.map(m => `
        <div class="match ${m.estado === 'final' ? 'fin' : ''}">
          <div class="eq ${m.ganador && m.ganador === m.team_a ? 'gana' : ''}"><span>${esc(m.team_a || '—')}</span><span class="pts">${m.score_a != null ? m.score_a : ''}</span></div>
          <div class="eq ${m.ganador && m.ganador === m.team_b ? 'gana' : ''}"><span>${esc(m.team_b || '—')}</span><span class="pts">${m.score_b != null ? m.score_b : ''}</span></div>
        </div>`).join('') || '<div class="dim">—</div>'}</div>`;
    };
    $('#bracket-llaves').innerHTML =
      col('q', 'CUARTOS · Q') + col('s', 'SEMIS · S') + col('f', 'FINAL · F');
  } catch (e) { $('#bracket-llaves').innerHTML = '<div class="dim">' + esc(e.message) + '</div>'; }
}

// ───────── LÍDERES ─────────
async function cargarLideres() {
  refrescarPeriodico('lideres', cargarLideresDatos, 45000);
  return cargarLideresDatos();
}
async function cargarLideresDatos() {
  try {
    const [pls, stats] = await Promise.all([
      api('/players?select=id,username,display_name,role,verified,rating,xp,avatar_url,country&order=xp.desc&limit=50'),
      api('/season_player_stats?select=player_id,mmr,created_at&order=created_at.desc&limit=500')
    ]);
    const mmrPorPid = {};
    (Array.isArray(stats) ? stats : []).forEach(s => { if (!mmrPorPid[s.player_id]) mmrPorPid[s.player_id] = s.mmr; });
    const filas = (Array.isArray(pls) ? pls : []).map((p, i) => {
      const nombre = p.display_name || p.username || '—';
      const mmr = mmrPorPid[p.id];
      return `<div class="fila ${YO && YO.id === p.id ? 'fila-yo' : ''}">
        <div class="pos">#${i + 1}</div>
        <div class="nom ${p.role === 'owner' ? 'oro-nombre' : ''}">${esc(nombre)}${p.verified ? ' ✅' : ''}${p.role === 'owner' ? ' 👑' : ''}</div>
        <div class="meta">${mmr != null ? 'MMR ' + esc(mmr) + ' · ' : ''}${esc(p.xp || 0)} XP · rating ${esc(p.rating != null ? p.rating : '—')}</div>
      </div>`;
    }).join('');
    $('#lideres-tabla').innerHTML = filas || '<div class="dim">sin jugadores aún</div>';
    window.VANTS_JUGADORES = pls || [];
  } catch (e) { $('#lideres-tabla').innerHTML = '<div class="dim">' + esc(e.message) + '</div>'; }
}

// ───────── EN VIVO ─────────
async function cargarVivo() {
  refrescarPeriodico('vivo', cargarVivoEn.bind(null, 'vivo-tabla'), 30000);
  return cargarVivoEn('vivo-tabla');
}
async function cargarVivoEn(id) {
  try {
    const v = await api('/v_en_vivo?order=actualizado.desc&limit=50');
    const filas = Array.isArray(v) ? v : [];
    const n = filas.length;
    ['#nav-vivo-n', '#rail-vivo-n'].forEach(sel => {
      const b = $(sel); if (!b) return;
      b.textContent = n; b.classList.toggle('oculto', !n);
    });
    $(id ? ('#' + id) : '#vivo-tabla').innerHTML = filas.length ? filas.map(f => `
      <div class="fila">
        <div class="dot ${f.estado === 'jugando' ? 'naranja' : 'verde'}"></div>
        <div class="nom ${f.role === 'owner' ? 'oro-nombre' : ''}">${esc(f.display_name || f.username)}${f.verified ? ' ✅' : ''}</div>
        <div class="meta">${f.estado === 'jugando' ? '🎮 JUGANDO ' + esc(f.juego || '').toUpperCase() : '🟢 EN LÍNEA'}</div>
      </div>`).join('') : '<div class="dim">nadie conectado ahora mismo — tú podrías ser el primero</div>';
  } catch (e) {
    ['#nav-vivo-n', '#rail-vivo-n'].forEach(sel => { const b = $(sel); if (b) b.classList.add('oculto'); });
    const el = $(id ? ('#' + id) : '#vivo-tabla');
    if (el) el.innerHTML = '<div class="dim">en vivo disponible al iniciar sesión</div>';
  }
}

// ───────── BIBLIOTECA (con portadas) ─────────
async function cargarBiblioteca() {
  try {
    const d = await H.biblioteca();
    BIBLIOTECA = d.juegos || [];
    $('#biblio-sub').textContent = d.plataforma !== 'win32'
      ? 'La detección de juegos está disponible en Windows (Steam / Riot / Epic).'
      : BIBLIOTECA.length + ' juegos detectados en tu PC · nada sale de tu equipo';
    $('#biblio-grid').innerHTML = BIBLIOTECA.length ? BIBLIOTECA.map(j => `
      <div class="juego-card" id="jc-${esc(String(j.id)).replace(/[^a-zA-Z0-9_-]/g, '')}">
        <div class="juego-portada">
          <img src="${esc(coverDe(j))}" alt="" loading="lazy" />
          <span class="juego-fuente">${esc((j.fuente || '').toUpperCase())}</span>
          <span class="tag-corriendo oculto">EN JUEGO</span>
        </div>
        <div class="juego-info">
          <div class="juego-nombre" title="${esc(j.nombre)}">${esc(j.nombre)}</div>
          <button class="juego-lanzar" data-jugar="${esc(j.id)}"><svg class="ic"><use href="#i-play"/></svg> JUGAR</button>
        </div>
      </div>`).join('') : '<div class="dim">No se detectaron juegos. Prueba REESCANEAR con Steam/Riot/Epic instalados.</div>';
    $$('#biblio-grid [data-jugar]').forEach(b => b.addEventListener('click', () => jugarPorId(b.dataset.jugar)));
  } catch (e) { $('#biblio-grid').innerHTML = '<div class="dim">error: ' + esc(e.message) + '</div>'; }
}
$('#btn-rescan').addEventListener('click', cargarBiblioteca);

// ═══════════════════════════════════════════════════════════════
// MEMBRESÍA · plan actual + pase + planes (todo dentro del hub)
// ═══════════════════════════════════════════════════════════════
const PLANES = [
  {
    id: 'free', nombre: 'VANTS FREE', precio: { mo: '$0', yr: '$0' }, per: 'PARA SIEMPRE',
    desc: 'Para arrancar a competir hoy mismo.',
    feats: ['Inscripción a torneos free y ladder nocturna', 'Perfil con rango APEX y RR', 'Stats básicas de temporada', 'Conexión de cuentas de juego'],
    btn: 'PLAN ACTUAL', cls: ''
  },
  {
    id: 'pro', nombre: 'VANTS PRO', precio: { mo: '$4.99', yr: '$39.99' }, per: '/ MES · o ANUAL',
    desc: 'Para el que juega para subir. Incluye la insignia PRO en tu perfil.',
    feats: ['<b>Insignia PRO verificable</b> en perfil, brackets y rankings', 'Stats avanzadas: impacto, clutches y heatmap de contactos', 'Reporte de scouting automático de tu próximo rival', 'Historial y demos ilimitados + alertas en vivo', 'Pre-inscripción a torneos 24 h antes'],
    btn: 'ACTIVAR PRO', cls: 'destacada', bandera: 'MÁS ELEGIDO', icono: 'i-zap'
  },
  {
    id: 'creator', nombre: 'VANTS CREATOR', precio: { mo: '$9.99', yr: '$79.99' }, per: '/ MES · o ANUAL',
    desc: 'Para streams y contenido. Incluye todo PRO + insignia CREADOR verificada.',
    feats: ['<b>Insignia CREADOR verificada</b> en tu perfil', '<b>Cartel EN DIRECTO automático</b> cuando transmitís en Twitch, Kick o YouTube', 'Todo VANTS PRO incluido', 'Destacá tus clips en la home de tu perfil', 'Vía rápida al programa de socios'],
    btn: 'ACTIVAR CREATOR', cls: 'violeta', icono: 'i-play'
  }
];
async function cargarMembresia() {
  const nEl = $('#memb-plan-nombre'), dEl = $('#memb-plan-detalle'), pEl = $('#memb-pase');
  nEl.textContent = 'PLAN GRATIS';
  dEl.textContent = 'Inicia sesión para ver tu membresía.';
  pEl.innerHTML = '';
  if (!SESION) return;
  if (!SESION.pid) { dEl.textContent = 'Sin perfil en la base aún — entra a la arena web una vez para crearte.'; return; }
  let planTxt = '';
  try {
    const compras = await api('/purchases?player_id=eq.' + SESION.pid + '&order=created_at.desc&limit=5');
    const lista = Array.isArray(compras) ? compras : [];
    if (lista.length) {
      const p = lista[0];
      planTxt = (p.plan || p.producto || p.sku || 'PREMIUM').toString().toUpperCase();
      dEl.textContent = 'compra: ' + (p.created_at || '').slice(0, 10) + ' · estado: ' + (p.status || p.estado || 'activa');
    }
  } catch (e) {}
  if (!planTxt) { nEl.textContent = 'PLAN GRATIS'; dEl.textContent = 'Aún no tienes un plan de pago activo.'; }
  else nEl.textContent = 'PLAN ' + planTxt;
  // pase de batalla
  try {
    const pp = await api('/pass_progreso?player_id=eq.' + SESION.pid + '&limit=1');
    const f = Array.isArray(pp) && pp[0] ? pp[0] : null;
    if (f) {
      const nivel = f.nivel != null ? f.nivel : (f.level != null ? f.level : null);
      const xp = f.xp != null ? f.xp : (f.xp_total != null ? f.xp_total : null);
      const pct = Math.max(4, Math.min(100, (Number(xp) || 0) % 100 || 4));
      pEl.innerHTML = `
        <span class="kicker mono">🎟 PASE DE BATALLA VANTS</span>
        <div style="font-weight:800;margin-top:6px">NIVEL ${esc(nivel != null ? nivel : '—')}${xp != null ? ' · ' + esc(xp) + ' XP' : ''}</div>
        <div class="pase-barra"><div class="pase-fill" style="width:${pct}%"></div></div>`;
    }
  } catch (e) {}
  pintarPlanActualEnTarjetas(planTxt);
  pintarPlanes();
}
function pintarPlanActualEnTarjetas(planTxt) {
  const p = (planTxt || '').toLowerCase();
  PLANES.forEach(pl => {
    if (pl.id === 'free') pl.btn = p ? 'PLAN DISPONIBLE' : 'PLAN ACTUAL';
    else pl.btn = p === pl.id ? 'PLAN ACTIVO ✓' : ('ACTIVAR ' + pl.nombre.replace('VANTS ', ''));
  });
}
function pintarPlanes() {
  $('#planes-grid').innerHTML = PLANES.map(pl => `
    <div class="plan-card ${pl.cls || ''}">
      ${pl.bandera ? `<span class="plan-bandera">${pl.bandera}</span>` : ''}
      <h4><svg class="ic"><use href="#${pl.icono || 'i-crown'}"/></svg> ${pl.nombre}</h4>
      <div class="plan-desc">${pl.desc}</div>
      <div class="plan-precio"><b>${pl.precio[periodo]}</b><span>${pl.id === 'free' ? 'PARA SIEMPRE' : (periodo === 'mo' ? '/ MES' : '/ AÑO')}</span></div>
      <ul class="plan-feats">${pl.feats.map(f => `<li><span class="check">✓</span><span>${f}</span></li>`).join('')}</ul>
      <button class="btn ${pl.id === 'free' ? 'fantasma' : 'primario'} ${pl.cls === 'violeta' ? 'creatoro' : ''}" data-plan="${pl.id}">${pl.btn}</button>
    </div>`).join('');
  $$('#planes-grid [data-plan]').forEach(b => b.addEventListener('click', () => activarPlan(b.dataset.plan)));
}
$$('#plan-toggle button').forEach(b => b.addEventListener('click', () => {
  periodo = b.dataset.periodo;
  $$('#plan-toggle button').forEach(x => x.classList.toggle('on', x === b));
  pintarPlanes();
}));
async function activarPlan(id) {
  if (id === 'free') { modalAviso('VANTS FREE', 'Es tu plan por defecto: gratis para siempre. Los planes PRO y CREATOR desbloquean insignias, stats avanzadas y ventajas de torneos.'); return; }
  const pl = PLANES.find(x => x.id === id);
  const si = await modalConfirmar(
    'Activar ' + pl.nombre,
    'Se abre la tienda oficial de la arena para completar el pago de forma segura. Tu plan e insignia se activan aquí al instante después de pagar.'
  );
  if (si) H.abrir('https://vants.vants.workers.dev/tienda.html');
}

// ═══════════════════════════════════════════════════════════════
// CONEXIONES · conectar / desconectar desde el hub (vants_links)
// ═══════════════════════════════════════════════════════════════
const PLATS = [
  { id: 'faceit', nombre: 'FACEIT', ico: '🎯', hint: 'tu nick exacto de FACEIT' },
  { id: 'discord', nombre: 'DISCORD', ico: '💬', hint: 'tu usuario, ej: feistv' },
  { id: 'steam', nombre: 'STEAM', ico: '🎮', hint: 'tu vanity URL o nombre' },
  { id: 'riot', nombre: 'RIOT GAMES', ico: '⚔️', hint: 'tu Riot ID (nombre#tag)' },
  { id: 'twitch', nombre: 'TWITCH', ico: '🟣', hint: 'tu canal de Twitch' },
  { id: 'kick', nombre: 'KICK', ico: '🟩', hint: 'tu canal de Kick' },
  { id: 'youtube', nombre: 'YOUTUBE', ico: '▶️', hint: 'tu @canal' },
  { id: 'tiktok', nombre: 'TIKTOK', ico: '🎵', hint: 'tu @usuario' },
  { id: 'x', nombre: 'X (TWITTER)', ico: '✖️', hint: 'tu @usuario' }
];
async function cargarConexiones() {
  const c = $('#conexiones');
  if (!SESION) { c.innerHTML = '<div class="dim">inicia sesión para gestionar tus conexiones</div>'; return; }
  let mapa = {};
  try {
    const filas = await api('/vants_links?auth0_sub=eq.' + encodeURIComponent(SESION.sub) + '&select=platform,handle,verified&order=platform.asc');
    (Array.isArray(filas) ? filas : []).forEach(f => mapa[f.platform] = f);
  } catch (e) { c.innerHTML = '<div class="dim">' + esc(e.message) + '</div>'; return; }
  const filaGoogle = `
    <div class="fila">
      <div class="conn-ico">🔑</div>
      <div class="conn-nombre">GOOGLE <span class="dim mono" style="font-weight:400">· tu forma de ingresar</span></div>
      <div class="conn-handle">${esc(SESION.email || '')}</div>
      <div class="conn-estado conn-ok">CONECTADO</div>
      <div class="conn-acciones"><span class="chip">FIJO</span></div>
    </div>`;
  c.innerHTML = filaGoogle + PLATS.map(p => {
    const f = mapa[p.id];
    const ok = !!f;
    return `<div class="fila">
      <div class="conn-ico">${p.ico}</div>
      <div class="conn-nombre">${p.nombre}</div>
      <div class="conn-handle">${f ? esc(f.handle || '') : ''}</div>
      <div class="conn-estado ${ok ? 'conn-ok' : 'conn-no'}">${ok ? (f.verified ? 'VERIFICADO' : 'VINCULADO') : 'SIN VINCULAR'}</div>
      <div class="conn-acciones">
        ${ok
          ? `<button class="btn fantasma mini" data-desconectar="${p.id}">DESCONECTAR</button>`
          : `<button class="btn primario mini" data-conectar="${p.id}">CONECTAR</button>`}
      </div>
    </div>`;
  }).join('');
  $$('#conexiones [data-conectar]').forEach(b => b.addEventListener('click', () => conectarPlat(b.dataset.conectar)));
  $$('#conexiones [data-desconectar]').forEach(b => b.addEventListener('click', () => desconectarPlat(b.dataset.desconectar)));
}
async function conectarPlat(pid) {
  if (!SESION) return;
  const p = PLATS.find(x => x.id === pid);
  if (!p) return;
  const handle = await modalPedirDato(
    'CONECTAR ' + p.nombre,
    'Escribe tu ' + p.hint + '. Se guarda en tu cuenta VANTS y aparece en tu perfil de la arena.',
    'tu ' + p.nombre.toLowerCase()
  );
  if (!handle || !handle.trim()) return;
  const h = handle.trim();
  const r = await api('/vants_links', {
    metodo: 'POST',
    prefer: 'resolution=merge-duplicates',
    cuerpo: { auth0_sub: SESION.sub, player_id: SESION.pid || null, platform: pid, handle: h, verified: false }
  });
  if (r && r.__error) { modalAviso('No se pudo conectar', r.__error); return; }
  cargarConexiones();
}
async function desconectarPlat(pid) {
  if (!SESION) return;
  const p = PLATS.find(x => x.id === pid);
  const si = await modalConfirmar('DESCONECTAR ' + p.nombre, 'Se elimina el vínculo de ' + p.nombre + ' de tu cuenta VANTS. Puedes reconectarlo cuando quieras.');
  if (!si) return;
  const r = await api('/vants_links?auth0_sub=eq.' + encodeURIComponent(SESION.sub) + '&platform=eq.' + encodeURIComponent(pid), { metodo: 'DELETE' });
  if (r && r.__error) { modalAviso('No se pudo desconectar', r.__error); return; }
  cargarConexiones();
}

// ───────── BUSCADOR (sidebar) ─────────
let buscaTimer = null;
$('#q').addEventListener('input', () => {
  clearTimeout(buscaTimer);
  buscaTimer = setTimeout(ejecutarBusqueda, 260);
});
async function ejecutarBusqueda() {
  const q = $('#q').value.trim();
  if (!q) { if ($('#cajon-buscador').classList.contains('activo')) irACajon('inicio'); return; }
  irACajon('buscador');
  $('#busca-q-txt').textContent = 'RESULTADOS PARA “' + q.toUpperCase() + '”';
  // juegos
  if (!BIBLIOTECA.length) { try { BIBLIOTECA = (await H.biblioteca()).juegos || []; } catch (e) {} }
  const qs = q.toLowerCase();
  const js = BIBLIOTECA.filter(j => (j.nombre || '').toLowerCase().includes(qs));
  $('#busca-juegos').innerHTML = js.length
    ? js.map(j => `<button class="chip-juego" data-bjugar="${esc(j.id)}"><img src="${esc(coverDe(j))}" alt="" />${esc(j.nombre)}</button>`).join('')
    : '<div class="dim">ningún juego de tu biblioteca coincide</div>';
  $$('#busca-juegos [data-bjugar]').forEach(b => b.addEventListener('click', () => jugarPorId(b.dataset.bjugar)));
  // jugadores
  try {
    const pls = await api('/players?or=(username.ilike.*' + encodeURIComponent(q) + '*,display_name.ilike.*' + encodeURIComponent(q) + '*)&select=id,username,display_name,role,verified,rating,xp&limit=12');
    const filas = Array.isArray(pls) ? pls : [];
    $('#busca-jugadores').innerHTML = filas.length ? filas.map(p => `
      <div class="fila">
        <div class="pos">👤</div>
        <div class="nom ${p.role === 'owner' ? 'oro-nombre' : ''}">${esc(p.display_name || p.username)}${p.verified ? ' ✅' : ''}</div>
        <div class="meta">${esc(p.xp || 0)} XP · rating ${esc(p.rating != null ? p.rating : '—')}</div>
      </div>`).join('') : '<div class="dim">ningún jugador coincide en la arena</div>';
  } catch (e) { $('#busca-jugadores').innerHTML = '<div class="dim">' + esc(e.message) + '</div>'; }
}

// ───────── MODAL (pedir dato / confirmar / aviso) ─────────
function modalBase(titulo, texto, conInput, valor) {
  return new Promise((resolve) => {
    const m = $('#modal');
    $('#modal-titulo').textContent = titulo;
    $('#modal-texto').textContent = texto || '';
    const inp = $('#modal-input');
    inp.classList.toggle('oculto', !conInput);
    if (conInput) { inp.value = valor || ''; setTimeout(() => inp.focus(), 40); }
    m.classList.remove('oculto');
    const cerrar = (val) => {
      m.classList.add('oculto');
      $('#modal-ok').onclick = $('#modal-cancelar').onclick = null;
      resolve(val);
    };
    $('#modal-ok').onclick = () => cerrar(conInput ? inp.value : true);
    $('#modal-cancelar').onclick = () => cerrar(conInput ? null : false);
    if (conInput) inp.onkeydown = (e) => { if (e.key === 'Enter') cerrar(inp.value); };
  });
}
const modalPedirDato = (t, x, ph) => { const i = $('#modal-input'); i.placeholder = ph || ''; return modalBase(t, x, true, ''); };
const modalConfirmar = (t, x) => modalBase(t, x, false);
const modalAviso = (t, x) => modalBase(t, x, false);

// ───────── refresco automático solo si el cajón está activo ─────────
function refrescarPeriodico(nombre, fn, ms) {
  if (timers[nombre]) clearInterval(timers[nombre]);
  timers[nombre] = setInterval(() => {
    const c = $('#cajon-' + nombre);
    if (c && c.classList.contains('activo')) fn();
  }, ms);
}

// ───────── arranque ─────────
(async function init() {
  const inf = await H.info();
  $('#ver-num').textContent = 'v' + inf.version;
  await refrescarSesion();
  cargarInicio();
})();
