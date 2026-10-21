// ============================================
// vantsdata — Neon Function (proxy público de LECTURA)
// Sirve las lecturas anónimas de la web VANTS (sala de jugadores, torneos,
// calendario, ranking, reglas) con semántica PostgREST en el subconjunto
// exacto que usa el frontend (arena.js / arena-live.js / auth0-config.js):
//   · GET /                      → diagnóstico {"ok":true} (lo vigila monitor.js)
//   · GET /?table=T&...          → SELECT sobre T con filtros, order, limit,
//                                  select (columnas + embeds conocidos) y _count
//   · Cabecera Content-Range     → para counts exactos del panel/stats
//
// Seguridad:
//   · Solo GET/OPTIONS (nunca escrituras)
//   · Whitelist estricta de tablas legibles (todas públicas por diseño)
//   · Valores SIEMPRE parametrizados ($1..$n); columnas/tablas validadas por regex
//   · Columnas de identidad (email, auth0_sub, auth_user_id) stripadas de la
//     respuesta (ni en filas base ni dentro de embeds)
//   · Límite duro de filas (1000) + rate limit por IP
//   · Solo el FK-map de abajo habilita embeds (no hay resolución dinámica)
// ============================================

import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 3,
  idleTimeoutMillis: 30_000,
});

const VERSION = 'vantsdata-1';
const MAX_LIMIT = 1000;
const DEFAULT_LIMIT = 100;
const RATE_PER_MIN = Number(process.env.VANTSDATA_RATE_PER_MIN ?? 240);

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'accept, content-type',
};

const STRIP_COLS = new Set(['email', 'auth0_sub', 'auth_user_id']);
const IDENT_RE = /^[a-z_][a-z0-9_]*$/;

// Tablas legibles públicamente (solo lecturas; las escrituras van SIEMPRE
// por la Data API con JWT de Auth0).
const TABLES = new Set([
  'players',
  'season_player_stats',
  'seasons',
  'leaderboard',
  'ranked_rules',
  'ranked_matches',
  'tournaments',
  'tournament_entries',
  'tournament_matches',
  'events',
  'profiles',
  // Plataforma de torneos (migraciones 28/29): catálogo público estilo strafe.
  // Solo lectura anónima; escrituras por RLS del OWNER con JWT Auth0.
  'pt_games',
  'pt_torneos',
  'pt_teams',
  'pt_matches',
  'pt_articulos',
  'pt_players',
]);

// Embeds PostgREST permitidos: "alias:tabla(columnas)".
// Clave = "<tabla_base>.<alias>" → { tabla padre, columna FK en la base }.
const EMBED_FK: Record<string, { tabla: string; fk: string }> = {
  'tournament_entries.player': { tabla: 'players', fk: 'player_id' },
  'tournament_entries.tournament': { tabla: 'tournaments', fk: 'tournament_id' },
  'tournament_matches.p1': { tabla: 'players', fk: 'player1_id' },
  'tournament_matches.p2': { tabla: 'players', fk: 'player2_id' },
  'tournament_matches.tournament': { tabla: 'tournaments', fk: 'tournament_id' },
  'season_player_stats.season': { tabla: 'seasons', fk: 'season_id' },
  'leaderboard.player': { tabla: 'players', fk: 'player_id' },
};

function json(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json', ...extra },
  });
}

/* ── rate limit en memoria (por instancia) ─────────────────────────────── */
const hits = new Map<string, number[]>();
function dentroLimite(ip: string): boolean {
  const t = Date.now();
  const lista = (hits.get(ip) ?? []).filter((x) => t - x < 60_000);
  if (lista.length >= RATE_PER_MIN) { hits.set(ip, lista); return false; }
  lista.push(t);
  hits.set(ip, lista);
  if (hits.size > 5_000) {
    for (const [k, v] of hits) { if (v.every((x) => t - x > 60_000)) hits.delete(k); }
  }
  return true;
}

/* ── parser de select (columnas + embeds de un nivel) ──────────────────── */
type SelCol = { kind: 'col'; col: string };
type SelEmbed = { kind: 'embed'; alias: string; tabla: string; cols: string[] };
type SelItem = SelCol | SelEmbed;

function dividirTopNivel(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    if (ch === '(') { depth++; cur += ch; }
    else if (ch === ')') { depth--; cur += ch; }
    else if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function parseSelect(baseTable: string, select: string): SelItem[] {
  const items: SelItem[] = [];
  for (const token of dividirTopNivel(select)) {
    const mEmbed = /^([a-z_][a-z0-9_]*):([a-z_][a-z0-9_]*)\(([^()]*)\)$/i.exec(token);
    if (mEmbed) {
      const alias = mEmbed[1];
      const tabla = mEmbed[2];
      const colsRaw = mEmbed[3];
      const rel = EMBED_FK[`${baseTable}.${alias}`];
      if (!rel || rel.tabla !== tabla) throw new Error(`embed no permitido: ${baseTable}.${alias}:${tabla}`);
      const cols = colsRaw.split(',').map((c) => c.trim()).filter(Boolean);
      if (!cols.length || !cols.every((c) => IDENT_RE.test(c))) throw new Error('columnas de embed inválidas');
      items.push({ kind: 'embed', alias, tabla, cols });
      continue;
    }
    if (!IDENT_RE.test(token)) throw new Error(`columna inválida: ${token.slice(0, 40)}`);
    items.push({ kind: 'col', col: token });
  }
  return items;
}

/* ── builder de condiciones ────────────────────────────────────────────── */
class SqlBuilder {
  private vals: unknown[] = [];
  param(v: unknown): string {
    this.vals.push(v);
    return `$${this.vals.length}`;
  }
  get values(): unknown[] { return this.vals; }
}

type Op = (col: string, val: string, b: SqlBuilder) => string;

const OPS: Record<string, Op> = {
  eq: (c, v, b) => `${c} = ${b.param(v)}`,
  neq: (c, v, b) => `${c} <> ${b.param(v)}`,
  gt: (c, v, b) => `${c} > ${b.param(v)}`,
  gte: (c, v, b) => `${c} >= ${b.param(v)}`,
  lt: (c, v, b) => `${c} < ${b.param(v)}`,
  lte: (c, v, b) => `${c} <= ${b.param(v)}`,
  like: (c, v, b) => `${c} LIKE ${b.param(v)}`,
  ilike: (c, v, b) => `${c} ILIKE ${b.param(v)}`,
  is: (c, v) => {
    if (v === 'null') return `${c} IS NULL`;
    if (v === 'true') return `${c} IS TRUE`;
    if (v === 'false') return `${c} IS FALSE`;
    throw new Error(`is.{${v}} no soportado`);
  },
  in: (c, v, b) => {
    if (!/^\(.*\)$/.test(v)) throw new Error('in requiere (a,b,c)');
    const items = v.slice(1, -1).split(',').map((x) => x.trim()).filter((x) => x.length > 0);
    if (!items.length) return 'FALSE';
    if (items.length > 100) throw new Error('in demasiado grande');
    return `${c} = ANY(ARRAY[${items.map((x) => b.param(x)).join(',')}])`;
  },
};

function condicionPorClave(clave: string, op: string, val: string, b: SqlBuilder): string {
  // not.col=op.val → NOT (col op val)
  const mNot = /^not\.([a-z_][a-z0-9_]*)$/.exec(clave);
  if (mNot) {
    const fn = OPS[op];
    if (!fn) throw new Error(`operador no soportado: ${op}`);
    return `NOT (${fn(mNot[1], val, b)})`;
  }
  if (!IDENT_RE.test(clave)) throw new Error('columna de filtro inválida');
  const fn = OPS[op];
  if (!fn) throw new Error(`operador no soportado: ${op}`);
  return fn(clave, val, b);
}

// or=(username.ilike.%x%,display_name.ilike.%x%)
function parseOr(expr: string, b: SqlBuilder): string {
  const partes = dividirTopNivel(expr.replace(/^\(/, '').replace(/\)$/, ''));
  if (!partes.length || partes.length > 6) throw new Error('or() inválido');
  const conds = partes.map((p) => {
    const idx = p.indexOf('.');
    const idx2 = idx === -1 ? -1 : p.indexOf('.', idx + 1);
    if (idx === -1 || idx2 === -1) throw new Error('or() con formato inválido');
    const col = p.slice(0, idx);
    const op = p.slice(idx + 1, idx2);
    const val = p.slice(idx2 + 1);
    if (val.startsWith('(') && val.endsWith(')')) throw new Error('or() anidado no soportado');
    return condicionPorClave(col, op, val, b);
  });
  return `(${conds.join(' OR ')})`;
}

function stripSensible<T>(data: T): T {
  // T53 · los timestamptz llegan de pg como Date; serializarlos aquí a ISO
  // (si se recursara como objeto, Object.entries(Date)=[] los dejaba en {} —
  // bug real: todas las fechas pt_* llegaban vacías al navegador).
  if (data instanceof Date) return data.toISOString() as unknown as T;
  if (Array.isArray(data)) return data.map((r) => stripSensible(r)) as unknown as T;
  if (data && typeof data === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
      if (STRIP_COLS.has(k)) continue;
      out[k] = v && typeof v === 'object' ? stripSensible(v) : v;
    }
    return out as T;
  }
  return data;
}

/* ── handler ───────────────────────────────────────────────────────────── */
export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'GET') return json({ error: 'method_not_allowed' }, 405);

  if (new URL(req.url).search === '') {
    return json({ ok: true, version: VERSION });
  }

  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'desconocida';
  if (!dentroLimite(ip)) return json({ error: 'rate_limited' }, 429);

  let url: URL;
  try { url = new URL(req.url); } catch { return json({ error: 'bad_url' }, 400); }

  const tabla = url.searchParams.get('table') ?? '';
  if (!TABLES.has(tabla)) return json({ error: 'tabla no permitida o ausente' }, 400);

  try {
    const b = new SqlBuilder();

    // select: columnas + embeds permitidos
    let selectSql = '*';
    const selRaw = url.searchParams.get('select');
    let embeds: SelEmbed[] = [];
    if (selRaw) {
      const items = parseSelect(tabla, selRaw);
      const cols = items.filter((i) => i.kind === 'col').map((i) => (i as SelCol).col);
      embeds = items.filter((i) => i.kind === 'embed').map((i) => i as SelEmbed);
      const partes: string[] = [];
      if (cols.length) partes.push(cols.join(', '));
      for (const e of embeds) {
        const fkRel = EMBED_FK[`${tabla}.${e.alias}`];
        partes.push(
          `(SELECT COALESCE(json_agg(x.r), '[]'::json) FROM (SELECT ${e.cols.join(', ')} FROM ${e.tabla} WHERE ${e.tabla}.id = ${tabla}.${fkRel.fk}) x(r)) AS ${e.alias}`
        );
      }
      if (partes.length) selectSql = partes.join(', ');
    }

    const conds: string[] = [];
    for (const [clave, val] of url.searchParams.entries()) {
      if (['table', 'select', 'order', 'limit', 'offset', '_count'].includes(clave)) continue;
      if (clave === 'or') { conds.push(parseOr(val, b)); continue; }
      const idx = clave.indexOf('.');
      const idx2 = idx === -1 ? -1 : clave.indexOf('.', idx + 1);
      let colPart: string, op: string, realVal: string;
      if (idx2 !== -1) { colPart = clave.slice(0, idx2); op = clave.slice(idx2 + 1); realVal = val; }
      else if (idx !== -1) { colPart = clave.slice(0, idx); op = clave.slice(idx + 1); realVal = val; }
      else { colPart = clave; op = 'eq'; realVal = val; }
      conds.push(condicionPorClave(colPart, op, realVal, b));
    }
    const whereSql = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

    // order: col.asc|desc[.nullsfirst|.nullslast]
    let orderSql = '';
    const orderRaw = url.searchParams.get('order');
    if (orderRaw) {
      const partes = orderRaw.split('.').map((p) => p.trim());
      if (!IDENT_RE.test(partes[0] ?? '')) throw new Error('order inválido');
      const dir = partes[1] === 'desc' ? 'DESC' : partes[1] === 'asc' ? 'ASC' : '';
      const nulls = partes[2] === 'nullsfirst' ? ' NULLS FIRST' : partes[2] === 'nullslast' ? ' NULLS LAST' : '';
      orderSql = `ORDER BY ${partes[0]}${dir ? ' ' + dir : ''}${nulls}`;
    }

    const limitRaw = Number(url.searchParams.get('limit') ?? DEFAULT_LIMIT);
    const limit = Math.min(Math.max(1, Math.floor(limitRaw) || DEFAULT_LIMIT), MAX_LIMIT);
    const offsetRaw = Number(url.searchParams.get('offset') ?? 0);
    const offset = Math.min(Math.max(0, Math.floor(offsetRaw) || 0), 100_000);

    const sql = `SELECT ${selectSql} FROM ${tabla} ${whereSql} ${orderSql} LIMIT ${limit} OFFSET ${offset}`;
    const { rows } = await pool.query(sql, b.values);

    const extra: Record<string, string> = { 'Cache-Control': 'public, max-age=15' };
    if (url.searchParams.get('_count')) {
      const cSql = `SELECT COUNT(*)::int AS total FROM ${tabla} ${whereSql}`;
      const cr = await pool.query(cSql, b.values);
      const total = (cr.rows[0] as { total: number })?.total ?? 0;
      extra['Content-Range'] = `0-${Math.max(0, rows.length - 1)}/${total}`;
      extra['Content-Location'] = `/${tabla}`;
    }

    return json(stripSensible(rows), 200, extra);
  } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    const cliente = /inválida|inválido|no permitido|no soportado|requiere|demasiado/.test(msg);
    // Regla 10: el mensaje crudo de la BD (columnas/tablas internas) no sale en
    // la respuesta de un endpoint público — solo al log de la función.
    if (!cliente) console.error('vantsdata db_error:', msg.slice(0, 180));
    return json({ error: cliente ? msg : 'db_error' }, cliente ? 400 : 500);
  }
}
