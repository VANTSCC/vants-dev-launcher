// ============================================
// VANTS — test_mm_ready.js
// --------------------------------------------
// Ready-check del matchmaking (migra 30) + cadena de arranque:
//   A) Validación estática de db/migrations/30-mm-readycheck.sql
//      (funciones nuevas, guards JWT, deadline 120 s, idempotencia).
//   B) Simulación del flujo del renderer (renderer/mm.js) con DOM
//      falso y timers controlados:
//        encolar → matched → ESTOY LISTO → todos listos →
//        ExitLag (ON y OFF) → lanzamiento automático →
//        timeout → mm_anular_si_timeout → re-encolado automático.
// Sin red, sin Neon, sin Electron: rpc fake con fases controlables.
// Uso: node scripts/test_mm_ready.js → PASS/FAIL + exit code.
// ============================================
'use strict';
const fs = require('fs');
const path = require('path');

let pasan = 0;
let fallan = 0;
function ok(cond, nombre) {
  if (cond) { pasan += 1; console.log(`  PASS  ${nombre}`); }
  else { fallan += 1; console.log(`  FAIL  ${nombre}`); }
}
const tick = () => new Promise((r) => setImmediate(r));
const ticks = async (n) => { for (let i = 0; i < n; i++) await tick(); };

// ---------- A) migración 30: validación estática ----------
process.on('unhandledRejection', (e) => console.log('UNHANDLED-REJECTION:', e && e.stack || e));

(async () => {
  console.log('\n— A) Migra 30 · ready-check en SQL —');
  const sql = fs.readFileSync(
    path.join(__dirname, '..', 'db', 'migrations', '30-mm-readycheck.sql'), 'utf8');

  ok(sql.includes('CREATE TABLE IF NOT EXISTS mm_ready'), 'mm_ready existe (idempotente)');
  ok(sql.includes('ADD COLUMN IF NOT EXISTS ready_deadline timestamptz'), 'mm_matches.ready_deadline (idempotente)');
  ok(sql.includes('CREATE OR REPLACE FUNCTION mm_listo'), 'mm_listo definida');
  ok(sql.includes('CREATE OR REPLACE FUNCTION mm_estado_ready'), 'mm_estado_ready definida');
  ok(sql.includes('CREATE OR REPLACE FUNCTION mm_anular_si_timeout'), 'mm_anular_si_timeout definida');
  ok(sql.includes('CREATE OR REPLACE FUNCTION mm_intentar_emparejar'), 'emparejador re-emitido');
  ok(sql.includes('INSERT INTO mm_matches (game, mode, region, ready_deadline)'), 'el emparejador fija el deadline');
  ok(sql.includes('make_interval(secs => 120)'), 'deadline = 120 s');
  ok(sql.includes('ON CONFLICT (match_id, sub) DO NOTHING'), 'mm_listo idempotente (PK compuesta)');
  ok((sql.match(/no_participante/g) || []).length >= 4, 'guards de participante en las 4 funciones');
  ok((sql.match(/mm_jwt_sub\(\)/g) || []).length >= 8, 'guards de identidad JWT (request.jwt.claim.sub)');
  ok((sql.match(/SECURITY DEFINER/g) || []).length >= 4, 'funciones SECURITY DEFINER como la 23');
  ok(/mm_reportar[\s\S]*partida_anulada[\s\S]*ya_reportado/.test(sql), 'mm_reportar: anulada ≠ ya_reportado');
  ok(sql.includes("'ready_timeout'"), 'payload de anulación con motivo');
  ok(sql.includes("REFERENCES mm_matches(id) ON DELETE CASCADE"), 'mm_ready FK con cascade');

  // ---------- B) flujo del renderer con DOM falso ----------
  console.log('\n— B) mm.js · ready-check y cadena de arranque —');

  // timers falsos ANTES de cargar mm.js
  const intervalos = new Set();
  const timeouts = [];
  const inter = (ms) => [...intervalos].find((o) => o.ms === ms);
  global.setInterval = (fn, ms) => { const o = { fn, ms }; intervalos.add(o); return o; };
  global.clearInterval = (o) => intervalos.delete(o);
  global.setTimeout = (fn) => { timeouts.push(fn); return timeouts.length; };

  function fakeEl(sel) {
    const set = new Set();
    const listeners = {};
    return {
      sel,
      classList: {
        add: (c) => set.add(c),
        remove: (c) => set.delete(c),
        toggle: (c, f) => { if (f === undefined) { set.has(c) ? set.delete(c) : set.add(c); } else if (f) set.add(c); else set.delete(c); },
        contains: (c) => set.has(c),
      },
      addEventListener: (t, fn) => { (listeners[t] = listeners[t] || []).push(fn); },
      click: (t, ev) => { (listeners[t || 'click'] || []).forEach((fn) => fn(ev || {})); },
      textContent: '', innerHTML: '', value: 'valorant', disabled: false,
      style: {},
      getAttribute: () => null, setAttribute: () => {}, closest: () => null,
    };
  }

  const els = {};
  const IDS = ['#mm-estado', '#mm-juego', '#mm-modo', '#mm-region', '#mm-entrar', '#mm-salir',
    '#mm-panel-match', '#mm-match', '#mm-match-id', '#mm-reportar', '#mm-reportar-estado',
    '#mm-historial', '#mm-historial-refrescar', '#mm-inv-email', '#mm-inv-enviar',
    '#mm-inv-recibidas', '#mm-inv-enviadas', '#mm-inv-estado', '#mm-enviar', '#mm-lanzar',
    '#mm-ready', '#mm-ready-cont', '#mm-ready-tiempo', '#mm-ready-fill', '#mm-ready-estado',
    '#mm-listo', '#mm-sa', '#mm-sb', '#nav-buscar-n', '#vants-mm-styles'];
  for (const id of IDS) els[id] = fakeEl(id);
  els['#vants-mm-styles'].textContent = 'ya'; // estilos() ya inyectados: skip
  els['#mm-juego'].value = 'valorant';
  els['#mm-modo'].value = 'team';
  els['#mm-region'].value = 'EU';
  els['#mm-sa'].value = '13';
  els['#mm-sb'].value = '7';

  global.document = {
    readyState: 'complete',
    querySelector: (s) => els[s] || null,
    createElement: () => fakeEl('style'),
    head: { appendChild: () => {} },
    addEventListener: () => {},
  };

  // ---- fases controlables del "server" ----
  const YO = 'auth0|YO';
  const jugadores10 = [];
  for (let i = 0; i < 10; i++) {
    jugadores10.push({ sub: i === 0 ? YO : 'auth0|P' + i, team: i < 5 ? 1 : 2, rr_before: 100, rr_after: null });
  }
  const fase = {
    ticket: 'MM-T1', reutilizado: false,
    ticketEstado: { ok: true, status: 'queued', position: 1 },
    matchId: '11111111-2222-3333-4444-555555555555',
    match: { game: 'valorant', mode: 'team', region: 'EU', status: 'propuesto', score_a: null, score_b: null },
    ready: { ok: true, status: 'propuesto', listos: 0, total: 10, deadline: null, vencido: false },
    listo: { ok: true, listos: 1, total: 10 },
    anular: { ok: true, anulado: true, listos: 1, total: 10 },
  };
  const llamadas = { encolar: 0, listo: 0, anular: 0, exitlag: [], jugar: [], abrir: [], estado: [] };

  const H = {
    sesion: async () => ({ sub: YO }),
    api: async (ruta, opts) => {
      if (ruta.startsWith('/rpc/mm_encolar')) { llamadas.encolar++; return { ok: true, ticket: fase.ticket, reutilizado: fase.reutilizado }; }
      if (ruta.startsWith('/rpc/mm_ticket_estado')) return fase.ticketEstado;
      if (ruta.startsWith('/rpc/mm_estado_ready')) return fase.ready;
      if (ruta.startsWith('/rpc/mm_listo')) { llamadas.listo++; return fase.listo; }
      if (ruta.startsWith('/rpc/mm_anular_si_timeout')) { llamadas.anular++; return fase.anular; }
      if (ruta.startsWith('/rpc/mm_salir')) return { ok: true };
      if (ruta.startsWith('/rpc/mm_historial_de')) return [];
      if (ruta.startsWith('/rpc/mm_invites_pendientes')) return { ok: true, recibidas: [], enviadas: [] };
      if (ruta.startsWith('/rpc/mm_invitar')) return { ok: true };
      if (ruta.startsWith('/rpc/mm_responder_invite')) return { ok: true };
      if (ruta.startsWith('/mm_matches?')) return [fase.match];
      if (ruta.startsWith('/mm_match_players?')) return jugadores10;
      return null;
    },
    biblioteca: async () => ({ juegos: [{ id: 'valorant', nombre: 'VALORANT' }] }),
    jugar: async (j) => { llamadas.jugar.push(j); },
    abrir: async (u) => { llamadas.abrir.push(u); },
    exitlag: async (acc, extra) => { llamadas.exitlag.push([acc, extra]); return fase.exitlagResp; },
    onEstado: (cb) => { H._onEstado = cb; },
  };
  fase.exitlagResp = { ok: true, perfil: 'valorant' };
  global.window = { vantsHub: H };

  // cargar el módulo (IIFE → iniciar() con DOM ready)
  require('../desktop-electron/renderer/mm.js');
  await ticks(3);
  ok(els['#mm-estado'].textContent === 'listo', 'arranque con sesión: estado "listo"');
  ok(intervalos.size === 1, 'sondeo de invitaciones activo (15 s)');

  // 1) entrar a la cola
  els['#mm-entrar'].click();
  await ticks(3);
  ok(llamadas.encolar === 1, 'mm_encolar llamada 1 vez');
  ok(/en cola · (VALORANT · TEAM|posición 1)/.test(els['#mm-estado'].textContent), 'estado "en cola" (el poll inmediato puede pisarlo con la posición)');
  ok(intervalos.size === 2, 'sondeo de ticket activo (3 s)');

  // 2) posición 1
  inter(3000).fn();
  await tick();
  ok(els['#mm-estado'].textContent.includes('posición 1'), 'posición FIFO visible');

  // 3) matched → panel con ready-check
  fase.ticketEstado = { ok: true, status: 'matched', position: 0, match_id: fase.matchId };
  inter(3000).fn();
  await ticks(3);
  ok(!els['#mm-panel-match'].classList.contains('oculto'), 'panel PARTIDA ENCONTRADA visible');
  ok(!els['#mm-ready'].classList.contains('oculto'), 'barra de ready-check visible');
  ok(els['#mm-ready-cont'].textContent === 'LISTOS 0/10', 'LISTOS 0/10 en team 5v5');
  ok(els['#mm-reportar'].classList.contains('oculto'), 'reporte oculto durante el ready-check');
  ok(els['#mm-lanzar'].classList.contains('oculto'), 'ABRIR EL JUEGO oculto (lanzamiento automático)');
  ok(intervalos.size === 3, 'sondeos ready (3 s) + reloj (1 s) + invitaciones activos');
  ok(/2 min/.test(els['#mm-ready-estado'].textContent), 'aviso del plazo de 2 min');

  // 4) deadline y reloj visual (el deadline lo recoge el readyPoll)
  fase.ready.deadline = new Date(Date.now() + 120000).toISOString();
  inter(3000).fn();
  await tick();
  inter(1000).fn();
  ok(els['#mm-ready-tiempo'].textContent.startsWith('· 2:'), 'cuenta regresiva ≈ 2:00');

  // 5) ESTOY LISTO
  els['#mm-listo'].click();
  await ticks(3);
  ok(llamadas.listo === 1, 'mm_listo llamada');
  ok(els['#mm-listo'].textContent === 'LISTO ✓' && els['#mm-listo'].disabled === true, 'confirmación marcada (idempotente en UI)');
  ok(els['#mm-ready-cont'].textContent === 'LISTOS 1/10', 'contador 1/10');

  // 6) todos listos → ExitLag ON → lanzamiento automático
  fase.ready = { ok: true, status: 'propuesto', listos: 10, total: 10, deadline: fase.ready.deadline, vencido: false };
  inter(3000).fn();
  await ticks(4);
  const [acc, extra] = llamadas.exitlag[0] || [];
  ok(acc === 'activar-juego' && extra && extra.id === 'valorant' && extra.nombre === 'VALORANT', 'ExitLag: activar-juego con {id,nombre} del juego');
  while (timeouts.length) timeouts.shift()();
  await ticks(3);
  ok(llamadas.jugar.length === 1 && llamadas.jugar[0].id === 'valorant', 'juego lanzado automáticamente (biblioteca)');
  ok(/juego lanzado/.test(els['#mm-ready-estado'].textContent), 'mensaje de juego lanzado');
  ok(/ExitLag: valorant/.test(els['#mm-ready-estado'].textContent), 'cadena anota el perfil ExitLag activado');
  ok(!els['#mm-reportar'].classList.contains('oculto'), 'reporte visible tras lanzar');

  // 7) timeout → anulación → re-encolado automático
  // (fases quietas ANTES del click: el poll de 3 s dispara durante los ticks)
  fase.ticketEstado = { ok: true, status: 'queued', position: 1 };
  fase.ready = { ok: true, status: 'propuesto', listos: 0, total: 10, vencido: false };
  fase.ticket = 'MM-T2';
  els['#mm-entrar'].click();
  await ticks(3);
  fase.ticketEstado = { ok: true, status: 'matched', position: 0, match_id: '99999999-2222-3333-4444-555555555555' };
  inter(3000).fn();
  await ticks(3);
  fase.ready = { ok: true, status: 'propuesto', listos: 1, total: 10, vencido: true };
  inter(3000).fn();
  await ticks(4);
  ok(llamadas.anular === 1, 'mm_anular_si_timeout disparada al vencer el plazo');
  ok(/partida anulada/.test(els['#mm-estado'].textContent), 'aviso de partida anulada');
  ok(els['#mm-panel-match'].classList.contains('oculto'), 'panel del match cerrado');
  fase.ticketEstado = { ok: true, status: 'queued', position: 2 }; // quieto para el re-encolado
  while (timeouts.length) timeouts.shift()();
  await ticks(4);
  // click de la sección 1 (1) + click de esta sección (2) + re-encolado automático (3)
  ok(llamadas.encolar === 3, 're-encolado automático tras la anulación');
  ok(intervalos.size >= 2, 'cola y sondeos reactivos');

  // 8) ExitLag OFF (sin config): la cadena sigue derecha
  // (fase ready en reposo antes del matched: el readyPoll inmediato no debe anular)
  fase.exitlagResp = { ok: false, reason: 'disabled-or-already-active' };
  fase.ready = { ok: true, status: 'propuesto', listos: 0, total: 10, vencido: false };
  fase.ticketEstado = { ok: true, status: 'matched', position: 0, match_id: '88888888-2222-3333-4444-555555555555' };
  inter(3000).fn();
  await ticks(3);
  fase.ready = { ok: true, status: 'propuesto', listos: 10, total: 10, vencido: false };
  inter(3000).fn();
  await ticks(4);
  await ticks(4);
  while (timeouts.length) timeouts.shift()();
  await ticks(3);
  ok(llamadas.jugar.length === 2, 'ExitLag OFF: el juego se lanza igual (OFF por defecto)');
  ok(!/ExitLag:/.test(els['#mm-ready-estado'].textContent), 'ExitLag OFF: sin mención en la UI');

  // 9) logout limpia todo
  if (H._onEstado) { await H._onEstado({ sesion: null }); await ticks(2); }
  ok(els['#mm-panel-match'].classList.contains('oculto'), 'logout: panel cerrado');

  console.log(`\nResultado: ${pasan} PASS · ${fallan} FAIL`);
  process.exitCode = fallan ? 1 : 0;
})().catch((e) => { console.error('ERROR FATAL:', e); process.exitCode = 1; });
