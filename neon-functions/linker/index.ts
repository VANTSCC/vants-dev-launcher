// ============================================
// linker — Neon Function
// Conectores de cuentas VANTS: OAuth real por plataforma.
//   POST /api/link/start    { platform, return_to }  (Bearer JWT Auth0) -> { url }
//   GET  /api/link/callback ?code&state  (o OpenID 2.0 de Steam)       -> 302 return_to?linked=plataforma
//   GET  /                  -> diagnostico: que claves faltan por plataforma
// Guarda el vinculo verificado en vants_links (sub de Auth0 = identidad).
// Claves por plataforma en las variables de entorno de esta funcion (nunca en git).
// ============================================

import { Pool } from 'pg';
import crypto from 'node:crypto';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 3,
  idleTimeoutMillis: 30_000,
});

const AUTH0_DOMAIN = (process.env.AUTH0_DOMAIN ?? 'vants.eu.auth0.com').replace(/^https?:\/\//, '');
const AUTH0_AUDIENCE = process.env.AUTH0_AUDIENCE ?? '';
const APP_URL = (process.env.VANTS_SITE_URL ?? 'https://feispla.github.io/Vants').replace(/\/$/, '');
const LOCAL_URL = 'http://localhost:8788';
// URL publica de esta funcion (para redirect_uri). Neon la muestra al crearla; se pega aqui.
const URL_API = (process.env.LINKER_URL ?? '').replace(/\/$/, '');

const subt = (globalThis.crypto && globalThis.crypto.subtle) || crypto.webcrypto.subtle;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

// ------------------------------------------------------------
// Catalogo de plataformas. Cada una declara sus variables de entorno:
// si faltan, /start responde exactamente cual hay que cargar en Neon.
// ------------------------------------------------------------
type Perfil = { handle: string; platform_user_id: string; avatar_url: string | null };
type Plataforma = {
  authorize: string;
  token: string;
  scope: string;
  clientIdEnv: string;
  secretEnv: string;
  clientKeyParam?: 'client_id' | 'client_key';
  pkce?: boolean;
  basicAuth?: boolean;
  secretOptional?: boolean;
  nota?: string;
  perfil: (accessToken: string) => Promise<Perfil>;
};

const j = async (r: Response) => { try { return await r.json(); } catch { return null; } };

const PLATAFORMAS: Record<string, Plataforma> = {
  twitch: {
    authorize: 'https://id.twitch.tv/oauth2/authorize',
    token: 'https://id.twitch.tv/oauth2/token',
    scope: 'user:read:email',
    clientIdEnv: 'TWITCH_CLIENT_ID', secretEnv: 'TWITCH_CLIENT_SECRET', pkce: true,
    perfil: async (t) => {
      const cid = process.env.TWITCH_CLIENT_ID ?? '';
      const r = await fetch('https://api.twitch.tv/helix/users', { headers: { Authorization: 'Bearer ' + t, 'Client-Id': cid } });
      const d = await j(r);
      const u = d?.data?.[0];
      if (!u) throw new Error('perfil_twitch');
      return { handle: u.login, platform_user_id: u.id, avatar_url: u.profile_image_url ?? null };
    },
  },
  kick: {
    authorize: 'https://id.kick.com/oauth/authorize',
    token: 'https://id.kick.com/oauth/token',
    scope: 'user:read',
    clientIdEnv: 'KICK_CLIENT_ID', secretEnv: 'KICK_CLIENT_SECRET', pkce: true,
    nota: 'Kick exige registrar la app y aprobarla en kick.com/developers',
    perfil: async (t) => {
      const r = await fetch('https://api.kick.com/public/v1/users', { headers: { Authorization: 'Bearer ' + t, Accept: 'application/json' } });
      const d = await j(r);
      const u = d?.data?.[0];
      if (!u) throw new Error('perfil_kick');
      return { handle: u.username, platform_user_id: String(u.id ?? ''), avatar_url: u.profile_picture ?? null };
    },
  },
  youtube: {
    authorize: 'https://accounts.google.com/o/oauth2/v2/auth',
    token: 'https://oauth2.googleapis.com/token',
    scope: 'https://www.googleapis.com/auth/youtube.readonly',
    clientIdEnv: 'GOOGLE_CLIENT_ID', secretEnv: 'GOOGLE_CLIENT_SECRET', pkce: true,
    nota: 'Cliente OAuth de Google Cloud con YouTube Data API v3 habilitada',
    perfil: async (t) => {
      const r = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', { headers: { Authorization: 'Bearer ' + t } });
      const d = await j(r);
      const u = d?.items?.[0];
      if (!u) throw new Error('perfil_youtube');
      return { handle: u.snippet?.customUrl || u.snippet?.title, platform_user_id: u.id, avatar_url: u.snippet?.thumbnails?.default?.url ?? null };
    },
  },
  tiktok: {
    authorize: 'https://www.tiktok.com/v2/auth/authorize/',
    token: 'https://open.tiktokapis.com/v2/oauth/token/',
    scope: 'user.info.basic',
    clientIdEnv: 'TIKTOK_CLIENT_KEY', secretEnv: 'TIKTOK_CLIENT_SECRET', clientKeyParam: 'client_key',
    nota: 'TikTok usa client_key (no client_id) en el portal de developers',
    perfil: async (t) => {
      const r = await fetch('https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url', { headers: { Authorization: 'Bearer ' + t } });
      const d = await j(r);
      const u = d?.data?.user;
      if (!u) throw new Error('perfil_tiktok');
      return { handle: u.display_name || u.open_id, platform_user_id: u.open_id, avatar_url: u.avatar_url ?? null };
    },
  },
  x: {
    authorize: 'https://twitter.com/i/oauth2/authorize',
    token: 'https://api.twitter.com/2/oauth2/token',
    scope: 'users.read tweet.read',
    clientIdEnv: 'X_CLIENT_ID', secretEnv: 'X_CLIENT_SECRET', pkce: true, basicAuth: true,
    nota: 'X exige OAuth 2.0 con PKCE (Developer Portal -> User authentication settings)',
    perfil: async (t) => {
      const r = await fetch('https://api.twitter.com/2/users/me', { headers: { Authorization: 'Bearer ' + t } });
      const d = await j(r);
      const u = d?.data;
      if (!u) throw new Error('perfil_x');
      return { handle: u.username, platform_user_id: u.id, avatar_url: u.profile_image_url ?? null };
    },
  },
  riot: {
    authorize: 'https://auth.riotgames.com/authorize',
    token: 'https://auth.riotgames.com/token',
    scope: 'openid',
    clientIdEnv: 'RIOT_CLIENT_ID', secretEnv: 'RIOT_CLIENT_SECRET', pkce: true, basicAuth: true,
    nota: 'Riot RSO: las apps generales obtienen el puuid; el Nick#TAG llega cuando Riot afilia la app',
    perfil: async (t) => {
      const r = await fetch('https://auth.riotgames.com/userinfo', { headers: { Authorization: 'Bearer ' + t } });
      const d = await j(r);
      if (!d?.sub) throw new Error('perfil_riot');
      const nick = d.gameName && d.tagLine ? d.gameName + '#' + d.tagLine : String(d.sub).slice(0, 8);
      return { handle: nick, platform_user_id: d.sub, avatar_url: null };
    },
  },
  faceit: {
    authorize: 'https://accounts.faceit.com/accounts/authorize',
    token: 'https://api.faceit.com/auth/v1/oauth/token',
    scope: 'openid email profile',
    clientIdEnv: 'FACEIT_CLIENT_ID', secretEnv: 'FACEIT_CLIENT_SECRET',
    pkce: true, secretOptional: true,
    nota: 'FACEIT: app "Authorization Code with PKCE" en faceit.com/developers — la app pública no lleva client_secret; registrar LINKER_URL+/api/link/callback como redirect_uri',
    perfil: async (t) => {
      const r = await fetch('https://api.faceit.com/auth/v1/resources/userinfo', { headers: { Authorization: 'Bearer ' + t } });
      const d = await j(r);
      if (!d?.guid) throw new Error('perfil_faceit');
      return { handle: d.nickname, platform_user_id: d.guid, avatar_url: d.picture ?? null };
    },
  },
};

const STEAM_OPENID = 'https://steamcommunity.com/openid/login';
const PLATAFORMA_IDS = Object.keys(PLATAFORMAS).concat(['steam']);

function claves(plat: string): { ok: boolean; env?: string; nota?: string } {
  const p = PLATAFORMAS[plat];
  if (!p) return plat === 'steam' ? { ok: true } : { ok: false, env: '(desconocida)' };
  if (!process.env[p.clientIdEnv]) return { ok: false, env: p.clientIdEnv, nota: p.nota };
  // PKCE público (p. ej. FACEIT): el client_secret no existe y no hace falta.
  if (!p.secretOptional && !process.env[p.secretEnv]) return { ok: false, env: p.secretEnv, nota: p.nota };
  return { ok: true };
}

// ------------------------------------------------------------
// JWT de Auth0: firma RS256 contra el JWKS del tenant
// ------------------------------------------------------------
let jwksCache: { keys: Record<string, unknown>[]; t: number } | null = null;
async function jwks(): Promise<Record<string, unknown>[]> {
  if (jwksCache && Date.now() - jwksCache.t < 3600_000) return jwksCache.keys;
  const r = await fetch('https://' + AUTH0_DOMAIN + '/.well-known/jwks.json');
  const d = await j(r);
  if (!d?.keys) throw new Error('jwks');
  jwksCache = { keys: d.keys, t: Date.now() };
  return d.keys;
}

const b64u = (s: string) => Buffer.from(s, 'base64url').toString('utf8');

async function validarJWT(token: string): Promise<string> {
  const partes = token.split('.');
  if (partes.length !== 3) throw new Error('jwt_malo');
  const cab = JSON.parse(b64u(partes[0]));
  const cuerpo = JSON.parse(b64u(partes[1]));
  const llave = (await jwks()).find((k) => String((k as { kid?: string }).kid) === String(cab.kid));
  if (!llave) throw new Error('jwt_kid');
  const pub = await subt.importKey(
    'jwk',
    llave as unknown as JsonWebKey,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  );
  const data = new TextEncoder().encode(partes[0] + '.' + partes[1]);
  const sig = Buffer.from(partes[2], 'base64url');
  const ok = await subt.verify('RSASSA-PKCS1-v1_5', pub, sig, data);
  if (!ok) throw new Error('jwt_firma');
  if (cuerpo.iss !== 'https://' + AUTH0_DOMAIN + '/') throw new Error('jwt_iss');
  if (cuerpo.exp && cuerpo.exp * 1000 < Date.now()) throw new Error('jwt_exp');
  if (AUTH0_AUDIENCE && cuerpo.aud) {
    const auds = Array.isArray(cuerpo.aud) ? cuerpo.aud : [cuerpo.aud];
    // access token -> audience de la API · id token -> client id
    const valeApi = auds.includes(AUTH0_AUDIENCE);
    const valeId = process.env.AUTH0_CLIENT_ID ? auds.includes(process.env.AUTH0_CLIENT_ID) : false;
    if (!valeApi && !valeId) throw new Error('jwt_aud');
  }
  return String(cuerpo.sub);
}

// ------------------------------------------------------------
// Utilidades OAuth
// ------------------------------------------------------------
const rand = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');
const s256 = (v: string) => crypto.createHash('sha256').update(v).digest('base64url');

function retornoSeguro(return_to: string): string {
  if (!return_to) return APP_URL + '/';
  try {
    const u = new URL(return_to);
    if (u.origin === APP_URL || u.origin === LOCAL_URL) return u.origin + u.pathname;
  } catch { /* invalida */ }
  return APP_URL + '/';
}

function redirigir(url: string) {
  return new Response(null, { status: 302, headers: { Location: url } });
}

async function subDeState(state: string) {
  const { rows } = await pool.query(
    'DELETE FROM vants_link_states WHERE state = $1 RETURNING auth0_sub, platform, return_to, code_verifier, created_at',
    [state]
  );
  const s = rows[0];
  if (!s) return null;
  if (Date.now() - new Date(s.created_at).getTime() > 15 * 60_000) return null;
  return s;
}

async function guardarVinculo(sub: string, plataforma: string, p: Perfil, playerId: string | null) {
  await pool.query(
    `INSERT INTO vants_links (auth0_sub, player_id, platform, handle, platform_user_id, avatar_url, verified, connected_at)
     VALUES ($1, $2, $3, $4, $5, $6, true, now())
     ON CONFLICT (auth0_sub, platform) DO UPDATE
       SET handle = EXCLUDED.handle, platform_user_id = EXCLUDED.platform_user_id,
           avatar_url = EXCLUDED.avatar_url, verified = true, connected_at = now()`,
    [sub, playerId, plataforma, p.handle, p.platform_user_id, p.avatar_url]
  );
}

async function playerIdDeSub(sub: string): Promise<string | null> {
  try {
    const { rows } = await pool.query('SELECT id FROM players WHERE auth0_sub = $1 LIMIT 1', [sub]);
    return rows[0]?.id ?? null;
  } catch {
    return null; // si players no tiene columna auth0_sub, queda NULL y la fila igual sirve
  }
}

async function exchange(plat: Plataforma, plataforma: string, code: string, verifier: string | null): Promise<string> {
  const secreto = process.env[plat.secretEnv] ?? '';
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: URL_API + '/api/link/callback',
    [plat.clientKeyParam ?? 'client_id']: process.env[plat.clientIdEnv] ?? '',
  });
  if (secreto) body.set('client_secret', secreto);
  if (verifier) body.set('code_verifier', verifier);
  const r = await fetch(plat.token, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
      // Basic solo cuando la plataforma lo exige Y hay secreto (clientes públicos: nunca).
      ...(plat.basicAuth && secreto
        ? { Authorization: 'Basic ' + Buffer.from((process.env[plat.clientIdEnv] ?? '') + ':' + secreto).toString('base64') }
        : {}),
    },
    body,
  });
  const d = await j(r);
  if (!d?.access_token) throw new Error('intercambio_' + plataforma + (d?.error ? ':' + d.error : ''));
  return d.access_token as string;
}

// Steam: OpenID 2.0 clasico (sin claves de cliente; la API key es opcional, solo enriquece el nick)
function steamIniciar(state: string): string {
  const q = new URLSearchParams({
    'openid.ns': 'http://specs.openid.net/auth/2.0',
    'openid.mode': 'checkid_setup',
    'openid.return_to': URL_API + '/api/link/callback?state=' + encodeURIComponent(state),
    'openid.realm': APP_URL,
    'openid.identity': 'http://specs.openid.net/auth/2.0/identifier_select',
    'openid.claimed_id': 'http://specs.openid.net/auth/2.0/identifier_select',
  });
  return STEAM_OPENID + '?' + q.toString();
}

async function steamVerificar(params: URLSearchParams): Promise<string> {
  const q = new URLSearchParams();
  params.forEach((v, k) => { if (k.startsWith('openid.')) q.set(k, v); });
  q.set('openid.mode', 'check_authentication');
  const r = await fetch(STEAM_OPENID, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: q });
  const txt = await r.text();
  if (!/is_valid\s*:\s*true/i.test(txt)) throw new Error('steam_verify');
  const id = params.get('openid.claimed_id') || '';
  const m = id.match(/\/id\/(\d+)$/) || id.match(/\/profiles\/(\d+)$/);
  if (!m) throw new Error('steam_id');
  return m[1];
}

async function steamPerfil(steamid: string): Promise<Perfil> {
  const key = process.env.STEAM_API_KEY;
  if (!key) return { handle: 'STEAM:' + steamid.slice(-6), platform_user_id: steamid, avatar_url: null };
  try {
    const r = await fetch('https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=' + key + '&steamids=' + steamid);
    const d = await j(r);
    const u = d?.response?.players?.[0];
    return { handle: u?.personaname || 'STEAM:' + steamid.slice(-6), platform_user_id: steamid, avatar_url: u?.avatarfull ?? null };
  } catch {
    return { handle: 'STEAM:' + steamid.slice(-6), platform_user_id: steamid, avatar_url: null };
  }
}

// ------------------------------------------------------------
// Handler
// ------------------------------------------------------------
export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const ruta = url.pathname.replace(/\/$/, '');

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

  // Diagnostico: que claves hay / faltan (abrir la URL de la funcion en el navegador)
  if (ruta === '' || ruta === '/') {
    const estado: Record<string, string> = {};
    for (const p of PLATAFORMA_IDS) {
      const c = claves(p);
      estado[p] = c.ok ? 'ok' : 'falta ' + c.env + (c.nota ? ' — ' + c.nota : '');
    }
    estado._linker_url = URL_API ? 'ok' : 'falta LINKER_URL (la URL publica de esta funcion, para redirect_uri)';
    estado._tabla = 'vants_links';
    return json({ ok: true, function: 'linker', plataformas: estado });
  }

  // ---- inicio del flujo: la web pide el salto a la plataforma ----
  if (ruta === '/api/link/start' && req.method === 'POST') {
    try {
      const auth = req.headers.get('authorization') ?? '';
      if (!auth.startsWith('Bearer ')) return json({ error: 'sin_sesion' }, 401);
      const sub = await validarJWT(auth.slice(7));
      const body = await req.json().catch(() => ({}));
      const plataforma = String(body?.platform ?? '');
      if (!PLATAFORMA_IDS.includes(plataforma)) return json({ error: 'plataforma_desconocida' }, 400);
      const c = claves(plataforma);
      if (!c.ok) return json({ error: 'falta_clave', env: c.env, plataforma, nota: c.nota ?? null }, 400);
      if (!URL_API) return json({ error: 'falta_linker_url', detalle: 'Carga LINKER_URL con la URL publica de esta funcion' }, 500);

      const return_to = retornoSeguro(String(body?.return_to ?? ''));
      const state = rand(32);
      const verifier = PLATAFORMAS[plataforma]?.pkce ? rand(48) : null;
      await pool.query(
        'INSERT INTO vants_link_states (state, auth0_sub, platform, return_to, code_verifier) VALUES ($1,$2,$3,$4,$5)',
        [state, sub, plataforma, return_to, verifier]
      );

      let urlAutorizacion: string;
      if (plataforma === 'steam') {
        urlAutorizacion = steamIniciar(state);
      } else {
        const p = PLATAFORMAS[plataforma];
        const q = new URLSearchParams({
          response_type: 'code',
          [p.clientKeyParam === 'client_key' ? 'client_key' : 'client_id']: process.env[p.clientIdEnv] ?? '',
          redirect_uri: URL_API + '/api/link/callback',
          scope: p.scope,
          state,
        });
        if (verifier) { q.set('code_challenge', s256(verifier)); q.set('code_challenge_method', 'S256'); }
        urlAutorizacion = p.authorize + '?' + q.toString();
      }
      return json({ url: urlAutorizacion });
    } catch (e) {
      return json({ error: 'start_fallo', detalle: String((e as Error).message ?? e) }, 500);
    }
  }

  // ---- vuelta de la plataforma ----
  if (ruta === '/api/link/callback') {
    const state = url.searchParams.get('state') ?? url.searchParams.get('openid.state') ?? '';
    const s = state ? await subDeState(state) : null;
    if (!s) return redirigir(APP_URL + '/?linkerr=state_invalido');
    try {
      let perfil: Perfil;
      if (s.platform === 'steam') {
        const steamid = await steamVerificar(url.searchParams);
        perfil = await steamPerfil(steamid);
      } else {
        const code = url.searchParams.get('code');
        if (!code) throw new Error('sin_code');
        const token = await exchange(PLATAFORMAS[s.platform], s.platform, code, s.code_verifier);
        perfil = await PLATAFORMAS[s.platform].perfil(token);
      }
      await guardarVinculo(s.auth0_sub, s.platform, perfil, await playerIdDeSub(s.auth0_sub));
      return redirigir(s.return_to + '?linked=' + s.platform);
    } catch (e) {
      return redirigir(s.return_to + '?linkerr=' + encodeURIComponent(String((e as Error).message ?? e)));
    }
  }

  return json({ error: 'ruta_desconocida', ruta }, 404);
}
