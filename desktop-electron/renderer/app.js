// ═══════════ VANTS HUB · app.js (renderer) ═══════════
'use strict';
const H = window.vantsHub;

let SESION = null;      // perfil público
let YO = null;          // fila players propia
let BIBLIOTECA = [];
let presModo = 'online';
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

// ───────── navegación por cajones ─────────
function irACajon(nombre) {
  $$('.nav-it').forEach(b => b.classList.toggle('activa', b.dataset.cajon === nombre));
  $$('.cajon').forEach(c => c.classList.toggle('activo', c.id === 'cajon-' + nombre));
  const cargas = {
    inicio: cargarInicio, cuenta: cargarCuenta, partidos: cargarPartidos,
    bracket: cargarBracket, lideres: cargarLideres, vivo: cargarVivo,
    biblioteca: cargarBiblioteca
  };
  if (cargas[nombre]) cargas[nombre]();
}
$$('.nav-it').forEach(b => b.addEventListener('click', () => irACajon(b.dataset.cajon)));

// ───────── sesión ─────────
async function refrescarSesion() {
  SESION = await H.sesion();
  pintarSesion();
  if (SESION) { try { YO = null; } catch (e) {} }
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
  $('#hero-hola').textContent = con ? ('Hola, ' + (SESION.name || 'jugador').split(' ')[0] + ' 👋') : 'Bienvenido a VANTS HUB';
  capsula(con ? (SESION.pid ? 'SESIÓN ACTIVA' : 'SESIÓN SIN PERFIL') : 'SIN SESIÓN', con);
}
function capsula(txt, ok) {
  const c = $('#estado-capsula');
  c.textContent = txt;
  c.classList.toggle('off', !ok);
}
$('#btn-login').addEventListener('click', async () => {
  $('#btn-login').textContent = 'ABRIENDO LOGIN…';
  const r = await H.login();
  $('#btn-login').textContent = 'INICIAR SESIÓN';
  if (r && r.ok) refrescarSesion();
  else if (r && r.error) alert('No se pudo iniciar sesión: ' + r.error);
});
$('#btn-logout').addEventListener('click', async () => { await H.logout(); YO = null; refrescarSesion(); });
$('#btn-web').addEventListener('click', () => H.abrir('https://vants.vants.workers.dev/'));
$('#btn-ver-en-web').addEventListener('click', () => H.abrir('https://vants.vants.workers.dev/jugadores.html'));

// ───────── estado global del hub ─────────
H.onEstado((d) => {
  if (d.sesion !== undefined) { SESION = d.sesion; pintarSesion(); }
  const jugando = d.juego;
  const p = $('#hero-punto');
  p.className = 'punto ' + (jugando ? 'naranja' : (SESION ? 'verde' : ''));
  $('#hero-estado-txt').textContent = jugando ? ('JUGANDO · ' + jugando) : (SESION ? 'EN LÍNEA' : 'DESCONECTADO');
  $('#hero-estado-juego').textContent = SESION ? (SESION.email || '') : 'inicia sesión para latir en la arena';
  capsula(jugando ? ('JUGANDO · ' + jugando.toUpperCase()) : (SESION ? 'EN LÍNEA · LATIENDO' : 'SIN SESIÓN'), !!SESION);
});

// ───────── INICIO ─────────
async function cargarInicio() {
  cargarVivoEn('inicio-vivo');
  cargarRapido();
}
async function cargarRapido() {
  const cont = $('#inicio-rapido');
  if (!BIBLIOTECA.length) BIBLIOTECA = (await H.biblioteca()).juegos || [];
  cont.innerHTML = BIBLIOTECA.length
    ? BIBLIOTECA.slice(0, 6).map(j => `<button class="chip-juego" data-id="${esc(j.id)}">▶ ${esc(j.nombre)}</button>`).join('')
    : '<div class="dim">no se detectaron juegos (solo Windows: Steam / Riot / Epic)</div>';
  $$('#inicio-rapido .chip-juego').forEach(b => b.addEventListener('click', () => jugarPorId(b.dataset.id)));
}
async function jugarPorId(id) {
  const j = BIBLIOTECA.find(x => String(x.id) === String(id));
  if (j) await H.jugar(j);
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
    $('#pct-rol').textContent = (YO.role === 'owner') ? 'OWNER · VANTS' : (YO.role || 'JUGADOR');
    $('#pct-xp').textContent = (YO.xp || 0) + ' XP';
    $('#pct-rating').textContent = 'rating ' + (YO.rating != null ? YO.rating : '—');
    if (YO.avatar_url) { $('#pct-avatar').src = YO.avatar_url; } else $('#pct-avatar').removeAttribute('src');
    SESION.pid = YO.id;
    cargarMembresia();
  }
  cargarConexiones();
  pintarPresOpciones();
}
async function cargarMembresia() {
  const c = $('#membresia');
  c.className = '';
  if (!SESION.pid) { c.innerHTML = '<div class="dim">sin perfil en la base aún</div>'; return; }
  let html = '';
  try {
    const compras = await api('/purchases?player_id=eq.' + SESION.pid + '&order=created_at.desc&limit=5');
    const lista = Array.isArray(compras) ? compras : [];
    if (lista.length) {
      const p = lista[0];
      const plan = (p.plan || p.producto || p.sku || 'PREMIUM').toString().toUpperCase();
      html += `<div style="font-size:17px;font-weight:900;color:var(--gold)">PLAN ${esc(plan)}</div>`;
      html += `<div class="dim">compra: ${esc((p.created_at || '').slice(0, 10))} · estado: ${esc(p.status || p.estado || 'activa')}</div>`;
    } else {
      html += '<div style="font-size:17px;font-weight:900">PLAN GRATIS</div>';
      html += '<div class="dim">Aún no tienes un plan de pago activo.</div>';
    }
  } catch (e) {
    html += '<div style="font-size:17px;font-weight:900">PLAN GRATIS</div>';
  }
  try {
    const pp = await api('/pass_progreso?player_id=eq.' + SESION.pid + '&limit=1');
    const f = Array.isArray(pp) && pp[0] ? pp[0] : null;
    if (f) {
      const nivel = f.nivel != null ? f.nivel : (f.level != null ? f.level : '—');
      const xp = f.xp != null ? f.xp : (f.xp_total != null ? f.xp_total : '');
      html += `<div style="margin-top:10px">🎟 PASE VANTS · nivel <b>${esc(nivel)}</b>${xp !== '' ? ' · ' + esc(xp) + ' XP' : ''}</div>`;
    }
  } catch (e) {}
  html += `<button class="btn mini fantasma" id="btn-tienda" style="margin-top:12px">VER PLANES Y PASE →</button>`;
  c.innerHTML = html;
  const bt = $('#btn-tienda');
  if (bt) bt.addEventListener('click', () => H.abrir('https://vants.vants.workers.dev/tienda.html'));
}
const PLAT_ICONO = { faceit: '🎯', discord: '💬', twitch: '🟣', kick: '🟩', youtube: '▶️', tiktok: '🎵', x: '✖️', riot: '⚔️', steam: '🎮' };
async function cargarConexiones() {
  const c = $('#conexiones');
  try {
    const filas = SESION.sub
      ? await api('/vants_links?auth0_sub=eq.' + encodeURIComponent(SESION.sub) + '&select=platform,handle,verified&order=platform.asc')
      : [];
    const mapa = {};
    (Array.isArray(filas) ? filas : []).forEach(f => mapa[f.platform] = f);
    const plataformas = ['google', 'faceit', 'discord', 'steam', 'riot', 'twitch', 'kick', 'youtube', 'tiktok', 'x'];
    c.innerHTML = plataformas.map(p => {
      const f = mapa[p];
      const ok = !!f;
      return `<div class="fila">
        <div>${PLAT_ICONO[p] || '🔗'}</div>
        <div class="conn-nombre">${esc(p.toUpperCase())}</div>
        <div class="dim">${f ? esc(f.handle || '') : ''}</div>
        <div class="conn-estado ${ok ? 'conn-ok' : 'conn-no'}">${ok ? (f.verified ? 'VERIFICADO' : 'VINCULADO') : 'SIN VINCULAR'}</div>
      </div>`;
    }).join('') + `<button class="btn mini fantasma" id="btn-conn-web" style="margin-top:10px">GESTIONAR CONEXIONES EN LA WEB →</button>`;
    const b = $('#btn-conn-web');
    if (b) b.addEventListener('click', () => H.abrir('https://vants.vants.workers.dev/'));
  } catch (e) { c.innerHTML = '<div class="dim">' + esc(e.message) + '</div>'; }
}
function pintarPresOpciones() {
  $$('.opt-pres').forEach(b => b.classList.toggle('activa', b.dataset.pres === presModo));
}
$$('.opt-pres').forEach(b => b.addEventListener('click', async () => {
  presModo = b.dataset.pres;
  pintarPresOpciones();
  await H.presencia(presModo);
}));

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
      const esRet = s.retador_id === SESION.pid;
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
    $(id ? ('#' + id) : '#vivo-tabla').innerHTML = filas.length ? filas.map(f => `
      <div class="fila">
        <div class="punto ${f.estado === 'jugando' ? 'naranja' : 'verde'}"></div>
        <div class="nom ${f.role === 'owner' ? 'oro-nombre' : ''}">${esc(f.display_name || f.username)}${f.verified ? ' ✅' : ''}</div>
        <div class="meta">${f.estado === 'jugando' ? '🎮 jugando ' + esc(f.juego || '') : '🟢 en línea'}</div>
      </div>`).join('') : '<div class="dim">nadie conectado ahora mismo — tú podrías ser el primero</div>';
  } catch (e) { const el = $(id ? ('#' + id) : '#vivo-tabla'); if (el) el.innerHTML = '<div class="dim">en vivo disponible al iniciar sesión</div>'; }
}

// ───────── BIBLIOTECA ─────────
async function cargarBiblioteca() {
  try {
    const d = await H.biblioteca();
    BIBLIOTECA = d.juegos || [];
    $('#biblio-sub').textContent = d.plataforma !== 'win32'
      ? 'La detección de juegos está disponible en Windows (Steam / Riot / Epic).'
      : BIBLIOTECA.length + ' juegos detectados en tu PC · nada sale de tu equipo';
    $('#biblio-grid').innerHTML = BIBLIOTECA.length ? BIBLIOTECA.map(j => `
      <div class="juego-card" id="jc-${esc(j.id)}">
        <div class="juego-fuente">${esc((j.fuente || '').toUpperCase())}${j.detalle ? ' · ' + esc(j.detalle) : ''}</div>
        <div class="juego-nombre">${esc(j.nombre)}</div>
        <button class="btn primario mini" data-jugar="${esc(j.id)}">▶ JUGAR</button>
      </div>`).join('') : '<div class="dim">No se detectaron juegos. Prueba REESCANEAR con Steam/Riot/Epic instalados.</div>';
    $$('#biblio-grid [data-jugar]').forEach(b => b.addEventListener('click', () => jugarPorId(b.dataset.jugar)));
  } catch (e) { $('#biblio-grid').innerHTML = '<div class="dim">error: ' + esc(e.message) + '</div>'; }
}
$('#btn-rescan').addEventListener('click', cargarBiblioteca);

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
