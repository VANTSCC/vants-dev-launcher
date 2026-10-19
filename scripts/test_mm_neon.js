#!/usr/bin/env node
// ============================================================
// Test de la Neon Function "mm" (matchmaking serverless).
// JWT RS256 REAL: keypair generado al vuelo, JWKS falso servido
// por fetchFalso, pool falso con cliente transaccional grabando
// el SQL (BEGIN → set_config → fn → COMMIT).
// Ejecutar: node scripts/test_mm_neon.js
// ============================================================

import assert from 'node:assert/strict';
import { generateKeyPairSync, sign as firmar } from 'node:crypto';
import { construir } from '../neon-functions/mm/index.ts';

const DOMINIO = 'vants.eu.auth0.com';
const AUD = 'https://api.vants.app';
const SUB = 'auth0|TEST1';

let pass = 0; let fail = 0;
function ok(nombre, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { pass++; console.log(`  ✅ ${nombre}`); })
    .catch((e) => { fail++; console.error(`  ❌ ${nombre}\n     ${e.message}`); });
}

// ── Keypair RSA + JWKS falso ────────────────────────────────────────────────
const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const JWK = Object.assign({ kid: 'test-key', alg: 'RS256', use: 'sig' }, publicKey.export({ format: 'jwk' }));

const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
function jwt(sobre = {}, conFirmaDe = null) {
  const cab = b64u({ alg: 'RS256', typ: 'JWT', kid: 'test-key' });
  const cuerpo = b64u(Object.assign({
    sub: SUB, iss: `https://${DOMINIO}/`, aud: AUD,
    iat: Math.floor(Date.now() / 1000) - 5, exp: Math.floor(Date.now() / 1000) + 300,
  }, sobre));
  const datos = Buffer.from(`${cab}.${cuerpo}`);
  const firma = firmar('RSA-SHA256', datos, conFirmaDe || privateKey).toString('base64url');
  return `${cab}.${cuerpo}.${firma}`;
}
const TOKEN = jwt();

// ── Falsos ──────────────────────────────────────────────────────────────────
function fetchFalso() {
  const f = async (url) => {
    if (String(url).includes('/.well-known/jwks.json')) {
      return new Response(JSON.stringify({ keys: [JWK] }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response('{}', { status: 404 });
  };
  return f;
}

function poolFalsoNeon() {
  const llamadas = [];
  const reglas = [];
  const cliente = {
    llamadas,
    async query(sql, params = []) {
      const norma = String(sql).replace(/\s+/g, ' ').trim();
      llamadas.push({ sql: norma, params });
      for (const r of reglas) {
        if (norma.includes(r.contiene)) return { rows: typeof r.filas === 'function' ? r.filas(params) : r.filas };
      }
      return { rows: [] };
    },
    release() {},
  };
  return {
    llamadas,
    cuando(contiene, filas) { reglas.push({ contiene, filas }); return this; },
    async connect() { return cliente; },
  };
}

const env = () => ({ AUTH0_DOMAIN: DOMINIO, AUTH0_AUDIENCE: AUD });

function req(ruta, { metodo = 'GET', body, token: tk = TOKEN, headers = {} } = {}) {
  const h = { ...headers };
  if (tk) h.authorization = `Bearer ${tk}`;
  return new Request(`https://mm.example.neon.tech${ruta}`, {
    method: metodo,
    headers: h,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

// ── Suites ──────────────────────────────────────────────────────────────────
console.log('\n— Salud y CORS —');

await ok('GET /salud → 200 con config sin secretos', async () => {
  const h = construir({ env: env(), pool: poolFalsoNeon(), fetch: fetchFalso() });
  const r = await h(req('/salud'));
  const b = await r.json();
  assert.equal(r.status, 200);
  assert.equal(b.fn, 'mm');
  assert.equal(b.config.auth0, DOMINIO);
  assert.ok(b.endpoints.length >= 9);
});

await ok('OPTIONS → 204', async () => {
  const h = construir({ env: env(), pool: poolFalsoNeon(), fetch: fetchFalso() });
  assert.equal((await h(req('/encolar', { metodo: 'OPTIONS', token: null }))).status, 204);
});

console.log('\n— Autenticación RS256 —');

await ok('Sin token / token de 2 partes / firma inválida → 401', async () => {
  const h = construir({ env: env(), pool: poolFalsoNeon(), fetch: fetchFalso() });
  assert.equal((await h(req('/encolar', { metodo: 'POST', token: null, body: {} }))).status, 401);
  assert.equal((await h(req('/encolar', { metodo: 'POST', token: 'a.b', body: {} }))).status, 401);
  // firma válida de OTRO payload (cuerpo alterado tras firmar)
  const cab = b64u({ alg: 'RS256', typ: 'JWT', kid: 'test-key' });
  const cuerpoBueno = jwt().split('.')[1];
  const firmaAjena = firmar('RSA-SHA256', Buffer.from(`${cab}.${cuerpoBueno}x`), privateKey).toString('base64url');
  assert.equal((await h(req('/encolar', { metodo: 'POST', token: `${cab}.${cuerpoBueno}x.${firmaAjena}`, body: {} }))).status, 401);
});

await ok('exp vencido · iss ajeno · aud ajeno → 401', async () => {
  const h = construir({ env: env(), pool: poolFalsoNeon(), fetch: fetchFalso() });
  assert.equal((await h(req('/estado?ticket=MM-1', { token: jwt({ exp: Math.floor(Date.now() / 1000) - 999 }) }))).status, 401);
  assert.equal((await h(req('/estado?ticket=MM-1', { token: jwt({ iss: 'https://otro.auth0.com/' }) }))).status, 401);
  assert.equal((await h(req('/estado?ticket=MM-1', { token: jwt({ aud: 'https://otra.api' }) }))).status, 401);
});

console.log('\n— Cola (mm_encolar + mm_intentar_emparejar, migra 21/23) —');

await ok('POST /encolar nuevo → 201 con ticket, posición y GUC en orden', async () => {
  const pool = poolFalsoNeon()
    .cuando('SELECT mm_encolar', [{ res: { ok: true, ticket: 'MM-TEST1', reutilizado: false, expires_at: '2026-10-19T12:00:00Z' } }])
    .cuando('SELECT mm_intentar_emparejar', [{ id: null }])
    .cuando('SELECT mm_ticket_estado', [{ res: { ok: true, status: 'queued', position: 2, match_id: null } }]);
  const h = construir({ env: env(), pool, fetch: fetchFalso() });
  const r = await h(req('/encolar', { metodo: 'POST', body: { game: 'valorant', mode: 'duo' } }));
  const b = await r.json();
  assert.equal(r.status, 201);
  assert.equal(b.ok, true);
  assert.equal(b.data.ticket, 'MM-TEST1');
  assert.equal(b.data.position, 2);
  assert.equal(b.data.match_id, null);
  assert.equal(b.data.ttl_ms, 600000);
  const sqls = pool.llamadas.map((l) => l.sql);
  const iBegin = sqls.findIndex((s) => s === 'BEGIN');
  const iGuc = sqls.findIndex((s) => s.includes('set_config'));
  const iEnc = sqls.findIndex((s) => s.includes('SELECT mm_encolar'));
  const iCommit = sqls.findIndex((s) => s === 'COMMIT');
  assert.ok(iBegin > -1 && iBegin < iGuc && iGuc < iEnc && iEnc < iCommit, 'orden BEGIN → set_config → fn → COMMIT');
  const guc = pool.llamadas[iGuc];
  assert.equal(guc.params[0], SUB, 'GUC con el sub del JWT');
  const enc = pool.llamadas[iEnc];
  assert.equal(enc.params[0], SUB, 'mm_encolar con el sub del JWT');
  assert.equal(enc.params[1], 'valorant');
});

await ok('Reutilizado → 200 · match emparejado → match_id en respuesta', async () => {
  const pool1 = poolFalsoNeon()
    .cuando('SELECT mm_encolar', [{ res: { ok: true, ticket: 'MM-REUS1', reutilizado: true, expires_at: null } }])
    .cuando('SELECT mm_intentar_emparejar', [{ id: null }])
    .cuando('SELECT mm_ticket_estado', [{ res: { ok: true, status: 'queued', position: 1, match_id: null } }]);
  const h1 = construir({ env: env(), pool: pool1, fetch: fetchFalso() });
  const r1 = await h1(req('/encolar', { metodo: 'POST', body: { game: 'cs2', mode: 'duo' } }));
  assert.equal(r1.status, 200);
  assert.equal((await r1.json()).data.reutilizado, true);

  const pool2 = poolFalsoNeon()
    .cuando('SELECT mm_encolar', [{ res: { ok: true, ticket: 'MM-PAR2', reutilizado: false, expires_at: null } }])
    .cuando('SELECT mm_intentar_emparejar', [{ id: 'uuid-match-1' }])
    .cuando('SELECT mm_ticket_estado', [{ res: { ok: true, status: 'matched', position: 0, match_id: 'uuid-match-1' } }]);
  const h2 = construir({ env: env(), pool: pool2, fetch: fetchFalso() });
  const b2 = await (await h2(req('/encolar', { metodo: 'POST', body: { game: 'cs2', mode: 'duo' } }))).json();
  assert.equal(b2.data.match_id, 'uuid-match-1');
});

await ok('Validación: sin game → 400 · mode raro → 400 · SQL no_elegible → 403', async () => {
  const h = construir({ env: env(), pool: poolFalsoNeon(), fetch: fetchFalso() });
  assert.equal((await h(req('/encolar', { metodo: 'POST', body: { mode: 'duo' } }))).status, 400);
  assert.equal((await h(req('/encolar', { metodo: 'POST', body: { game: 'x', mode: 'squad' } }))).status, 400);
  const pool = poolFalsoNeon().cuando('SELECT mm_encolar', [{ res: { ok: false, error: 'no_elegible' } }]);
  const h2 = construir({ env: env(), pool, fetch: fetchFalso() });
  assert.equal((await h2(req('/encolar', { metodo: 'POST', body: { game: 'x' } }))).status, 403);
});

console.log('\n— Estado / salir —');

await ok('GET /estado sin ticket → 400 · feliz → status+posición · no_encontrado → 404', async () => {
  const h = construir({ env: env(), pool: poolFalsoNeon(), fetch: fetchFalso() });
  assert.equal((await h(req('/estado'))).status, 400);
  const pool = poolFalsoNeon().cuando('SELECT mm_ticket_estado', [{ res: { ok: true, status: 'queued', position: 3, match_id: null } }]);
  const h2 = construir({ env: env(), pool, fetch: fetchFalso() });
  const b = await (await h2(req('/estado?ticket=MM-POS3'))).json();
  assert.equal(b.data.position, 3);
  const pool3 = poolFalsoNeon().cuando('SELECT mm_ticket_estado', [{ res: { ok: false, error: 'no_encontrado' } }]);
  const h3 = construir({ env: env(), pool: pool3, fetch: fetchFalso() });
  assert.equal((await h3(req('/estado?ticket=MM-NADA'))).status, 404);
});

await ok('POST /salir → removed · sin ticket → 400', async () => {
  const pool = poolFalsoNeon().cuando('SELECT mm_salir', [{ res: { ok: true, removed: true } }]);
  const h = construir({ env: env(), pool, fetch: fetchFalso() });
  const b = await (await h(req('/salir', { metodo: 'POST', body: { ticket: 'MM-X1' } }))).json();
  assert.equal(b.data.removed, 'MM-X1');
  const h2 = construir({ env: env(), pool: poolFalsoNeon(), fetch: fetchFalso() });
  assert.equal((await h2(req('/salir', { metodo: 'POST', body: {} }))).status, 400);
});

console.log('\n— Reportar resultado + RR (mm_reportar, migra 22/23) —');

await ok('Sin match_id → 400 · 0-0 → 400 · decimales → 400 · negativos → 400', async () => {
  const h = construir({ env: env(), pool: poolFalsoNeon(), fetch: fetchFalso() });
  assert.equal((await h(req('/reportar', { metodo: 'POST', body: { score_a: 1, score_b: 2 } }))).status, 400);
  assert.equal((await h(req('/reportar', { metodo: 'POST', body: { match_id: 'u1', score_a: 0, score_b: 0 } }))).status, 400);
  assert.equal((await h(req('/reportar', { metodo: 'POST', body: { match_id: 'u1', score_a: 1.5, score_b: 2 } }))).status, 400);
  assert.equal((await h(req('/reportar', { metodo: 'POST', body: { match_id: 'u1', score_a: -1, score_b: 2 } }))).status, 400);
});

await ok('POST /reportar feliz → verificado con rr aplicado', async () => {
  const pool = poolFalsoNeon().cuando('SELECT mm_reportar', [{ res: { ok: true, verificado: 'true', rr: { ok: true, aplicados: 2, omitidos: 0 } } }]);
  const h = construir({ env: env(), pool, fetch: fetchFalso() });
  const b = await (await h(req('/reportar', { metodo: 'POST', body: { match_id: 'uuid-m1', score_a: 13, score_b: 9 } }))).json();
  assert.equal(b.ok, true);
  assert.equal(b.data.status, 'verificado');
  assert.equal(b.data.rr.aplicados, 2);
  const llamada = pool.llamadas.find((l) => l.sql.includes('SELECT mm_reportar'));
  assert.equal(llamada.params[1], SUB);
  assert.equal(llamada.params[2], 13);
});

await ok('ya_reportado → 409', async () => {
  const pool = poolFalsoNeon().cuando('SELECT mm_reportar', [{ res: { ok: false, error: 'ya_reportado' } }]);
  const h = construir({ env: env(), pool, fetch: fetchFalso() });
  assert.equal((await h(req('/reportar', { metodo: 'POST', body: { match_id: 'u1', score_a: 1, score_b: 2 } }))).status, 409);
});

console.log('\n— Historiales (mm_historial_de + rr_historial_jugador, migra 22/27) —');

await ok('GET /historial y GET /rr → 200 listas del sub del JWT', async () => {
  const pool = poolFalsoNeon()
    .cuando('FROM mm_historial_de', [{ match_id: 'm1', rr_delta: 2, resultado: 'win' }])
    .cuando('FROM rr_historial_jugador', [{ motivo: 'faceit_partida', rr_delta: 1, fecha: '2026-10-19' }]);
  const h = construir({ env: env(), pool, fetch: fetchFalso() });
  const b1 = await (await h(req('/historial?limite=200'))).json();
  assert.equal(b1.ok, true);
  assert.equal(b1.data[0].rr_delta, 2);
  const b2 = await (await h(req('/rr'))).json();
  assert.equal(b2.ok, true);
  assert.equal(b2.data[0].motivo, 'faceit_partida');
  const hr = pool.llamadas.find((l) => l.sql.includes('FROM rr_historial_jugador'));
  assert.equal(hr.params[0], SUB);
  const hl = pool.llamadas.find((l) => l.sql.includes('FROM mm_historial_de'));
  assert.equal(hl.params[1], 100, 'limite clampeado a 100');
});

console.log('\n— Invitaciones (mm_invitar / mm_invites_pendientes / mm_responder_invite, migra 24) —');

await ok('POST /invitar feliz → id + status', async () => {
  const pool = poolFalsoNeon().cuando('SELECT mm_invitar', [{ res: { ok: true, reutilizada: false, id: 'inv-1', status: 'pendiente', expires_at: 'x' } }]);
  const h = construir({ env: env(), pool, fetch: fetchFalso() });
  const b = await (await h(req('/invitar', { metodo: 'POST', body: { to_email: 'amigo@vants.gg', game: 'valorant', mode: 'duo' } }))).json();
  assert.equal(b.data.id, 'inv-1');
  assert.equal(b.data.reutilizada, false);
  const llamada = pool.llamadas.find((l) => l.sql.includes('SELECT mm_invitar'));
  assert.equal(llamada.params[0], 'amigo@vants.gg');
});

await ok('destino_no_encontrado → 404 · GET /invites → recibidas+enviadas · responder sin id → 400', async () => {
  const pool = poolFalsoNeon().cuando('SELECT mm_invitar', [{ res: { ok: false, error: 'destino_no_encontrado' } }]);
  const h = construir({ env: env(), pool, fetch: fetchFalso() });
  assert.equal((await h(req('/invitar', { metodo: 'POST', body: { to_email: 'x@y.z', game: 'g' } }))).status, 404);

  const pool2 = poolFalsoNeon().cuando('SELECT mm_invites_pendientes', [{ res: { ok: true, recibidas: [{ id: 'i1' }], enviadas: [] } }]);
  const h2 = construir({ env: env(), pool: pool2, fetch: fetchFalso() });
  const b2 = await (await h2(req('/invites'))).json();
  assert.equal(b2.data.recibidas.length, 1);

  const h3 = construir({ env: env(), pool: poolFalsoNeon(), fetch: fetchFalso() });
  assert.equal((await h3(req('/invites/responder', { metodo: 'POST', body: {} }))).status, 400);

  const pool4 = poolFalsoNeon().cuando('SELECT mm_responder_invite', [{ res: { ok: true, status: 'aceptada', ticket: 'MM-N9', match_id: null } }]);
  const h4 = construir({ env: env(), pool: pool4, fetch: fetchFalso() });
  const b4 = await (await h4(req('/invites/responder', { metodo: 'POST', body: { id: 'i1', aceptar: true } }))).json();
  assert.equal(b4.data.status, 'aceptada');
});

await ok('Ruta desconocida → 404', async () => {
  const h = construir({ env: env(), pool: poolFalsoNeon(), fetch: fetchFalso() });
  assert.equal((await h(req('/nada'))).status, 404);
});

console.log(`\nResultado: ${pass} PASS · ${fail} FAIL`);
process.exit(fail ? 1 : 0);
