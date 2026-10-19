#!/usr/bin/env node
// ============================================================
// Tests de la Neon Function vantsbot (mando del agente Discord)
//  · Interactions: PING, firma Ed25519, /agente ×5, fallback
//  · Respuesta rápida (<2.2s) vs defer + followup (frío)
//  · Puente /tarea: DMs de agent_events + agent_comandos (migra 25)
//  · /setup: registro idempotente del comando global
// Ejecutar: node scripts/test_vantsbot.js
// ============================================================

import assert from 'node:assert/strict';
import { construir, definicionComandoAgente } from '../neon-functions/vantsbot/index.ts';

const URL_BASE = 'https://vantsbot.example.neon.tech';
const APP_ID = '1234567890123456789';
const TOKEN_BOT = Buffer.from(APP_ID).toString('base64url') + '.fake.timestamp.' + 'f'.repeat(27);
const SECRET = 's'.repeat(40);
const DM_ID = '111122223333444455';

let pass = 0;
let fail = 0;
function ok(nombre, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      pass++;
      console.log(`  ✅ ${nombre}`);
    })
    .catch((e) => {
      fail++;
      console.error(`  ❌ ${nombre}\n     ${e.message}`);
    });
}

// ── Falsos ──────────────────────────────────────────────────────────────────
function poolFalso() {
  const llamadas = [];
  const reglas = [];
  const pool = {
    llamadas,
    cuando(match, { filas = [], delayMs = 0 } = {}) {
      reglas.push({ match, filas, delayMs });
      return pool;
    },
    async query(sql, params = []) {
      llamadas.push({ sql: String(sql).replace(/\s+/g, ' ').trim(), params });
      for (const r of reglas) {
        const hit = typeof r.match === 'string' ? String(sql).includes(r.match) : r.match.test(String(sql));
        if (hit) {
          if (r.delayMs) await new Promise((res) => setTimeout(res, r.delayMs));
          return { rows: r.filas };
        }
      }
      return { rows: [] };
    },
  };
  return pool;
}

function fetchFalso() {
  const llamadas = [];
  const reglas = [];
  const f = async (url, init = {}) => {
    const llamada = { url: String(url), init, payload: init.body ? JSON.parse(init.body) : null };
    llamadas.push(llamada);
    for (const r of reglas) if (String(url).includes(r.contiene)) return r.respuesta();
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  f.cuando = (contiene, respuesta) => {
    reglas.push({ contiene, respuesta });
    return f;
  };
  f.llamadas = llamadas;
  return f;
}

const envBase = () => ({
  DISCORD_BOT_TOKEN: TOKEN_BOT,
  DISCORD_PUBLIC_KEY: 'a'.repeat(64),
  VANTS_BOT_SECRET: SECRET,
  SUPERVISOR_DM_ID: DM_ID,
});

function req(ruta, { metodo = 'POST', body, headers = {} } = {}) {
  return new Request(URL_BASE + ruta, {
    method: metodo,
    headers,
    ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
  });
}

const interaction = (sobre) => ({
  type: 2,
  token: 'token-interaccion-abcd',
  member: { user: { id: '999' } },
  data: { name: 'agente', options: [] },
  ...sobre,
});

const espera = (ms) => new Promise((r) => setTimeout(r, ms));
async function hasta(fn, ms = 8000) {
  const fin = Date.now() + ms;
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() > fin) throw new Error('timeout esperando condición');
    await espera(120);
  }
}

// ── Suites ──────────────────────────────────────────────────────────────────
console.log('\n— Salud, CORS y autenticación —');

await ok('GET /salud muestra config (sin secretos)', async () => {
  const h = construir({ env: envBase(), pool: poolFalso(), fetch: fetchFalso() });
  const r = await h(req('/salud', { metodo: 'GET' }));
  const b = await r.json();
  assert.equal(r.status, 200);
  assert.equal(b.ok, true);
  assert.equal(b.config.public_key, true);
  assert.equal(b.config.bot_token, true);
  assert.equal(b.config.secret_tarea, true);
  assert.equal(b.config.app_id, APP_ID);
  assert.equal(b.config.dm_id, DM_ID);
});

await ok('OPTIONS responde 204 y rutas raras 404', async () => {
  const h = construir({ env: envBase(), pool: poolFalso(), fetch: fetchFalso() });
  assert.equal((await h(req('/', { metodo: 'OPTIONS' }))).status, 204);
  assert.equal((await h(req('/nada', { metodo: 'GET' }))).status, 404);
});

await ok('GET /tarea → 405 (solo POST)', async () => {
  const h = construir({ env: envBase(), pool: poolFalso(), fetch: fetchFalso() });
  assert.equal((await h(req('/tarea', { metodo: 'GET' }))).status, 405);
});

await ok('/tarea sin cabecera o con cabecera errónea → 401', async () => {
  const h = construir({ env: envBase(), pool: poolFalso(), fetch: fetchFalso() });
  assert.equal((await h(req('/tarea', { body: {} }))).status, 401);
  const r = await h(req('/tarea', { body: {}, headers: { 'x-vants-bot': 'x'.repeat(40) } }));
  assert.equal(r.status, 401);
});

await ok('VANTS_BOT_SECRET corto (<32) se rechaza aunque se acierte', async () => {
  const h = construir({ env: { ...envBase(), VANTS_BOT_SECRET: 'corto' }, pool: poolFalso(), fetch: fetchFalso() });
  const r = await h(req('/tarea', { body: {}, headers: { 'x-vants-bot': 'corto' } }));
  assert.equal(r.status, 401);
});

await ok('Firma inválida → 401 · sin PUBLIC_KEY → 503', async () => {
  const h1 = construir({ env: envBase(), pool: poolFalso(), fetch: fetchFalso() });
  const r1 = await h1(
    req('/', {
      body: { type: 1 },
      headers: { 'x-signature-ed25519': 'ff'.repeat(32), 'x-signature-timestamp': '1700000000' },
    })
  );
  assert.equal(r1.status, 401);

  const h2 = construir({ env: { ...envBase(), DISCORD_PUBLIC_KEY: undefined }, pool: poolFalso(), fetch: fetchFalso() });
  const r2 = await h2(req('/', { body: { type: 1 }, headers: { 'x-signature-ed25519': 'ff'.repeat(32), 'x-signature-timestamp': '1' } }));
  assert.equal(r2.status, 503);
});

console.log('\n— Interactions (comandos /agente) —');

await ok('PING (type 1) → {type:1}', async () => {
  const h = construir({ env: envBase(), pool: poolFalso(), fetch: fetchFalso(), saltarFirma: true });
  const r = await h(req('/', { body: { type: 1 } }));
  const b = await r.json();
  assert.deepEqual(b, { type: 1 });
});

await ok('Comando que no es /agente → aviso VANTCALL', async () => {
  const h = construir({ env: envBase(), pool: poolFalso(), fetch: fetchFalso(), saltarFirma: true });
  const r = await h(req('/', { body: interaction({ data: { name: 'perfil', options: [] } }) }));
  const b = await r.json();
  assert.equal(b.type, 4);
  assert.ok(b.data.content.includes('VANTCALL'));
  assert.equal(b.data.flags, 64);
});

await ok('/agente estado: embed con estado, fuente y lista de incidentes', async () => {
  const pool = poolFalso()
    .cuando('FROM agent_runs', {
      filas: [{ estado_global: 'UP', resumen: 'Todo en orden (5 chequeos OK)', started_at: '2026-10-19T10:00:00Z', fuente: 'ci', modo: 'ciclo', error: null }],
    })
    .cuando("FROM agent_events WHERE estado = 'abierto'", {
      filas: [{ id: 7, severity: 'error', titulo: 'workflow fallo', accion_sugerida: 're-run' }],
    });
  const h = construir({ env: envBase(), pool, fetch: fetchFalso(), saltarFirma: true });
  const r = await h(req('/', { body: interaction({ data: { name: 'agente', options: [{ name: 'estado', options: [] }] } }) }));
  const b = await r.json();
  assert.equal(b.type, 4);
  const e = b.data.embeds[0];
  assert.ok(e.description.includes('**UP**'));
  assert.ok(e.fields.some((f) => f.name === 'Fuente' && f.value.includes('ci')));
  assert.ok(e.fields.some((f) => f.name.includes('Incidentes abiertos (1)') && f.value.includes('#7') && f.value.includes('🟠')));
});

await ok('/agente estado sin runs → aún no ha corrido', async () => {
  const h = construir({ env: envBase(), pool: poolFalso(), fetch: fetchFalso(), saltarFirma: true });
  const b = await (await h(req('/', { body: interaction({ data: { name: 'agente', options: [{ name: 'estado', options: [] }] } }) }))).json();
  assert.ok(b.data.embeds[0].description.includes('aún no ha corrido'));
  assert.ok(b.data.embeds[0].fields.some((f) => f.value.includes('Ninguno ✅')));
});

await ok('/agente incidentes: lista numerada · vacío → mensaje OK', async () => {
  const pool1 = poolFalso().cuando("FROM agent_events WHERE estado = 'abierto'", {
    filas: [
      { id: 2, severity: 'critical', titulo: 'web caída' },
      { id: 1, severity: 'warn', titulo: 'cola lenta' },
    ],
  });
  const h1 = construir({ env: envBase(), pool: pool1, fetch: fetchFalso(), saltarFirma: true });
  const b1 = await (await h1(req('/', { body: interaction({ data: { name: 'agente', options: [{ name: 'incidentes', options: [] }] } }) }))).json();
  assert.ok(b1.data.content.includes('🔴 `#2` web caída'));
  assert.ok(b1.data.content.includes('🟡 `#1` cola lenta'));

  const h2 = construir({ env: envBase(), pool: poolFalso(), fetch: fetchFalso(), saltarFirma: true });
  const b2 = await (await h2(req('/', { body: interaction({ data: { name: 'agente', options: [{ name: 'incidentes', options: [] }] } }) }))).json();
  assert.ok(b2.data.content.includes('Sin incidentes abiertos ✅'));
});

await ok('/agente informe: diagnóstico en bloque de código + contadores', async () => {
  const pool = poolFalso()
    .cuando('FROM agent_runs', { filas: [{ estado_global: 'DEGRADED', resumen: 'algo lento', started_at: 'x', fuente: 'ci', modo: 'ciclo', error: null }] })
    .cuando('FROM agent_resumen', { filas: [{ incidentes_abiertos: 2, incidentes_graves: 1, comandos_pendientes: 0 }] });
  const h = construir({ env: envBase(), pool, fetch: fetchFalso(), saltarFirma: true });
  const b = await (await h(req('/', { body: interaction({ data: { name: 'agente', options: [{ name: 'informe', options: [] }] } }) }))).json();
  assert.ok(b.data.content.startsWith('```'));
  assert.ok(b.data.content.includes('Estado global: DEGRADED'));
  assert.ok(b.data.content.includes('abiertos=2 graves=1'));
});

await ok('/agente resolver: UPDATE con el id y confirmación', async () => {
  const pool = poolFalso().cuando('UPDATE agent_events', { filas: [{ id: 7 }] });
  const h = construir({ env: envBase(), pool, fetch: fetchFalso(), saltarFirma: true });
  const b = await (
    await h(
      req('/', {
        body: interaction({ data: { name: 'agente', options: [{ name: 'resolver', options: [{ name: 'id_incidente', type: 4, value: 7 }] }] } }),
      })
    )
  ).json();
  assert.ok(b.data.content.includes('resuelto ✅'));
  assert.deepEqual(pool.llamadas.find((l) => l.sql.includes('UPDATE agent_events')).params, [7]);
});

await ok('/agente resolver inexistente → aviso claro', async () => {
  const h = construir({ env: envBase(), pool: poolFalso(), fetch: fetchFalso(), saltarFirma: true });
  const b = await (
    await h(req('/', { body: interaction({ data: { name: 'agente', options: [{ name: 'resolver', options: [{ name: 'id_incidente', type: 4, value: 99 }] }] } }) }))
  ).json();
  assert.ok(b.data.content.includes('No encontré un incidente abierto `#99`'));
});

await ok('/agente comando: INSERT en agent_comandos con creado_por discord:ID', async () => {
  const pool = poolFalso();
  const h = construir({ env: envBase(), pool, fetch: fetchFalso(), saltarFirma: true });
  const b = await (
    await h(
      req('/', {
        body: interaction({ data: { name: 'agente', options: [{ name: 'comando', options: [{ name: 'texto', type: 3, value: 'despliega la web' }] }] } }),
      })
    )
  ).json();
  assert.ok(b.data.content.includes('en cola'));
  const ins = pool.llamadas.find((l) => l.sql.includes('INSERT INTO agent_comandos'));
  assert.deepEqual(ins.params, ['despliega la web', 'discord:999']);
});

await ok('Subcomando desconocido → aviso', async () => {
  const h = construir({ env: envBase(), pool: poolFalso(), fetch: fetchFalso(), saltarFirma: true });
  const b = await (await h(req('/', { body: interaction({ data: { name: 'agente', options: [{ name: 'volando', options: [] }] } }) }))).json();
  assert.ok(b.data.content.includes('no reconocido'));
});

await ok('Frío (>2.2s): defer type 5 + followup con embed al terminar', async () => {
  const pool = poolFalso()
    .cuando('FROM agent_runs', { filas: [{ estado_global: 'UP', resumen: 'ok', started_at: 'x', fuente: 'ci', modo: 'ciclo' }], delayMs: 2600 })
    .cuando("FROM agent_events WHERE estado = 'abierto'", { filas: [], delayMs: 2600 });
  const f = fetchFalso();
  const h = construir({ env: envBase(), pool, fetch: f, saltarFirma: true });
  const r = await h(req('/', { body: interaction({ data: { name: 'agente', options: [{ name: 'estado', options: [] }] } }) }));
  const b = await r.json();
  assert.equal(b.type, 5); // respuesta inmediata (evita el timeout de 3s de Discord)
  const follow = await hasta(() => f.llamadas.find((l) => l.url.includes(`/webhooks/${APP_ID}/token-interaccion-abcd`)));
  assert.equal(follow.payload.flags, 64);
  assert.ok(follow.payload.embeds[0].description.includes('**UP**'));
});

await ok('Interaction de tipo no soportado (component) → 400', async () => {
  const h = construir({ env: envBase(), pool: poolFalso(), fetch: fetchFalso(), saltarFirma: true });
  const r = await h(req('/', { body: { type: 3, data: {} } }));
  assert.equal(r.status, 400);
});

console.log('\n— Puente /tarea (agent_events + agent_comandos) —');

await ok('Ciclo completo: abre DM, envía incidente y respuesta, marca en Neon', async () => {
  const pool = poolFalso()
    .cuando('notificado = false', { filas: [{ id: 5, kind: 'web_down', severity: 'error', titulo: 'Web 503', accion_sugerida: 're-deploy' }] })
    .cuando('entregado = false', { filas: [{ id: 3, texto: 'estado', respuesta: 'Todo UP', estado: 'hecho' }] })
    .cuando('SET notificado = true', { filas: [] })
    .cuando('SET entregado = true', { filas: [] });
  const f = fetchFalso().cuando('users/@me/channels', () => new Response(JSON.stringify({ id: 'DM1' }), { status: 200 }));
  const h = construir({ env: envBase(), pool, fetch: f });
  const b = await (await h(req('/tarea', { body: {}, headers: { 'x-vants-bot': SECRET } }))).json();
  assert.equal(b.ok, true);
  assert.deepEqual(b.resultado, { incidentes: 1, respuestas: 1, errores: [] });
  const dm = f.llamadas.find((l) => l.url.includes('users/@me/channels'));
  assert.equal(dm.payload.recipient_id, DM_ID);
  const msgs = f.llamadas.filter((l) => l.url.includes('/channels/DM1/messages'));
  assert.equal(msgs.length, 2);
  assert.ok(msgs[0].payload.embeds[0].title.includes('[ERROR] web_down'));
  assert.ok(msgs[0].payload.embeds[0].footer.text.includes('/agente resolver 5'));
  assert.ok(msgs[1].payload.embeds[0].title.includes('respuesta'));
  assert.ok(pool.llamadas.some((l) => l.sql.includes('SET notificado = true') && l.params[0] === 5));
  assert.ok(pool.llamadas.some((l) => l.sql.includes('SET entregado = true') && l.params[0] === 3));
});

await ok('Anti ping: @everyone se neutraliza en los DMs', async () => {
  const pool = poolFalso().cuando('notificado = false', { filas: [{ id: 1, kind: 'k', severity: 'warn', titulo: 'hola @everyone y @here' }] });
  const f = fetchFalso().cuando('users/@me/channels', () => new Response(JSON.stringify({ id: 'DM1' }), { status: 200 }));
  const h = construir({ env: envBase(), pool, fetch: f });
  await h(req('/tarea', { body: {}, headers: { 'x-vants-bot': SECRET } }));
  const msg = f.llamadas.find((l) => l.url.includes('/channels/DM1/messages'));
  assert.ok(msg.payload.embeds[0].description.includes('@\u200beveryone'));
  assert.ok(msg.payload.embeds[0].description.includes('@\u200bhere'));
  assert.deepEqual(msg.payload.allowed_mentions, { parse: [] });
});

await ok('403 (dueño sin DMs abiertos) → se marca igual y no reintenta eterno', async () => {
  const pool = poolFalso().cuando('notificado = false', { filas: [{ id: 9, kind: 'k', severity: 'warn', titulo: 't' }] });
  const f = fetchFalso()
    .cuando('users/@me/channels', () => new Response(JSON.stringify({ id: 'DM1' }), { status: 200 }))
    .cuando('/channels/DM1/messages', () => new Response(JSON.stringify({ message: 'Forbidden' }), { status: 403 }));
  const h = construir({ env: envBase(), pool, fetch: f });
  const b = await (await h(req('/tarea', { body: {}, headers: { 'x-vants-bot': SECRET } }))).json();
  assert.deepEqual(b.resultado, { incidentes: 0, respuestas: 0, errores: [] });
  assert.ok(pool.llamadas.some((l) => l.sql.includes('SET notificado = true') && l.params[0] === 9));
});

await ok('Sin DISCORD_BOT_TOKEN → error claro y cero llamadas a Discord', async () => {
  const f = fetchFalso();
  const h = construir({ env: { ...envBase(), DISCORD_BOT_TOKEN: undefined }, pool: poolFalso(), fetch: f });
  const b = await (await h(req('/tarea', { body: {}, headers: { 'x-vants-bot': SECRET } }))).json();
  assert.ok(b.resultado.errores[0].includes('falta DISCORD_BOT_TOKEN'));
  assert.equal(f.llamadas.length, 0);
});

await ok('DM no disponible (HTTP 500) → error dm:500', async () => {
  const f = fetchFalso().cuando('users/@me/channels', () => new Response('{}', { status: 500 }));
  const h = construir({ env: envBase(), pool: poolFalso(), fetch: f });
  const b = await (await h(req('/tarea', { body: {}, headers: { 'x-vants-bot': SECRET } }))).json();
  assert.deepEqual(b.resultado.errores, ['dm:500']);
});

await ok('Sin pendientes → 0/0 y ningún mensaje', async () => {
  const f = fetchFalso().cuando('users/@me/channels', () => new Response(JSON.stringify({ id: 'DM1' }), { status: 200 }));
  const h = construir({ env: envBase(), pool: poolFalso(), fetch: f });
  const b = await (await h(req('/tarea', { body: {}, headers: { 'x-vants-bot': SECRET } }))).json();
  assert.deepEqual(b.resultado, { incidentes: 0, respuestas: 0, errores: [] });
  assert.equal(f.llamadas.filter((l) => l.url.includes('/messages')).length, 0);
});

console.log('\n— /setup (registro del comando global) —');

await ok('Sin token → error claro', async () => {
  const h = construir({ env: { ...envBase(), DISCORD_BOT_TOKEN: undefined }, pool: poolFalso(), fetch: fetchFalso() });
  const b = await (await h(req('/setup', { body: {}, headers: { 'x-vants-bot': SECRET } }))).json();
  assert.equal(b.ok, false);
  assert.ok(b.error.includes('falta DISCORD_BOT_TOKEN'));
});

await ok('Token sin appId derivable → error claro', async () => {
  const h = construir({ env: { ...envBase(), DISCORD_BOT_TOKEN: 'abc.def.ghi' }, pool: poolFalso(), fetch: fetchFalso() });
  const b = await (await h(req('/setup', { body: {}, headers: { 'x-vants-bot': SECRET } }))).json();
  assert.ok(b.error.includes('APP_ID'));
});

await ok('Comando nuevo → POST global con la definición /agente', async () => {
  const f = fetchFalso().cuando('/applications/' + APP_ID + '/commands', () => new Response('[]', { status: 200 }));
  const h = construir({ env: envBase(), pool: poolFalso(), fetch: f });
  const b = await (await h(req('/setup', { body: {}, headers: { 'x-vants-bot': SECRET } }))).json();
  assert.equal(b.ok, true);
  assert.equal(b.modo, 'create');
  const post = f.llamadas.find((l) => l.url.includes(`/applications/${APP_ID}/commands`) && l.init.method === 'POST');
  assert.equal(post.payload.name, 'agente');
  assert.equal(post.payload.options.length, 5);
});

await ok('Comando existente → PATCH idempotente', async () => {
  const f = fetchFalso().cuando('/applications/' + APP_ID + '/commands', () =>
    new Response(JSON.stringify([{ id: 'cmd1', name: 'agente' }]), { status: 200 })
  );
  const h = construir({ env: envBase(), pool: poolFalso(), fetch: f });
  const b = await (await h(req('/setup', { body: {}, headers: { 'x-vants-bot': SECRET } }))).json();
  assert.equal(b.modo, 'patch');
  assert.ok(f.llamadas.some((l) => l.url.endsWith(`/applications/${APP_ID}/commands/cmd1`) && l.init.method === 'PATCH'));
});

await ok('definicionComandoAgente: 5 subcomandos con opciones correctas', async () => {
  const d = definicionComandoAgente();
  assert.equal(d.name, 'agente');
  const subs = Object.fromEntries(d.options.map((o) => [o.name, o]));
  assert.equal(subs.resolver.options[0].name, 'id_incidente');
  assert.equal(subs.resolver.options[0].required, true);
  assert.equal(subs.comando.options[0].required, true);
});

// ── Eventos de la app de Discord (/evento-discord desde el Worker) ─────────
console.log('\n— Eventos de Discord (/evento-discord) —');

await ok('GET → 405 · POST sin token → 401 · body inválido → 400', async () => {
  const h = construir({ env: envBase(), pool: poolFalso(), fetch: fetchFalso(), saltarFirma: true });
  assert.equal((await h(req('/evento-discord', { metodo: 'GET' }))).status, 405);
  assert.equal((await h(req('/evento-discord', { body: {} }))).status, 401);
  const r = await h(req('/evento-discord', { body: 'no-json', headers: { 'x-vants-bot': SECRET } }));
  assert.equal(r.status, 400);
});

await ok('Guarda el evento en web_events con el event_id recibido', async () => {
  const pool = poolFalso();
  pool.cuando('INSERT INTO web_events', { filas: [{ id: 1 }] });
  const h = construir({ env: { ...envBase(), DISCORD_BOT_TOKEN: undefined }, pool, fetch: fetchFalso(), saltarFirma: true });
  const r = await h(req('/evento-discord', {
    body: { evento_id: 'discord:abc123', payload: { type: 0, data: { type: 'ENTITLEMENT_UPDATE' } } },
    headers: { 'x-vants-bot': SECRET },
  }));
  const b = await r.json();
  assert.equal(r.status, 200);
  assert.equal(b.ok, true);
  assert.equal(b.guardado, true);
  assert.equal(b.evento_id, 'discord:abc123');
  const ins = pool.llamadas.find((l) => l.sql.includes('INSERT INTO web_events'));
  assert.ok(ins, 'inserta en web_events');
  assert.equal(ins.params[0], 'discord:abc123');
  assert.equal(ins.params[1], 'discord_event');
  assert.equal(ins.params[3], 'discord');
});

await ok('Sin evento_id genera id determinista discord:<sha256×40>', async () => {
  const pool = poolFalso();
  pool.cuando('INSERT INTO web_events', { filas: [{ id: 2 }] });
  const h = construir({ env: envBase(), pool, fetch: fetchFalso(), saltarFirma: true });
  await h(req('/evento-discord', {
    body: { payload: { type: 0, data: { type: 'APPLICATION_AUTHORIZED' } } },
    headers: { 'x-vants-bot': SECRET },
  }));
  const ins = pool.llamadas.find((l) => l.sql.includes('INSERT INTO web_events'));
  assert.match(String(ins.params[0]), /^discord:[0-9a-f]{40}$/);
});

await ok('ENTITLEMENT_CREATE con token → DM al dueño ("enviado")', async () => {
  const pool = poolFalso();
  pool.cuando('INSERT INTO web_events', { filas: [{ id: 3 }] });
  const f = fetchFalso().cuando('/users/@me/channels', () =>
    new Response(JSON.stringify({ id: 'canal-1' }), { status: 200, headers: { 'content-type': 'application/json' } })
  );
  const h = construir({ env: envBase(), pool, fetch: f, saltarFirma: true });
  const b = await (
    await h(req('/evento-discord', {
      body: { payload: { type: 0, data: { type: 'ENTITLEMENT_CREATE', sku: 'vants-pro' } } },
      headers: { 'x-vants-bot': SECRET },
    }))
  ).json();
  assert.equal(b.dm, 'enviado');
  const msg = f.llamadas.find((l) => l.url.includes('/channels/canal-1/messages'));
  assert.ok(msg, 'envía mensaje al canal DM');
  assert.ok(String(msg.payload.embeds[0].title).includes('ENTITLEMENT_CREATE'));
  assert.ok(msg.payload.embeds[0].description.includes('vants-pro'));
});

await ok('Evento no-compra (RELATIONSHIP_ADD) no dispara DM', async () => {
  const pool = poolFalso();
  pool.cuando('INSERT INTO web_events', { filas: [{ id: 4 }] });
  const f = fetchFalso();
  const h = construir({ env: envBase(), pool, fetch: f, saltarFirma: true });
  const b = await (
    await h(req('/evento-discord', {
      body: { payload: { type: 0, data: { type: 'RELATIONSHIP_ADD' } } },
      headers: { 'x-vants-bot': SECRET },
    }))
  ).json();
  assert.equal(b.ok, true);
  assert.equal(b.dm, undefined);
  assert.equal(f.llamadas.length, 0);
});

await ok('Sin token de bot guarda igual y no intenta DM', async () => {
  const pool = poolFalso();
  pool.cuando('INSERT INTO web_events', { filas: [{ id: 5 }] });
  const f = fetchFalso();
  const h = construir({ env: { ...envBase(), DISCORD_BOT_TOKEN: undefined }, pool, fetch: f, saltarFirma: true });
  const b = await (
    await h(req('/evento-discord', {
      body: { payload: { type: 0, data: { type: 'ENTITLEMENT_CREATE' } } },
      headers: { 'x-vants-bot': SECRET },
    }))
  ).json();
  assert.equal(b.ok, true);
  assert.equal(b.guardado, true);
  assert.equal(b.dm, undefined);
  assert.equal(f.llamadas.length, 0);
});

await ok('Fallo de BD → ok:false con mensaje (sin 500 opaco)', async () => {
  const h = construir({ env: envBase(), pool: { query: async () => { throw new Error('db caída'); } }, fetch: fetchFalso(), saltarFirma: true });
  const r = await h(req('/evento-discord', {
    body: { payload: { type: 0, data: { type: 'ENTITLEMENT_CREATE' } } },
    headers: { 'x-vants-bot': SECRET },
  }));
  const b = await r.json();
  assert.equal(r.status, 200);
  assert.equal(b.ok, false);
  assert.ok(b.error.message.includes('db caída'));
});

console.log(`\nResultado: ${pass} PASS · ${fail} FAIL`);
process.exit(fail ? 1 : 0);
