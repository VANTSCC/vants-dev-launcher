// ============================================
// mm — Neon Function: MATCHMAKING serverless (Fase 4 → 0 EUR)
// Espejo HTTP del matchmaking-service (Fastify) SIN hosting de pago:
// misma fuente de verdad en SQL (migraciones 21/22/23/24/27) y el
// mismo contrato de respuestas {ok, data} / {ok:false, error:{message}}.
//
//   POST /encolar    {game, mode, region?, ttl_min?}  → mm_encolar + mm_intentar_emparejar
//   GET  /estado?ticket=MM-…                          → mm_ticket_estado (solo dueño)
//   POST /salir      {ticket}                         → mm_salir (solo dueño)
//   POST /reportar   {match_id, score_a, score_b}     → mm_reportar (participante; aplica RR)
//   GET  /historial?limite=                           → mm_historial_de (matches internos)
//   GET  /rr?limite=                                  → rr_historial_jugador (FACEIT + internos, migra 27)
//   POST /invitar    {to_email, game, mode, region?}  → mm_invitar (migra 24)
//   GET  /invites?limite=                             → mm_invites_pendientes
//   POST /invites/responder {id, aceptar}             → mm_responder_invite
//   GET  /salud                                       → diagnóstico sin secretos
//
// Autenticación: JWT RS256 de Auth0 (mismo dominio/audience que el
// service), verificado SIN dependencias con node:crypto (JWKS con cache).
// Defensa en profundidad: además de validar el token aquí, cada consulta
// corre en transacción con `set_config('request.jwt.claim.sub', sub, true)`
// para que los guards de identidad de las funciones SQL (migración 23/24)
// vuelvan a comprobar que nadie toca filas ajenas.
// ============================================

import { Pool } from 'pg';
import { createPublicKey, verify as cryptoVerify } from 'node:crypto';

const JWKS_TTL_MS = 10 * 60 * 1000;
const LEEWAY_SEG = 30;
const TICKET_TTL_MS = 10 * 60 * 1000; // igual que el service
const MODOS: Record<string, number> = { duo: 2, team: 10 }; // 1v1 / 5v5

type Fila = Record<string, unknown>;
type Cliente = { query: (sql: string, params?: unknown[]) => Promise<{ rows: Fila[]; rowCount?: number }>; release: () => void };
type PoolMini = { connect: () => Promise<Cliente> };
type Dependencias = {
  env: Record<string, string | undefined>;
  pool: PoolMini;
  fetch: typeof fetch;
};

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}
const err = (message: string, status: number): Response => json({ ok: false, error: { message } }, status);

// ── Auth0 RS256 sin dependencias ────────────────────────────────────────────
let jwksCache: { at: number; claves: Fila[] } | null = null;

function b64urlJson(part: string): Fila | null {
  try { return JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as Fila; } catch { return null; }
}

async function jwks(f: typeof fetch, dominio: string): Promise<Fila[]> {
  if (jwksCache && Date.now() - jwksCache.at < JWKS_TTL_MS) return jwksCache.claves;
  const r = await f(`https://${dominio}/.well-known/jwks.json`, { signal: AbortSignal.timeout(8000) });
  const j = (await r.json().catch(() => null)) as { keys?: Fila[] } | null;
  if (!j || !Array.isArray(j.keys)) throw new Error('jwks_invalido');
  jwksCache = { at: Date.now(), claves: j.keys };
  return j.keys;
}

async function validarJwt(authHeader: string | null, dep: Dependencias): Promise<{ sub: string } | null> {
  const dominio = String(dep.env.AUTH0_DOMAIN || 'vants.eu.auth0.com').replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const audience = String(dep.env.AUTH0_AUDIENCE || 'https://api.vants.app');
  if (!authHeader || !/^bearer /i.test(authHeader)) return null;
  const token = authHeader.replace(/^bearer /i, '').trim();
  const partes = token.split('.');
  if (partes.length !== 3) return null;
  const cab = b64urlJson(partes[0]);
  const cuerpo = b64urlJson(partes[1]);
  if (!cab || !cuerpo || cab.alg !== 'RS256') return null;
  const ahora = Math.floor(Date.now() / 1000);
  if (typeof cuerpo.exp !== 'number' || cuerpo.exp + LEEWAY_SEG < ahora) return null;
  if (cuerpo.iss !== `https://${dominio}/`) return null;
  const aud = cuerpo.aud;
  const audOk = typeof aud === 'string' ? aud === audience : Array.isArray(aud) ? (aud as string[]).includes(audience) : false;
  if (!audOk) return null;
  if (typeof cuerpo.sub !== 'string' || !cuerpo.sub) return null;
  try {
    const claves = await jwks(dep.fetch, dominio);
    const jwk = claves.find((k) => k.kid === cab.kid) || (claves.length === 1 ? claves[0] : null);
    if (!jwk || jwk.kty !== 'RSA') return null;
    const key = createPublicKey({ key: jwk as never, format: 'jwk' });
    const ok = cryptoVerify('RSA-SHA256', Buffer.from(`${partes[0]}.${partes[1]}`), key, Buffer.from(partes[2], 'base64url'));
    if (!ok) return null;
  } catch {
    return null;
  }
  return { sub: cuerpo.sub };
}

// ── SQL con identidad (GUC) para los guards de las migraciones 23/24 ───────
async function conSub<T>(pool: PoolMini, sub: string, fn: (c: Cliente) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [sub]);
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch { /* cliente ya roto */ }
    throw e;
  } finally {
    client.release();
  }
}

// error SQL (jsonb res.error) → status HTTP
function statusDeError(code: string): number {
  if (code === 'ya_reportado') return 409;
  if (code === 'no_encontrado' || code === 'destino_no_encontrado') return 404;
  if (code === 'sub_ajeno' || code === 'ticket_ajeno' || code === 'no_participante'
    || code === 'no_elegible' || code === 'destino_es_tu_email' || code === 'ya_no_vigente') return 403;
  if (code === 'sin_sesion') return 500;
  return 400; // game_requerido, mode_invalido, score_invalido, email_invalido…
}

function respuestaSql(res: Fila | undefined, exito: (r: Fila) => Response): Response {
  if (!res || res.ok !== true) {
    const code = String((res && res.error) || 'error_sql');
    return err(code, statusDeError(code));
  }
  return exito(res);
}

// ── Handler ─────────────────────────────────────────────────────────────────
export function construir(sobre: Partial<Dependencias> = {}) {
  const env = sobre.env ?? process.env;
  const pool = sobre.pool ?? (new Pool({ connectionString: env.DATABASE_URL, max: 3, idleTimeoutMillis: 30_000 }) as unknown as PoolMini);
  const f: typeof fetch = sobre.fetch ?? fetch;

  return async function handler(req: Request): Promise<Response> {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    // URL única y parseada UNA vez: antes se parseaba dos veces y la segunda
    // quedaba fuera del try (una URL inválida acababa en 500 sin JSON).
    let url: URL;
    try { url = new URL(req.url); } catch { return err('url_invalida', 400); }
    const ruta = url.pathname.replace(/\/+$/, '') || '/';
    const q = url.searchParams;

    if (req.method === 'GET' && (ruta === '/' || ruta === '/salud')) {
      return json({
        ok: true,
        fn: 'mm',
        config: {
          auth0: String(env.AUTH0_DOMAIN || 'vants.eu.auth0.com'),
          audience: String(env.AUTH0_AUDIENCE || 'https://api.vants.app'),
          jwt: 'RS256 + JWKS + GUC(request.jwt.claim.sub)',
          base_datos: 'migraciones 21/22/23/24/27 (mm_encolar, mm_ticket_estado, mm_salir, mm_reportar, mm_historial_de, rr_historial_jugador, mm_invitar…)',
        },
        endpoints: ['POST /encolar', 'GET /estado?ticket=', 'POST /salir', 'POST /reportar', 'GET /historial', 'GET /rr', 'POST /invitar', 'GET /invites', 'POST /invites/responder', 'GET /salud'],
      });
    }

    // ── Autenticación (todos los endpoints de juego) ──
    const sesion = await validarJwt(req.headers.get('authorization'), { env, pool, fetch: f });
    if (!sesion) return err('unauthorized: Bearer JWT de Auth0 requerido', 401);
    const sub = sesion.sub;

    // ── Cola ──
    if (ruta === '/encolar' && req.method === 'POST') {
      const body = (await req.json().catch(() => ({}))) as Fila;
      const game = String(body.game ?? '').trim();
      const mode = String(body.mode ?? 'duo').trim();
      const region = String(body.region ?? 'EU').trim() || 'EU';
      const ttlMin = Number(body.ttl_min ?? 10);
      if (!game) return err('game_requerido', 400);
      if (!(mode in MODOS)) return err('mode_invalido (duo | team)', 400);
      const ttlSeg = Math.round(Number.isFinite(ttlMin) ? ttlMin * 60 : TICKET_TTL_MS / 1000);

      const enc = await conSub(pool, sub, (c) => c.query('SELECT mm_encolar($1,$2,$3,$4,$5) AS res', [sub, game, mode, region, ttlSeg]));
      const res = (enc.rows[0] && enc.rows[0].res) as Fila | undefined;
      if (!res || res.ok !== true) return respuestaSql(res, () => json({ ok: true }));

      // emparejamiento inmediato (atómico; si falta gente queda en cola)
      let matchId: string | null = null;
      try {
        const m = await conSub(pool, sub, (c) => c.query('SELECT mm_intentar_emparejar($1,$2,$3) AS id', [game, mode, region]));
        matchId = (m.rows[0] && (m.rows[0].id as string)) || null;
      } catch { /* el ticket sigue en cola */ }

      const est = await conSub(pool, sub, (c) => c.query('SELECT mm_ticket_estado($1) AS res', [res.ticket]));
      const e = (est.rows[0] && est.rows[0].res) as Fila | undefined;
      return json({
        ok: true,
        data: {
          ticket: res.ticket,
          reutilizado: !!res.reutilizado,
          game, mode, region,
          position: (e && Number(e.position)) || 0,
          ttl_ms: TICKET_TTL_MS,
          expires_at: res.expires_at ?? null,
          match_id: matchId || (e && e.status === 'matched' ? e.match_id : null) || null,
        },
      }, res.reutilizado ? 200 : 201);
    }

    if (ruta === '/estado' && req.method === 'GET') {
      const ticket = String(q.get('ticket') ?? '');
      if (!ticket) return err('ticket requerido (?ticket=MM-…)', 400);
      const r = await conSub(pool, sub, (c) => c.query('SELECT mm_ticket_estado($1) AS res', [ticket]));
      const res = (r.rows[0] && r.rows[0].res) as Fila | undefined;
      return respuestaSql(res, (x) => json({
        ok: true,
        data: { ticket, status: x.status, position: Number(x.position) || 0, match_id: x.match_id ?? null, expires_at: x.expires_at ?? null },
      }));
    }

    if (ruta === '/salir' && req.method === 'POST') {
      const body = (await req.json().catch(() => ({}))) as Fila;
      const ticket = String(body.ticket ?? '');
      if (!ticket) return err('ticket requerido', 400);
      const r = await conSub(pool, sub, (c) => c.query('SELECT mm_salir($1) AS res', [ticket]));
      const res = (r.rows[0] && r.rows[0].res) as Fila | undefined;
      return respuestaSql(res, (x) => json({ ok: true, data: { removed: x.removed ? ticket : null } }));
    }

    // ── Partidas ──
    if (ruta === '/reportar' && req.method === 'POST') {
      const body = (await req.json().catch(() => ({}))) as Fila;
      const matchId = String(body.match_id ?? '');
      const a = Number(body.score_a); const b = Number(body.score_b);
      if (!matchId) return err('match_id requerido', 400);
      if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0 || a + b === 0) {
        return err('score_invalido: enteros >= 0 y no 0-0', 400);
      }
      const r = await conSub(pool, sub, (c) => c.query('SELECT mm_reportar($1::uuid,$2,$3,$4) AS res', [matchId, sub, a, b]));
      const res = (r.rows[0] && r.rows[0].res) as Fila | undefined;
      return respuestaSql(res, (x) => json({
        ok: true,
        data: { match_id: matchId, status: x.verificado === 'true' ? 'verificado' : 'reportado', score_a: a, score_b: b, rr: x.rr ?? null },
      }));
    }

    // ── Historiales ──
    if (ruta === '/historial' && req.method === 'GET') {
      const limite = Math.max(1, Math.min(parseInt(q.get('limite') || '50', 10) || 50, 100));
      const r = await conSub(pool, sub, (c) => c.query('SELECT * FROM mm_historial_de($1,$2)', [sub, limite]));
      return json({ ok: true, data: r.rows });
    }

    if (ruta === '/rr' && req.method === 'GET') {
      const limite = Math.max(1, Math.min(parseInt(q.get('limite') || '50', 10) || 50, 100));
      const r = await conSub(pool, sub, (c) => c.query(
        'SELECT h.* FROM rr_historial_jugador h JOIN players p ON p.id = h.player_id WHERE p.auth0_sub = $1 ORDER BY h.fecha DESC LIMIT $2',
        [sub, limite],
      ));
      return json({ ok: true, data: r.rows });
    }

    // ── Invitaciones (migración 24; usan el GUC como identidad) ──
    if (ruta === '/invitar' && req.method === 'POST') {
      const body = (await req.json().catch(() => ({}))) as Fila;
      const r = await conSub(pool, sub, (c) => c.query('SELECT mm_invitar($1,$2,$3,$4) AS res', [
        String(body.to_email ?? ''), String(body.game ?? ''), String(body.mode ?? 'duo'), String(body.region ?? 'EU'),
      ]));
      const res = (r.rows[0] && r.rows[0].res) as Fila | undefined;
      return respuestaSql(res, (x) => json({ ok: true, data: { id: x.id, reutilizada: !!x.reutilizada, status: x.status ?? 'pendiente', expires_at: x.expires_at ?? null } }));
    }

    if (ruta === '/invites' && req.method === 'GET') {
      const limite = Math.max(1, Math.min(parseInt(q.get('limite') || '20', 10) || 20, 50));
      const r = await conSub(pool, sub, (c) => c.query('SELECT mm_invites_pendientes($1) AS res', [limite]));
      const res = (r.rows[0] && r.rows[0].res) as Fila | undefined;
      return respuestaSql(res, (x) => json({ ok: true, data: { recibidas: x.recibidas ?? [], enviadas: x.enviadas ?? [] } }));
    }

    if (ruta === '/invites/responder' && req.method === 'POST') {
      const body = (await req.json().catch(() => ({}))) as Fila;
      const id = String(body.id ?? '');
      if (!id) return err('id de invitación requerido', 400);
      const aceptar = body.aceptar !== false;
      const r = await conSub(pool, sub, (c) => c.query('SELECT mm_responder_invite($1::uuid,$2) AS res', [id, aceptar]));
      const res = (r.rows[0] && r.rows[0].res) as Fila | undefined;
      return respuestaSql(res, (x) => json({ ok: true, data: { status: x.status ?? null, ticket: x.ticket ?? null, match_id: x.match_id ?? null } }));
    }

    return err('ruta no soportada', 404);
  };
}

export default construir();
