// ============================================
// supervisor — Neon Function (collector del Vants Supervisor Bot v1.0)
// Recibe eventos de telemetría de la web VANTS (errores JS, fallos de red,
// pageviews y logins de la portada y del panel admin) y los guarda en la
// tabla web_events. El bot de Discord (bot/supervisor.py) los entrega después
// como embeds al DM del dueño.
//
// Autenticación de ingesta (proporcional a telemetría pública de SPA):
//   · cabecera X-Vants-Supervisor: web  (marca del SDK oficial)
//   · Origin permitido (https://feispla.github.io)
//   · rate limit por IP (best-effort, en memoria por instancia)
//   · esquema estricto + solo INSERT (nunca lee datos sensibles)
// Fase 2 del diseño: dedupe con KV store, firma HMAC y cola persistente.
// ============================================

import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 3,
  idleTimeoutMillis: 30_000,
});

const ALLOWED_ORIGINS = ['https://feispla.github.io'];
const MARKER = 'web';
const RATE_PER_MIN = Number(process.env.SUPERVISOR_RATE_PER_MIN ?? 120);
const MAX_BATCH = 25;
const VERSION = 'supervisor-collector-1';

const KINDS = new Set(['LOGIN_OK', 'LOGIN_FAILED', 'JS_ERROR', 'NETWORK_ERROR', 'PAGE_VIEW']);
const PAGES = new Set(['arena', 'panel']);
const SEVERITY: Record<string, string> = {
  LOGIN_OK: 'info',
  PAGE_VIEW: 'info',
  LOGIN_FAILED: 'warn',
  JS_ERROR: 'error',
  NETWORK_ERROR: 'error',
};

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-vants-supervisor',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

/* ── rate limit en memoria (por instancia) ─────────────────────────────── */
const hits = new Map<string, number[]>();

function dentroLimite(ip: string): boolean {
  const t = Date.now();
  const lista = (hits.get(ip) ?? []).filter((x) => t - x < 60_000);
  if (lista.length >= RATE_PER_MIN) {
    hits.set(ip, lista);
    return false;
  }
  lista.push(t);
  hits.set(ip, lista);
  if (hits.size > 5_000) {
    for (const [k, v] of hits) {
      if (v.every((x) => t - x > 60_000)) hits.delete(k);
    }
  }
  return true;
}

/* ── validación estricta de un evento ──────────────────────────────────── */
type Raw = Record<string, unknown>;

const str = (v: unknown, max: number): string => String(v ?? '').slice(0, max);
const idOk = (v: unknown): boolean => /^[A-Za-z0-9_]{6,40}$/.test(String(v ?? ''));

function saneaData(d: unknown): Record<string, string | number | boolean | null> {
  const out: Record<string, string | number | boolean | null> = {};
  if (!d || typeof d !== 'object') return out;
  for (const [k, v] of Object.entries(d as Raw)) {
    if (!k || k.length > 40 || Object.keys(out).length >= 15) break;
    if (v == null) { out[k] = null; continue; }
    if (typeof v === 'number' && Number.isFinite(v)) { out[k] = v; continue; }
    if (typeof v === 'boolean') { out[k] = v; continue; }
    out[k] = str(v, 300);
  }
  return out;
}

function valida(r: Raw): { ok: true; row: unknown[] } | { ok: false } {
  if (!r || typeof r !== 'object') return { ok: false };
  const kind = str(r.kind, 40);
  const page = str(r.page, 10);
  if (!KINDS.has(kind) || !PAGES.has(page) || !idOk(r.event_id)) return { ok: false };
  const data = saneaData(r.data);
  if (JSON.stringify(data).length > 2_048) return { ok: false };
  const row = [
    str(r.event_id, 40),
    kind,
    SEVERITY[kind] ?? 'info',
    page,
    str(r.session_id, 40) || null,
    str(r.url, 300) || null,
    str(r.referrer, 200) || null,
    data,
  ];
  return { ok: true, row };
}

/* ── handler ───────────────────────────────────────────────────────────── */
export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  if (req.method === 'GET') {
    return json({ ok: true, version: VERSION, bot: 'busca eventos pendientes en web_events' });
  }

  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const origin = req.headers.get('origin') ?? '';
  if (origin && !ALLOWED_ORIGINS.some((o) => origin === o || origin.startsWith(o + '/'))) {
    return json({ error: 'forbidden_origin' }, 403);
  }

  const marker = str(req.headers.get('x-vants-supervisor'), 20);
  if (marker !== MARKER) return json({ error: 'unauthorized' }, 401);

  const ip = str(req.headers.get('x-forwarded-for'), 60).split(',')[0].trim() || 'desconocida';
  if (!dentroLimite(ip)) return json({ error: 'rate_limited' }, 429);

  let body: Raw;
  try {
    const text = await req.text();
    if (text.length > 64_000) return json({ error: 'payload_too_large' }, 413);
    body = JSON.parse(text) as Raw;
  } catch {
    return json({ error: 'bad_json' }, 400);
  }

  const eventos = Array.isArray(body?.events) ? (body.events as Raw[]) : [];
  if (!eventos.length || eventos.length > MAX_BATCH) return json({ error: 'bad_batch' }, 400);

  let guardados = 0;
  const rechazados: string[] = [];

  for (const ev of eventos.slice(0, MAX_BATCH)) {
    const v = valida(ev);
    if (!v.ok) { rechazados.push(str((ev as Raw)?.kind, 40) || 'invalido'); continue; }
    try {
      const res = await pool.query(
        `INSERT INTO web_events (event_id, kind, severity, page, session_id, url, referrer, ip, user_agent, payload)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
         ON CONFLICT (event_id) DO NOTHING`,
        [...(v as { ok: true; row: unknown[] }).row, ip, str(req.headers.get('user-agent'), 200) || null, JSON.stringify((v as { ok: true; row: unknown[] }).row[7])]
      );
      guardados += res.rowCount ?? 0;
    } catch (e) {
      return json({ error: 'db_error', detalle: String(e).slice(0, 200) }, 500);
    }
  }

  return json({ ok: true, recibidos: eventos.length, guardados, rechazados });
}
