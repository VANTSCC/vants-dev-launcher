// ============================================
// VANTS — test_mm_fase4.js
// --------------------------------------------
// Tests del matchmaking-service v0.4.0 (Fase 4, sin tocar red ni Neon):
//   · fastify.inject (no escucha puertos).
//   · auth inyectable: JWKS falso + tokens RSA-SHA256 firmados acá.
//   · store en memoria (misma interfaz que el store pg de la migración 21).
// Secuencia determinista: cada test usa grupos (game,mode,region) que NO
// chocan con los anteriores salvo intención explícita de emparejar.
// Uso: node scripts/test_mm_fase4.js  → PASS/FAIL + exit code.
// ============================================
'use strict';
process.env.LOG_LEVEL = 'silent';
const crypto = require('crypto');

const { crearAuthVerifier } = require('../services/matchmaking-service/auth');
const { construir } = require('../services/matchmaking-service/server');
const { crearStoreMemoria } = require('../services/matchmaking-service/store');

// ---------- helpers RSA (firma y JWKS falsos) ----------
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwkPublic = publicKey.export({ format: 'jwk' });
const KID = 'test-kid-1';
const jwks = { keys: [{ ...jwkPublic, kid: KID, alg: 'RS256', use: 'sig' }] };

function b64u(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}
function firmarToken(claims) {
  const header = { alg: 'RS256', typ: 'JWT', kid: KID };
  const data = `${b64u(header)}.${b64u(claims)}`;
  const sig = crypto.sign('RSA-SHA256', Buffer.from(data), privateKey).toString('base64url');
  return `${data}.${sig}`;
}
function tokenDe(sub) {
  const ahora = Math.floor(Date.now() / 1000);
  return firmarToken({ sub, iat: ahora, exp: ahora + 600, iss: 'https://vants.eu.auth0.com/' });
}

// ---------- infraestructura de test ----------
let pasan = 0;
let fallan = 0;
function ok(cond, nombre) {
  if (cond) { pasan += 1; console.log(`  PASS  ${nombre}`); } else { fallan += 1; console.log(`  FAIL  ${nombre}`); }
}

// Store de test: AAA y BBB elegibles; CCC no; reloj controlable.
let reloj = Date.now();
const ELEGIBLES = new Map([
  ['auth0|AAA', 'p-aaa'],
  ['auth0|BBB', 'p-bbb'],
]);
const store = crearStoreMemoria({ elegibles: ELEGIBLES, ahora: () => new Date(reloj) });

const app = construir({
  store,
  auth: crearAuthVerifier({ jwksProvider: async () => jwks }),
});

async function req(metodo, url, { sub = 'auth0|AAA', cuerpo, sinToken } = {}) {
  return app.inject({
    method: metodo,
    url,
    headers: {
      // content-type solo si hay body (Fastify rechaza JSON vacío en DELETE)
      ...(cuerpo !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(sinToken ? {} : { authorization: `Bearer ${tokenDe(sub)}` }),
    },
    ...(cuerpo !== undefined ? { payload: cuerpo } : {}),
  });
}

const encolar = (sub, game, mode, region = 'EU') =>
  req('POST', '/api/v1/matchmaking/queue', { sub, cuerpo: { game, mode, region } });

(async () => {
  // ---------- healthz ----------
  {
    const r = await req('GET', '/healthz', { sinToken: true });
    ok(r.statusCode === 200 && r.json().ok === true, 'healthz 200 ok');
    ok(r.json().store === 'memoria', 'healthz reporta store memoria');
    ok(r.json().version === '0.5.0', 'healthz versión 0.5.0');
  }

  // ---------- auth ----------
  {
    const sin = await req('GET', '/api/v1/me', { sinToken: true });
    ok(sin.statusCode === 401, 'GET /me sin token → 401');
    const malo = await req('GET', '/api/v1/me', { token: 'no' ? undefined : undefined, sinToken: true });
    ok(malo.statusCode === 401, 'GET /me sin token → 401 (2)');
    const basura = await app.inject({ method: 'GET', url: '/api/v1/me', headers: { authorization: 'Bearer abc.def.ghi' } });
    ok(basura.statusCode === 401, 'GET /me token basura → 401');
    const bueno = await req('GET', '/api/v1/me', { sub: 'auth0|AAA' });
    ok(bueno.statusCode === 200 && bueno.json().data.sub === 'auth0|AAA', 'GET /me con token → sub');
  }

  // ---------- validación de entrada ----------
  {
    const sinGame = await encolar('auth0|AAA', '', 'duo');
    ok(sinGame.statusCode === 400, 'POST cola sin game → 400');
    const malModo = await encolar('auth0|AAA', 'valorant', 'x9');
    ok(malModo.statusCode === 400, 'POST cola mode inválido → 400');
    const noEleg = await encolar('auth0|CCC', 'valorant', 'duo');
    ok(noEleg.statusCode === 403, 'POST cola no elegible → 403');
  }

  // ---------- encolar + duplicados: unicidad por (sub, game), cualquier modo ----------
  {
    const a = await encolar('auth0|BBB', 'valorant', 'team', 'EU');
    ok(a.statusCode === 201 && a.json().data.ticket.startsWith('MM-'), 'POST cola elegible → 201 ticket');
    const t1 = a.json().data.ticket;
    ok(a.json().data.match_id === null, '1 jugador team → sin match');
    const b = await encolar('auth0|BBB', 'valorant', 'team', 'EU');
    ok(b.statusCode === 200 && b.json().data.reutilizado === true, 'reencolar mismo modo → 200 reutilizado');
    ok(b.json().data.ticket === t1, 'mismo ticket devuelto');
    const c = await encolar('auth0|BBB', 'valorant', 'duo', 'EU');
    ok(c.statusCode === 200 && c.json().data.ticket === t1, 'unicidad (sub,game): duo devuelve el ticket team');
    ok(c.json().data.mode === 'team', 'el ticket conserva su modo original (team)');
  }

  // ---------- emparejamiento duo (2 = 1v1) en juego fresco ----------
  {
    const a = await encolar('auth0|AAA', 'apex', 'duo', 'EU');
    ok(a.statusCode === 201 && a.json().data.match_id === null, '1º apex duo → queued sin match');
    const b = await encolar('auth0|BBB', 'apex', 'duo', 'EU');
    ok(b.statusCode === 201, '2º jugador duo → 201');
    const mid = b.json().data.match_id;
    ok(typeof mid === 'string' && mid.startsWith('mm-'), `match creado al completar duo (${mid})`);
    const t = await req('GET', `/api/v1/matchmaking/queue/${b.json().data.ticket}`, { sub: 'auth0|BBB' });
    ok(t.json().data.status === 'matched', 'ticket queda matched');
    ok(t.json().data.position === 0, 'matched no tiene posición de cola');
  }

  // ---------- cola de 3º (otro juego, no empareja) ----------
  {
    const c = await encolar('auth0|AAA', 'cs2', 'duo', 'EU');
    const t = c.json().data.ticket;
    const g = await req('GET', `/api/v1/matchmaking/queue/${t}`, { sub: 'auth0|AAA' });
    ok(g.statusCode === 200 && g.json().data.status === 'queued', 'tercero queued (otro juego)');
    ok(g.json().data.position === 1, 'posición 1');
  }

  // ---------- permisos de ticket ----------
  {
    const a = await encolar('auth0|BBB', 'lol', 'duo', 'EU');
    const t = a.json().data.ticket;
    const g = await req('GET', `/api/v1/matchmaking/queue/${t}`, { sub: 'auth0|AAA' });
    ok(g.statusCode === 403, 'GET ticket ajeno → 403');
    const d = await req('DELETE', `/api/v1/matchmaking/queue/${t}`, { sub: 'auth0|AAA' });
    ok(d.statusCode === 403, 'DELETE ticket ajeno → 403');
    const d2 = await req('DELETE', `/api/v1/matchmaking/queue/${t}`, { sub: 'auth0|BBB' });
    ok(d2.statusCode === 200 && d2.json().data.removed === t, 'DELETE propio → 200 removed');
  }

  // ---------- match: permisos y reporte (par fresco en 'overwatch') ----------
  {
    const nf = await req('GET', '/api/v1/matchmaking/matches/mm-noexiste', { sub: 'auth0|AAA' });
    ok(nf.statusCode === 404, 'GET match inexistente → 404');
    await encolar('auth0|AAA', 'overwatch', 'duo', 'EU');
    const b = await encolar('auth0|BBB', 'overwatch', 'duo', 'EU');
    const mid = b.json().data.match_id;
    ok(!!mid, 'match overwatch creado');
    const fuera = await req('GET', `/api/v1/matchmaking/matches/${mid}`, { sub: 'auth0|CCC' });
    ok(fuera.statusCode === 403, 'GET match como no participante → 403');
    const dentro = await req('GET', `/api/v1/matchmaking/matches/${mid}`, { sub: 'auth0|AAA' });
    ok(dentro.statusCode === 200 && dentro.json().data.players.length === 2, 'GET match participante → 200 con 2 jugadores');
    ok(dentro.json().data.players.map((p) => p.team).sort().join(',') === '1,2', 'lados 1 y 2');
    const rep = await req('POST', `/api/v1/matchmaking/matches/${mid}/result`, { sub: 'auth0|AAA', cuerpo: { score_a: 13, score_b: 7 } });
    ok(rep.statusCode === 200 && rep.json().data.status === 'verificado', 'reporte participante → 200 verificado (RR auto)');
    ok(rep.json().data.rr && rep.json().data.rr.aplicados === 2, `RR aplicado a 2 jugadores (${JSON.stringify(rep.json().data.rr)})`);
    global.__midOW = mid;
    const rep2 = await req('POST', `/api/v1/matchmaking/matches/${mid}/result`, { sub: 'auth0|BBB', cuerpo: { score_a: 1, score_b: 1 } });
    ok(rep2.statusCode === 409, 'segundo reporte → 409');
    const repFuera = await req('POST', `/api/v1/matchmaking/matches/${mid}/result`, { sub: 'auth0|CCC', cuerpo: { score_a: 2, score_b: 2 } });
    ok(repFuera.statusCode === 403, 'reporte de fuera → 403');
  }

  // ---------- RR: valores, idempotencia e historial ----------
  {
    const mid = global.__midOW;
    const m = await req('GET', `/api/v1/matchmaking/matches/${mid}`, { sub: 'auth0|AAA' });
    const ps = m.json().data.players;
    const aaa = ps.find((p) => p.sub === 'auth0|AAA');
    const bbb = ps.find((p) => p.sub === 'auth0|BBB');
    ok(aaa.rr_before === 95 && aaa.rr_after === 97, `AAA (team1, win): RR 95 → 97 (${aaa.rr_before}→${aaa.rr_after})`);
    ok(bbb.rr_before === 95 && bbb.rr_after === 94, `BBB (team2, loss): RR 95 → 94 (${bbb.rr_before}→${bbb.rr_after})`);
    // Idempotencia: verificar de nuevo no duplica RR
    const ya = await store.verificar(mid);
    ok(ya.ok === true && ya.ya === true, 'verificar de nuevo → {ok, ya:true}');
    const m2 = await req('GET', `/api/v1/matchmaking/matches/${mid}`, { sub: 'auth0|AAA' });
    const aaa2 = m2.json().data.players.find((p) => p.sub === 'auth0|AAA');
    ok(aaa2.rr_after === 97, 'RR sin doble aplicación (sigue 97)');
    // Historial: la entrada del overwatch con delta +2 y resultado win
    const h = await req('GET', '/api/v1/matchmaking/history', { sub: 'auth0|AAA' });
    ok(h.statusCode === 200 && Array.isArray(h.json().data), 'GET history → 200 lista');
    const ow = h.json().data.find((e) => e.match_id === mid);
    ok(ow && ow.rr_delta === 2 && ow.resultado === 'win' && ow.status === 'verificado', `history overwatch: +2 win verificado (${JSON.stringify(ow && { d: ow.rr_delta, r: ow.resultado })})`);
    // Historial es privado: sin token → 401
    const hs = await req('GET', '/api/v1/matchmaking/history', { sinToken: true });
    ok(hs.statusCode === 401, 'GET history sin token → 401');
    // Historial RR completo (migración 27): /api/v1/matchmaking/rr
    const rr = await req('GET', '/api/v1/matchmaking/rr', { sub: 'auth0|AAA' });
    ok(rr.statusCode === 200 && Array.isArray(rr.json().data), 'GET rr → 200 lista');
    const owRR = rr.json().data.find((e) => e.partida_id === mid);
    ok(owRR && owRR.motivo === 'match_interno' && owRR.fuente === 'interno' && owRR.rr_delta === 2 && !!owRR.fecha,
      `rr: match_interno +2 con fecha (${JSON.stringify(owRR && { m: owRR.motivo, f: owRR.fuente, d: owRR.rr_delta })})`);
    const rrs = await req('GET', '/api/v1/matchmaking/rr', { sinToken: true });
    ok(rrs.statusCode === 401, 'GET rr sin token → 401');
  }

  // ---------- validación de score (par fresco en 'rocket') ----------
  {
    await encolar('auth0|AAA', 'rocket', 'duo', 'EU');
    const b = await encolar('auth0|BBB', 'rocket', 'duo', 'EU');
    const mid = b.json().data.match_id;
    ok(!!mid, 'match rocket creado');
    const cero = await req('POST', `/api/v1/matchmaking/matches/${mid}/result`, { sub: 'auth0|BBB', cuerpo: { score_a: 0, score_b: 0 } });
    ok(cero.statusCode === 400, 'score 0-0 → 400');
    const neg = await req('POST', `/api/v1/matchmaking/matches/${mid}/result`, { sub: 'auth0|BBB', cuerpo: { score_a: -1, score_b: 5 } });
    ok(neg.statusCode === 400, 'score negativo → 400');
    const dec = await req('POST', `/api/v1/matchmaking/matches/${mid}/result`, { sub: 'auth0|BBB', cuerpo: { score_a: 1.5, score_b: 5 } });
    ok(dec.statusCode === 400, 'score decimal → 400');
  }

  // ---------- TTL / vencimiento ----------
  {
    reloj += 11 * 60 * 1000; // todo lo 'queued' vence (TTL 10 min)
    const a = await encolar('auth0|AAA', 'fortnite', 'duo', 'EU');
    ok(a.statusCode === 201 && a.json().data.reutilizado === false, 'tras vencer TTL encola ticket NUEVO (201)');
    const b = await encolar('auth0|BBB', 'fortnite', 'duo', 'EU');
    ok(!!b.json().data.match_id, 'nuevo par → match nuevo');
  }

  // ---------- team: 10 necesarios (5v5) ----------
  {
    reloj += 11 * 60 * 1000;
    let ultimo = null;
    for (let i = 1; i <= 9; i += 1) {
      const s = `auth0|S${i}`;
      ELEGIBLES.set(s, `p-s${i}`);
      ultimo = await encolar(s, 'valorant', 'team', 'NA');
    }
    ok(ultimo.statusCode === 201 && !ultimo.json().data.match_id, '9 jugadores team → sin match aún');
    ELEGIBLES.set('auth0|S10', 'p-s10');
    const decimo = await encolar('auth0|S10', 'valorant', 'team', 'NA');
    ok(!!decimo.json().data.match_id, '10º jugador → match team creado');
    const m = await req('GET', `/api/v1/matchmaking/matches/${decimo.json().data.match_id}`, { sub: 'auth0|S10' });
    const teams = m.json().data.players.map((p) => p.team);
    ok(teams.filter((t) => t === 1).length === 5 && teams.filter((t) => t === 2).length === 5, '5v5');
  }

  console.log(`\nRESULTADO: ${pasan} pass · ${fallan} fail`);
  await app.close();
  await store.cerrar();
  process.exit(fallan === 0 ? 0 : 1);
})().catch((e) => {
  console.error('ERROR FATAL:', e);
  process.exit(1);
});
