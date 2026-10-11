// ============================================
// steam-login — Neon Function
// Login/vinculación con Steam vía OpenID 2.0
// Adaptada de Supabase Edge Function a Neon Function
// ============================================

import { Pool } from 'pg';

// --- Configuración ---
const STEAM_OPENID = 'https://steamcommunity.com/openid/login';
const OPENID_NS = 'http://specs.openid.net/auth/2.0';
const SELECTOR = 'http://specs.openid.net/auth/2.0/identifier_select';
const REQUIRED_SIGNED = ['op_endpoint', 'claimed_id', 'identity', 'return_to', 'response_nonce', 'assoc_handle'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const DEFAULT_REDIRECTS = [
  'https://feispla.github.io/Vants/',
  'https://vantsbetaa.pplx.app/',
  'https://vantsbeta.pplx.app/',
  'vants://auth/callback',
];
const ALLOWED = [
  ...DEFAULT_REDIRECTS,
  ...(process.env.STEAM_LOGIN_REDIRECTS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
];

// Auth0 Management API
const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN ?? 'vants.eu.auth0.com';
const AUTH0_CLIENT_ID = process.env.AUTH0_MGMT_CLIENT_ID ?? '';
const AUTH0_CLIENT_SECRET = process.env.AUTH0_MGMT_CLIENT_SECRET ?? '';

// Postgres (Neon)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 3,
  idleTimeoutMillis: 30_000,
});

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function allowedRedirect(raw: string | null): string | null {
  if (!raw || raw.length > 300) return null;
  let u: URL;
  try { u = new URL(raw); } catch { return null; }
  u.hash = '';
  const clean = u.toString();
  const base = `${u.protocol}//${u.host}${u.pathname}`;
  return ALLOWED.some((a) => a === base || a === clean) ? base : null;
}

function back(redirectTo: string, params: Record<string, string>): Response {
  const target = new URL(redirectTo);
  for (const [k, v] of Object.entries(params)) target.searchParams.set(k, v);
  return new Response(null, {
    status: 302,
    headers: { Location: target.toString(), 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' },
  });
}

// --- Auth0 Management API helpers ---
async function auth0Token(): Promise<string | null> {
  if (!AUTH0_CLIENT_ID || !AUTH0_CLIENT_SECRET) return null;
  try {
    const r = await fetch(`https://${AUTH0_DOMAIN}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: AUTH0_CLIENT_ID,
        client_secret: AUTH0_CLIENT_SECRET,
        audience: `https://${AUTH0_DOMAIN}/api/v2/`,
        grant_type: 'client_credentials',
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const d = await r.json();
    return d.access_token ?? null;
  } catch { return null; }
}

async function auth0CreateUser(token: string, email: string, name: string, steamId: string): Promise<string | null> {
  try {
    const r = await fetch(`https://${AUTH0_DOMAIN}/api/v2/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        connection: 'Username-Password-Authentication',
        email,
        password: crypto.randomUUID() + 'Aa1!',
        email_verified: true,
        user_metadata: { username: name, full_name: name, steam_id: steamId, provider_hint: 'steam' },
        app_metadata: { steam_id: steamId },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const d = await r.json();
    return d.user_id ?? null;
  } catch { return null; }
}

async function auth0MagicLink(token: string, userId: string): Promise<string | null> {
  try {
    const r = await fetch(`https://${AUTH0_DOMAIN}/api/v2/users/${encodeURIComponent(userId)}/recovery-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(10_000),
    });
    const d = await r.json();
    return d.recovery_code ?? null;
  } catch { return null; }
}

// --- Steam helpers ---
async function createState(redirectTo: string, userId: string | null): Promise<string | null> {
  await pool.query(`DELETE FROM steam_login_state WHERE expires_at < now()`);
  const { rows } = await pool.query(
    `INSERT INTO steam_login_state (redirect_to, user_id) VALUES ($1, $2) RETURNING state_id`,
    [redirectTo, userId]
  );
  return rows[0]?.state_id ?? null;
}

function steamUrl(state: string): string {
  const returnTo = new URL(process.env.FUNCTION_URL ?? 'https://placeholder.compute.us-east-2.aws.neon.tech/');
  returnTo.searchParams.set('state', state);
  const p = new URLSearchParams({
    'openid.ns': OPENID_NS,
    'openid.mode': 'checkid_setup',
    'openid.return_to': returnTo.toString(),
    'openid.realm': returnTo.origin + '/',
    'openid.identity': SELECTOR,
    'openid.claimed_id': SELECTOR,
  });
  return `${STEAM_OPENID}?${p.toString()}`;
}

async function verifyOpenId(url: URL, state: string): Promise<string | null> {
  const sp = url.searchParams;
  if (sp.get('openid.mode') !== 'id_res' || sp.get('openid.ns') !== OPENID_NS || sp.get('openid.op_endpoint') !== STEAM_OPENID) return null;
  const expected = new URL(process.env.FUNCTION_URL ?? 'https://placeholder.compute.us-east-2.aws.neon.tech/');
  expected.searchParams.set('state', state);
  if (sp.get('openid.return_to') !== expected.toString()) return null;
  const signed = new Set((sp.get('openid.signed') ?? '').split(','));
  if (REQUIRED_SIGNED.some((f) => !signed.has(f))) return null;
  const claimed = sp.get('openid.claimed_id') ?? '';
  const m = /^https:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/.exec(claimed);
  if (!m || sp.get('openid.identity') !== claimed) return null;
  const nonceTime = Date.parse((sp.get('openid.response_nonce') ?? '').slice(0, 20));
  if (!Number.isFinite(nonceTime) || nonceTime > Date.now() + 60_000 || nonceTime < Date.now() - 600_000) return null;

  const check = new URLSearchParams();
  for (const [k, v] of sp.entries()) {
    if (!k.startsWith('openid.')) continue;
    if (sp.getAll(k).length !== 1) return null;
    check.set(k, v);
  }
  check.set('openid.mode', 'check_authentication');
  try {
    const r = await fetch(STEAM_OPENID, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: check,
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok || !/^is_valid:true\s*$/m.test(await r.text())) return null;
  } catch { return null; }
  return m[1];
}

type SteamSummary = { personaname?: string; avatarfull?: string; profileurl?: string; loccountrycode?: string };
async function steamSummary(steamId: string): Promise<SteamSummary> {
  const key = process.env.STEAM_WEB_API_KEY;
  if (!key) return {};
  try {
    const u = new URL('https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/');
    u.searchParams.set('key', key);
    u.searchParams.set('steamids', steamId);
    const r = await fetch(u, { signal: AbortSignal.timeout(10_000) });
    const p = (await r.json())?.response?.players?.[0];
    return p && p.steamid === steamId ? p : {};
  } catch { return {}; }
}

async function upsertSteamAccount(userId: string, steamId: string, s: SteamSummary) {
  const now = new Date().toISOString();
  await pool.query(
    `INSERT INTO user_game_accounts (user_id, game, handle, display_name, avatar_url, profile_url, country, verified, verified_at, updated_at)
     VALUES ($1, 'steam', $2, $3, $4, $5, $6, true, $7, $7)
     ON CONFLICT (user_id, game) DO UPDATE SET
       handle = EXCLUDED.handle, display_name = EXCLUDED.display_name,
       avatar_url = EXCLUDED.avatar_url, profile_url = EXCLUDED.profile_url,
       country = EXCLUDED.country, verified = true, verified_at = EXCLUDED.verified_at, updated_at = EXCLUDED.updated_at`,
    [userId, steamId, s.personaname ?? null, s.avatarfull ?? null, s.profileurl ?? null, s.loccountrycode ?? null, now]
  );
}

// --- Callback handler ---
async function handleCallback(url: URL): Promise<Response> {
  const state = url.searchParams.get('state') ?? '';
  if (!UUID_RE.test(state)) return new Response('Estado inválido', { status: 400 });

  const { rows } = await pool.query(
    `DELETE FROM steam_login_state WHERE state_id = $1 AND expires_at > now() RETURNING redirect_to, user_id`,
    [state]
  );
  const row = rows[0];
  if (!row?.redirect_to || !allowedRedirect(row.redirect_to)) {
    return new Response('Sesión de Steam caducada. Vuelve a intentarlo.', { status: 400 });
  }
  const redirectTo = row.redirect_to as string;

  if (url.searchParams.get('openid.mode') === 'cancel') return back(redirectTo, { steam_error: 'cancelled' });
  const steamId = await verifyOpenId(url, state);
  if (!steamId) return back(redirectTo, { steam_error: 'verification_failed' });
  const summary = await steamSummary(steamId);

  // ---- Modo vincular (usuario ya autenticado con Auth0) ----
  if (row.user_id) {
    try {
      await upsertSteamAccount(row.user_id as string, steamId, summary);
      return back(redirectTo, { steam_linked: '1' });
    } catch (e: any) {
      return back(redirectTo, { steam_error: e?.code === '23505' ? 'already_linked' : 'link_failed' });
    }
  }

  // ---- Modo login ----
  const { rows: acctRows } = await pool.query(
    `SELECT user_id FROM user_game_accounts WHERE game = 'steam' AND handle = $1 AND verified = true LIMIT 1`,
    [steamId]
  );
  let userId = acctRows[0]?.user_id as string | undefined;
  let email: string | undefined;

  if (userId) {
    const token = await auth0Token();
    if (!token) return back(redirectTo, { steam_error: 'login_failed' });
    try {
      const r = await fetch(`https://${AUTH0_DOMAIN}/api/v2/users/${encodeURIComponent(userId)}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10_000),
      });
      const u = await r.json();
      email = u.email ?? undefined;
    } catch { return back(redirectTo, { steam_error: 'login_failed' }); }
  } else {
    const token = await auth0Token();
    if (!token) return back(redirectTo, { steam_error: 'account_create_failed' });
    email = `steam_${steamId}@steam.vants.invalid`;
    const name = (summary.personaname ?? '').trim().slice(0, 32) || `steam${steamId.slice(-6)}`;
    userId = await auth0CreateUser(token, email, name, steamId);
    if (!userId) return back(redirectTo, { steam_error: 'account_create_failed' });
    try {
      await upsertSteamAccount(userId, steamId, summary);
    } catch { return back(redirectTo, { steam_error: 'link_failed' }); }
  }
  if (!email) return back(redirectTo, { steam_error: 'login_failed' });

  const token2 = await auth0Token();
  if (!token2) return back(redirectTo, { steam_error: 'login_failed' });
  const recoveryCode = await auth0MagicLink(token2, userId!);
  if (!recoveryCode) return back(redirectTo, { steam_error: 'login_failed' });

  return back(redirectTo, { steam_token: recoveryCode, steam_type: 'recovery_code' });
}

// --- Main handler ---
export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const url = new URL(req.url);
  const fnUrl = url.origin + url.pathname;
  process.env.FUNCTION_URL = fnUrl;

  try {
    if (req.method === 'GET' && url.searchParams.has('state')) return await handleCallback(url);

    if (req.method === 'GET') {
      const redirectTo = allowedRedirect(url.searchParams.get('redirect_to'));
      if (!redirectTo) return new Response('redirect_to no permitido', { status: 400 });
      const state = await createState(redirectTo, null);
      if (!state) return back(redirectTo, { steam_error: 'start_failed' });
      return new Response(null, { status: 302, headers: { Location: steamUrl(state), 'Cache-Control': 'no-store' } });
    }

    if (req.method === 'POST') {
      const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
      if (!jwt) return json({ error: 'unauthorized' }, 401);
      const payload = JSON.parse(atob(jwt.split('.')[1] ?? ''));
      const userId = payload?.sub;
      if (!userId) return json({ error: 'unauthorized' }, 401);

      const body = await req.json().catch(() => ({}));
      const redirectTo = allowedRedirect(typeof body?.redirect_to === 'string' ? body.redirect_to : null);
      if (!redirectTo) return json({ error: 'redirect_not_allowed' }, 400);
      const state = await createState(redirectTo, userId);
      if (!state) return json({ error: 'start_failed' }, 500);
      return json({ login_url: steamUrl(state), expires_in: 600 });
    }

    return json({ error: 'method_not_allowed' }, 405);
  } catch (e) {
    console.error('steam-login error:', e);
    return json({ error: 'internal_error' }, 500);
  }
}
