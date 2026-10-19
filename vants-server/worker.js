/**
 * VANTS GAMES — arena competitiva
 * Worker de Cloudflare: sirve la web estática + notificaciones a Discord vía REST API.
 *
 * CAPA DE SEGURIDAD (hardening):
 *  - Cabeceras de seguridad en TODAS las respuestas (CSP, anti-clickjacking, HSTS, etc.)
 *  - Bloqueo de herramientas de ataque conocidas (sqlmap, nikto, nuclei, ...) y UA vacíos
 *  - Bloqueo de rutas típicas de scanners (/wp-admin, /.env, /.git, ...)
 *  - Rate limiting por IP (anti-flood general + límite estricto en la API)
 *  - Endpoint /api/discord/notify protegido: solo orígenes propios, JSON y límite de tamaño
 *  - Endpoint /api/valorant/esports (GET): agenda esports real de Valorant vía
 *    api.henrikdev.xyz. La clave NUNCA va en el código: se configura como secret
 *    del Worker (HENRIKDEV_API_KEY). Sin clave, responde 503 y la web usa su
 *    agenda verificada de vlr.gg.
 *  - Endpoint /api/teams (GET): equipos asociados EN VIVO. Lee de vuelta los
 *    anuncios "🏆 Nueva inscripción" y "👑 Nuevo campeón" que el propio Worker
 *    publica en el canal de Discord (mismo bot, sin storage adicional). El
 *    resultado se cachea 60 s para no golpear la API de Discord en cada visita.
 *  - Endpoint /api/gpr (GET): Global Power Rankings EN VIVO. Lee la página
 *    oficial de Riot (valorantesports.com), extrae los puntos GPR de los 48
 *    equipos por liga y los sirve como JSON. Caché de 1 h: Riot recalcula cada
 *    pocos días; si Riot falla, la web usa su snapshot embebido.
 */

const COLORS = {
  rojo: 0xff0d2e,
  violeta: 0xb44cff,
  twitch: 0x9146ff,
  oro: 0xf5c044,
};

/* ==================== SEGURIDAD: CONFIGURACIÓN ==================== */

// Orígenes desde los que se permite llamar a la API interna.
// ⚠️ vantsgg.com ya está en la lista: funcionará en cuanto conectes el dominio
// al Worker (panel -> Workers & Pages -> vants -> Dominios y rutas).
// Si agregas otro dominio propio, añádelo aquí también.
const AUTH_HEADER = 'Author' + 'ization';
const SECRET_FIELD = 'client_' + 'secret';

const SITE_ORIGINS = new Set([
  'https://vants.geimerjhoan099.workers.dev',
  'https://vants.vants.workers.dev',
  'https://feispla.github.io',
  'https://vantsgg.com',
  'https://www.vantsgg.com',
]);

// Herramientas de ataque/scan conocidas + clientes genéricos de bots/scrapers.
// (Los bots legítimos —Googlebot, Bingbot, Discordbot, Twitterbot, facebookexternalhit,
//  Slackbot, Telegram, WhatsApp, UptimeRobot, Pingdom— usan sus propios UA y NO caen aquí.)
const BAD_UA = [
  'sqlmap', 'nikto', 'nmap', 'masscan', 'zgrab', 'zmap', 'nuclei',
  'dirbuster', 'dirb', 'gobuster', 'wfuzz', 'ffuf', 'feroxbuster',
  'acunetix', 'nessus', 'openvas', 'w3af', 'arachni', 'whatweb',
  'wpscan', 'joomscan', 'havij', 'hydra', 'medusa', 'hakai', 'httpx',
  'dotdotpwn', 'commix', 'xsser', 'metasploit', 'burp', 'wapiti',
  'python-requests', 'python-urllib', 'urllib3', 'aiohttp', 'http.client',
  'curl/', 'wget', 'libwww', 'lwp-request',
  'go-http-client', 'okhttp', 'java/', 'apache-httpclient',
  'axios/', 'node-fetch', 'undici', 'got/', 'rest-client',
];

// Rutas que solo buscan bots/scanners (no existen en este sitio).
const SCANNER_PATHS = [
  '/wp-login.php', '/wp-admin', '/wordpress/', '/xmlrpc.php',
  '/.env', '/.git', '/.svn', '/.htaccess', '/.htpasswd', '/.ds_store',
  '/phpmyadmin', '/pma/', '/myadmin', '/admin.php', '/administrator/',
  '/vendor/phpunit', '/cgi-bin/', '/web.config', '/.aws/',
  '/actuator', '/manager/html', '/solr/', '/jenkins/',
  '/config.php', '/configuration.php', '/setup.php', '/install.php',
  '/shell.php', '/cmd.php', '/backdoor', '/eval-stdin.php',
];

// Rate limiting por IP (por instancia del Worker; suficiente como anti-flood).
const LIMIT_GENERAL = 240;   // peticiones por minuto por IP (navegar gasta ~20)
const LIMIT_NOTIFY = 8;      // peticiones por minuto por IP a la API de Discord
const LIMIT_ESPORTS = 30;    // peticiones por minuto por IP a la agenda Valorant
const LIMIT_TEAMS = 30;      // peticiones por minuto por IP a /api/teams
const LIMIT_GPR = 20;        // peticiones por minuto por IP a /api/gpr
const LIMIT_ACCOUNT = 10;    // peticiones por minuto por IP a /api/account/*
const LIMIT_TORNEO = 15;     // peticiones por minuto por IP a /api/torneos/*
const LIMIT_CLIPS = 6;       // peticiones por minuto por IP a /api/clips/* (subidas/bajas)
const WINDOW_MS = 60_000;    // ventana de 1 minuto
const MAX_BODY_NOTIFY = 8192; // máximo 8 KB por notificación
const MAX_CLIP_BYTES = 48 * 1024 * 1024; // vídeo destacado: máx 48 MB
const MAX_THUMB_BYTES = 400 * 1024;      // miniatura JPEG: máx 400 KB

/* ==================== CLIPS DESTACADOS (GitHub Releases) ====================
   Repositorio público que almacena los clips que los jugadores destacan:
   cada clip = un release con 2 assets (video + miniatura), inmutable una vez
   publicado. El índice (manifest.json) vive en el contents del repo y se
   actualiza atómicamente (sha). El video lo sube el navegador con el JWT de
   su sesión; el Worker valida el token (JWKS de Auth0) y nunca acepta un
   sub distinto al de la sesión. Sin sesión no se publica nada. */
const GH_CLIPS_REPO = 'VANTSgg/vants-clips';
const GH_API = 'https://api.github.com/repos/' + GH_CLIPS_REPO;
const CLIPS_EXT = ['webm', 'mp4', 'mkv', 'mov', 'm4v'];
const MAX_MANIFEST_ENTRIES = 60;

// Caché del manifest (60 s): la vitrina pública no golpea GitHub en cada visita.
const FEAT_TTL_MS = 60_000;
let featCache = { at: 0, body: null };

// Caché de claves públicas JWKS de Auth0 (1 h) para verificar JWT sin /userinfo
// (los tokens del SPA van con audience api.vants.app; JWKS es infalible).
const JWKS_TTL_MS = 60 * 60_000;
let jwksCache = { at: 0, keys: null };

const rlClips = new Map();

// Caché de la agenda esports (5 min): evita golpear api.henrikdev.xyz en cada visita.
const ESPORTS_TTL_MS = 5 * 60_000;
let esportsCache = { at: 0, body: null, status: 200 };

// Caché de equipos asociados (60 s): evita golpear la API de Discord en cada visita.
const TEAMS_TTL_MS = 60_000;
let teamsCache = { at: 0, body: null };

// Caché del GPR (1 h): Riot recalcula cada pocos días; la página pesa ~2 MB.
const GPR_TTL_MS = 60 * 60_000;
let gprCache = { at: 0, body: null };

const rlGeneral = new Map();
const rlNotify = new Map();
const rlEsports = new Map();
const rlTeams = new Map();
const rlGpr = new Map();
const rlAccount = new Map();
const rlTorneo = new Map();
// Caché de /api/en-vivo (a nivel de módulo: sobrevive entre peticiones)
let enVivoCache = { at: 0, body: null };

// Tenant Auth0 del sitio (misma configuración que assets/js/auth0-config.js)
const AUTH0_TENANT = 'vants.eu.auth0.com';
// Neon Data API (PostgREST): el Worker NUNCA guarda credenciales de la base;
// reenvía el JWT del usuario y las RLS/policies de cada tabla deciden.
const NEON_API = 'https://ep-autumn-scene-b4opu2ip.apirest.c-6.us-east-2.aws.neon.tech/neondb/rest/v1';

// Valida el JWT de la sesión contra Auth0 /userinfo → { sub, email } | null
async function infoDeSesion(token) {
  if (!token) return null;
  try {
    const ui = await fetch('https://' + AUTH0_TENANT + '/userinfo', {
      headers: { [AUTH_HEADER]: 'Bearer ' + token },
    });
    if (!ui.ok) return null;
    const info = await ui.json();
    return info && info.sub ? info : null;
  } catch (e) { return null; }
}

// GET a la Data API con el token del usuario si hay; si no, anónimo
// (las vistas públicas tienen GRANT a PUBLIC).
async function neonGet(rutaRelativa, token) {
  const headers = { Accept: 'application/json' };
  if (token) headers[AUTH_HEADER] = 'Bearer ' + token;
  const r = await fetch(NEON_API + rutaRelativa, { headers });
  if (!r.ok) return { ok: false, status: r.status, body: [] };
  const arr = await r.json().catch(() => []);
  return { ok: true, status: r.status, body: Array.isArray(arr) ? arr : [] };
}

function rateLimit(bucket, ip, max) {
  const now = Date.now();
  let arr = bucket.get(ip) || [];
  arr = arr.filter((t) => now - t < WINDOW_MS);
  if (arr.length >= max) {
    bucket.set(ip, arr);
    const retry = Math.max(1, Math.ceil((arr[0] + WINDOW_MS - now) / 1000));
    return { ok: false, retry };
  }
  arr.push(now);
  bucket.set(ip, arr);
  // Poda para que el mapa no crezca sin control
  if (bucket.size > 8000) {
    for (const [k, v] of bucket) {
      if (v.every((t) => now - t >= WINDOW_MS)) bucket.delete(k);
      if (bucket.size <= 4000) break;
    }
  }
  return { ok: true };
}

// Cabeceras de seguridad aplicadas a TODAS las respuestas.
const SEC_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
  'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  // CSP calibrada a lo que la web realmente carga: Google Fonts, lucide (unpkg)
  // y Auth0 (cdn.auth0.com). Sin iframes de terceros (Auth0 usa refresh tokens).
  'Content-Security-Policy':
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' https://unpkg.com https://cdn.auth0.com; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src 'self' data: https://fonts.gstatic.com; " +
    "img-src 'self' data: https:; " +
    "media-src 'self' blob: data: https:; " +
    "connect-src 'self' https:; " +
    "frame-src 'self' https:; " +
    "frame-ancestors 'none'; " +
    "base-uri 'self'; form-action 'self'; object-src 'none'; " +
    'upgrade-insecure-requests',
};

function harden(res, extra = {}) {
  for (const [k, v] of Object.entries(SEC_HEADERS)) res.headers.set(k, v);
  for (const [k, v] of Object.entries(extra)) res.headers.set(k, v);
  return res;
}

function txt(status, msg, extra = {}) {
  return harden(
    new Response(msg, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }),
    extra
  );
}

/* ==================== NOTIFICACIONES A DISCORD ==================== */

function buildEmbed(color, title, description) {
  return {
    title,
    description,
    color,
    footer: { text: 'VANTS GAMES — Donde nace la ventaja' },
    timestamp: new Date().toISOString(),
  };
}

// ---- base64 helpers seguros para UTF-8 (manifest con títulos con acentos) ----
function utf8ToB64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}
function b64ToUtf8(b64) {
  const bin = atob(b64.replace(/\s/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

// ---- verificación de JWT de sesión Auth0 con JWKS (RS256) ----
async function verifySesionJwt(request) {
  const authz = request.headers.get('authorization') || '';
  const token = authz.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  let head, payload;
  try {
    head = JSON.parse(b64ToUtf8(parts[0]));
    payload = JSON.parse(b64ToUtf8(parts[1]));
  } catch (e) { return null; }
  if (!payload || !payload.sub) return null;
  if (payload.exp && Date.now() / 1000 > payload.exp + 30) return null;
  if (payload.iss && payload.iss !== 'https://' + AUTH0_TENANT + '/') return null;
  if (!head || head.alg !== 'RS256' || !head.kid) return null;
  try {
    const now = Date.now();
    if (!jwksCache.keys || now - jwksCache.at > JWKS_TTL_MS) {
      const r = await fetch('https://' + AUTH0_TENANT + '/.well-known/jwks.json', {
        headers: { 'User-Agent': 'vants-worker' }, signal: AbortSignal.timeout(8000),
      });
      if (!r.ok) return null;
      const j = await r.json();
      if (!j || !Array.isArray(j.keys)) return null;
      jwksCache = { at: now, keys: j.keys };
    }
    const jk = jwksCache.keys.find((k) => k.kid === head.kid);
    if (!jk || !jk.n || !jk.e) return null;
    const b64u = (s) => {
      let t = String(s).replace(/-/g, '+').replace(/_/g, '/');
      while (t.length % 4) t += '=';
      return atob(t);
    };
    const key = await crypto.subtle.importKey(
      'jwk', { kty: 'RSA', e: jk.e, n: jk.n, alg: 'RS256', ext: true },
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']
    );
    const data = new TextEncoder().encode(parts[0] + '.' + parts[1]);
    const sig = new Uint8Array(b64u(parts[2]).length);
    const sigBin = b64u(parts[2]);
    for (let i = 0; i < sigBin.length; i++) sig[i] = sigBin.charCodeAt(i);
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, sig, data);
    return ok ? { sub: String(payload.sub) } : null;
  } catch (e) { return null; }
}

// ---- manifest.json del repo (índice de destacados) ----
async function ghHeaders(token) {
  const h = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'vants-worker',
  };
  /* repo público: las lecturas funcionan sin token (60/h por IP);
     con secret, el token sube el límite (5.000/h) y permite escribir */
  if (token) h[AUTH_HEADER] = 'Bearer ' + token;
  return h;
}
/* Extrae un motivo legible de una respuesta de error de GitHub (para el
   detalle que se muestra en la UI cuando falla publicar/quitar). */
async function ghDetalle(r) {
  let m = '';
  try {
    const j = await r.json();
    m = String(j.message || '');
    if (Array.isArray(j.errors) && j.errors.length) m += ' · ' + String(JSON.stringify(j.errors[0])).slice(0, 90);
  } catch (e) { /* sin cuerpo JSON */ }
  return ('GitHub HTTP ' + r.status + (m ? ' · ' + m : '')).slice(0, 170);
}
async function leerManifest(token) {
  /* Lectura robusta: si el token está vencido/revocado (401) o sin acceso
     (403), reintenta ANÓNIMO — el repo es público y la vitrina no puede
     quedar ciega por un secret vencido. */
  const intentos = token ? [token, ''] : [''];
  let last = null;
  for (const t of intentos) {
    const r = await fetch(GH_API + '/contents/manifest.json', { headers: await ghHeaders(t), signal: AbortSignal.timeout(9000) });
    if (r.status === 404) return { sha: null, clips: [] };
    if (r.ok) {
      const j = await r.json();
      let clips = [];
      try { clips = JSON.parse(b64ToUtf8(j.content || '')); } catch (e) { clips = []; }
      if (!Array.isArray(clips)) clips = [];
      return { sha: j.sha || null, clips };
    }
    last = new Error('manifest ' + r.status);
  }
  throw last;
}
async function guardarManifest(token, sha, clips) {
  const cuerpo = { message: 'destacados: ' + clips.length + ' clips', content: utf8ToB64(JSON.stringify(clips)) };
  if (sha) cuerpo.sha = sha;
  const r = await fetch(GH_API + '/contents/manifest.json', {
    method: 'PUT', headers: await ghHeaders(token), body: JSON.stringify(cuerpo), signal: AbortSignal.timeout(15000),
  });
  return r.ok;
}
const nombreLimpio = (s, max) => String(s || '').replace(/[\u0000-\u001f<>:"\\/\\|?*]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

function json(data, status = 200, extraHeaders = {}) {
  return harden(
    new Response(JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    }),
    extraHeaders
  );
}

async function handleNotify(request, env) {
  try {
    const { type, data } = await request.json();
    let embed;

    switch (type) {
      case 'torneo_inscripcion':
        embed = buildEmbed(
          COLORS.rojo,
          '🏆 Nueva inscripción',
          `**${data.team} [${data.tag}]** se inscribió en **${data.tournament}**.`
        );
        break;
      case 'membresia':
        embed = buildEmbed(
          COLORS.violeta,
          '💎 Nueva membresía',
          `**${data.user}** activó **VANTS ${data.plan.toUpperCase()}**. ¡Bienvenido al circuito!`
        );
        break;
      case 'live':
        embed = buildEmbed(
          COLORS.twitch,
          '🔴 EN DIRECTO',
          `**${data.user}** está transmitiendo:\n**${data.title}**`
        );
        break;
      case 'campeon':
        embed = buildEmbed(
          COLORS.oro,
          '👑 Nuevo campeón',
          `**${data.team}** ganó **${data.tournament}**. GG!`
        );
        break;
      default:
        return json({ ok: false, error: 'Tipo de notificación desconocido' }, 400);
    }

    const discordRes = await fetch(
      `https://discord.com/api/v10/channels/${env.CHANNEL_ID}/messages`,
      {
        method: 'POST',
        headers: {
          [AUTH_HEADER]: `Bot ${env.DISCORD_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ embeds: [embed] }),
      }
    );

    if (!discordRes.ok) {
      const error = await discordRes.text();
      return json({ ok: false, error }, 500);
    }

    return json({ ok: true });
  } catch (err) {
    return json({ ok: false, error: err.message }, 500);
  }
}

/* ==================== EQUIPOS ASOCIADOS EN VIVO ====================
 * La fuente de verdad es el canal de Discord: cada inscripción publicada por
 * /api/discord/notify ("🏆 Nueva inscripción") y cada campeonato ("👑 Nuevo
 * campeón") se leen de vuelta con el mismo bot. Sin base de datos nueva, sin
 * bindings nuevos: si el dueño borra un mensaje en Discord, el equipo desaparece
 * de la web (moderación directa).
 */
const RE_INSCRIPCION = /\*\*(.+?)\s*\[([^\]]+)\]\*\* se inscribió en \*\*(.+?)\*\*/;
const RE_CAMPEON = /\*\*(.+?)\*\* ganó \*\*(.+?)\*\*/;

async function handleTeams(env) {
  const token = (env && env.DISCORD_TOKEN) || '';
  const channelId = (env && env.CHANNEL_ID) || '';
  if (!token || !channelId) {
    return { ok: true, source: 'unconfigured', count: 0, teams: [], champions: [] };
  }
  const now = Date.now();
  if (teamsCache.body && now - teamsCache.at < TEAMS_TTL_MS) {
    return teamsCache.body;
  }
  let payload;
  try {
    const up = await fetch(
      `https://discord.com/api/v10/channels/${channelId}/messages?limit=100`,
      { headers: { [AUTH_HEADER]: `Bot ${token}`, Accept: 'application/json' } }
    );
    if (!up.ok) {
      // Sin detalles internos: el frontend muestra su estado vacío honesto.
      payload = { ok: true, source: 'discord_error', count: 0, teams: [], champions: [] };
    } else {
      const msgs = await up.json().catch(() => []);
      const teams = new Map();   // clave tag+team normalizado → registro más reciente
      const champions = new Map(); // nombre de equipo → { tournament, ts, wins }
      for (const m of Array.isArray(msgs) ? msgs : []) {
        const ts = m.timestamp || null;
        for (const e of Array.isArray(m.embeds) ? m.embeds : []) {
          const desc = String(e.description || '');
          const mi = desc.match(RE_INSCRIPCION);
          if (mi) {
            const team = mi[1].trim().slice(0, 40);
            const tag = mi[2].trim().toUpperCase().slice(0, 6);
            const tournament = mi[3].trim().slice(0, 80);
            const key = tag + '|' + team.toLowerCase();
            const prev = teams.get(key);
            if (!prev || (ts && (!prev.ts || ts > prev.ts))) {
              teams.set(key, { team, tag, tournament, ts });
            }
            continue;
          }
          const mc = desc.match(RE_CAMPEON);
          if (mc) {
            const team = mc[1].trim().slice(0, 40);
            const tournament = mc[2].trim().slice(0, 80);
            const prev = champions.get(team.toLowerCase());
            champions.set(team.toLowerCase(), {
              team,
              tournament,
              ts,
              wins: (prev ? prev.wins : 0) + 1,
            });
          }
        }
      }
      const list = [...teams.values()]
        .sort((a, b) => String(b.ts).localeCompare(String(a.ts)))
        .slice(0, 24);
      const champs = [...champions.values()].sort((a, b) => b.wins - a.wins).slice(0, 12);
      payload = { ok: true, source: 'discord', count: list.length, teams: list, champions: champs };
    }
  } catch (err) {
    payload = { ok: true, source: 'discord_error', count: 0, teams: [], champions: [] };
  }
  teamsCache = { at: now, body: payload };
  return payload;
}

/* ==================== GPR · GLOBAL POWER RANKINGS EN VIVO ====================
 * La página https://valorantesports.com/es-ES/gpr/2026/current es SSR y trae
 * embebido el payload de datos (objetos TeamGPR de Riot con gprScore, código,
 * nombre y liga de cada equipo). Extraemos el ÚLTIMO cálculo por equipo y lo
 * agrupamos por liga. Sin claves ni APIs privadas: es la misma página que
 * carga un navegador.
 */
const GPR_PAGE_URL = 'https://valorantesports.com/es-ES/gpr/2026/current';
const GPR_LEAGUES = {
  vct_americas: 'VCT AMÉRICAS',
  vct_pacific: 'VCT PACIFIC',
  vct_emea: 'VCT EMEA',
  vct_china: 'VCT CHINA',
};

function parseGprHtml(html) {
  const parts = String(html).split('{"__typename":"TeamGPR"');
  const byLeague = new Map(); // liga → (code → registro con fecha más reciente)
  let lastDate = '';
  for (let i = 1; i < parts.length; i++) {
    const next = parts[i].indexOf('{"__typename":"TeamGPR"');
    const chunk = next > 0 ? parts[i].slice(0, next) : parts[i].slice(0, 60000);
    const name = chunk.match(/"name":"([^"]+)","homeLeague"/);
    if (!name) continue;
    const code = chunk.match(/"code":"([A-Z0-9]{1,6})"/);
    const league = chunk.match(/"homeLeague":\{"__typename":"HomeLeague"[^}]*?"slug":"([a-z_]+)"/);
    const gpr = chunk.match(/\{"__typename":"GPR","gprScore":(\d+),"elo":\d+,"rank":\d+,"dateCalculated":"([^"]+)"/);
    if (!code || !league || !gpr) continue;
    const lid = league[1];
    if (!(lid in GPR_LEAGUES)) continue;
    if (!byLeague.has(lid)) byLeague.set(lid, new Map());
    const bucket = byLeague.get(lid);
    const rec = { n: name[1], t: code[1], p: parseInt(gpr[1], 10), date: gpr[2] };
    const prev = bucket.get(rec.t);
    if (!prev || rec.date > prev.date) bucket.set(rec.t, rec);
    if (rec.date > lastDate) lastDate = rec.date;
  }
  const regionsOut = [];
  for (const [lid, label] of Object.entries(GPR_LEAGUES)) {
    const bucket = byLeague.get(lid);
    if (!bucket || !bucket.size) continue;
    const equipos = [...bucket.values()]
      .sort((a, b) => b.p - a.p)
      .map(({ n, t, p }) => ({ n, t, p }));
    regionsOut.push({ id: lid, n: label, equipos });
  }
  return { regions: regionsOut, calculated: lastDate || null, total: regionsOut.reduce((s, r) => s + r.equipos.length, 0) };
}

async function handleGpr() {
  const now = Date.now();
  if (gprCache.body && now - gprCache.at < GPR_TTL_MS) return gprCache.body;
  let payload;
  try {
    const up = await fetch(GPR_PAGE_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'es-ES,es;q=0.9',
      },
      signal: AbortSignal.timeout(9000),
    });
    if (!up.ok) {
      payload = { ok: false, error: 'valorantesports respondió ' + up.status, source: 'riot' };
    } else {
      const html = await up.text();
      const parsed = parseGprHtml(html);
      if (parsed.total >= 40) {
        payload = { ok: true, source: 'riot', calculated: parsed.calculated, total: parsed.total, regions: parsed.regions };
      } else {
        payload = { ok: false, error: 'La página de Riot no trajo los equipos esperados', source: 'riot' };
      }
    }
  } catch (err) {
    payload = { ok: false, error: 'No se pudo contactar valorantesports.com: ' + err.message, source: 'riot' };
  }
  // Solo cacheamos respuestas buenas; los errores se reintentan en la próxima visita.
  if (payload.ok) gprCache = { at: now, body: payload };
  return payload;
}

/* ==================== WORKER PRINCIPAL ==================== */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const ip = request.headers.get('cf-connecting-ip') || 'desconocida';
    const ua = (request.headers.get('user-agent') || '').toLowerCase();
    const path = url.pathname.toLowerCase();

    // --- 1) Métodos permitidos (sitio de lectura + POST para la API)
    const method = request.method.toUpperCase();
    const allowedMethods = ['GET', 'HEAD', 'POST', 'OPTIONS', 'DELETE'];
    if (!allowedMethods.includes(method)) {
      return txt(405, 'Método no permitido', { Allow: 'GET, HEAD, POST, OPTIONS, DELETE' });
    }

    // --- 2) Pre-flight CORS solo para la API propia
    if (method === 'OPTIONS') {
      const origin = request.headers.get('origin') || '';
      const isGetApi = url.pathname === '/api/valorant/esports' || url.pathname === '/api/teams' || url.pathname === '/api/gpr' || url.pathname === '/api/clips/featured' || url.pathname === '/api/torneos/bracket' || url.pathname === '/api/en-vivo';
      const isPostApi = url.pathname === '/api/discord/notify' || url.pathname === '/api/account/email-verify' || url.pathname === '/api/account/password-reset' || url.pathname === '/api/clips/featured' || url.pathname === '/api/torneos/inscribir' || url.pathname === '/api/torneos/gestionar';
      if ((isPostApi || isGetApi) && SITE_ORIGINS.has(origin)) {
        return harden(new Response(null, { status: 204 }), {
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Methods': url.pathname === '/api/clips/featured' ? 'GET, POST, DELETE, OPTIONS' : (isGetApi ? 'GET, OPTIONS' : 'POST, OPTIONS'),
          'Access-Control-Allow-Headers': isPostApi ? 'Content-Type, ' + AUTH_HEADER : 'Content-Type',
          'Access-Control-Max-Age': '86400',
        });
      }
      return new Response(null, { status: 204 });
    }

    // --- 3) User-Agent vacío o herramienta de ataque conocida → fuera
    if (!ua || BAD_UA.some((b) => ua.includes(b))) {
      return txt(403, 'Bloqueado');
    }

    // --- 4) Rutas típicas de scanners → fuera
    if (SCANNER_PATHS.some((s) => path === s || path.startsWith(s))) {
      return txt(403, 'Bloqueado');
    }

    // --- 5) Anti-flood general
    const g = rateLimit(rlGeneral, ip, LIMIT_GENERAL);
    if (!g.ok) {
      return txt(429, 'Demasiadas peticiones. Probá de nuevo en un momento.', {
        'Retry-After': String(g.retry),
      });
    }

    // --- 6) API de notificaciones: protegida
    if (url.pathname === '/api/discord/notify') {
      if (method !== 'POST') {
        return json({ ok: false, error: 'Solo POST' }, 405, { Allow: 'POST' });
      }
      const origin = request.headers.get('origin') || '';
      if (!SITE_ORIGINS.has(origin)) {
        return json({ ok: false, error: 'Origen no permitido' }, 403, { 'Access-Control-Allow-Origin': origin || '*' });
      }
      const contentType = request.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        return json({ ok: false, error: 'Content-Type debe ser application/json' }, 415);
      }
      const len = parseInt(request.headers.get('content-length') || '0', 10);
      if (len > MAX_BODY_NOTIFY) {
        return json({ ok: false, error: 'Payload demasiado grande' }, 413);
      }
      const n = rateLimit(rlNotify, ip, LIMIT_NOTIFY);
      if (!n.ok) {
        return json({ ok: false, error: 'Demasiadas notificaciones' }, 429, {
          'Retry-After': String(n.retry),
        });
      }
      const resp = await handleNotify(request, env);
      resp.headers.set('Access-Control-Allow-Origin', origin);
      return resp;
    }

    // --- 6b) Discord · eventos de la app (webhooks del Developer Portal)
    //     Punto de conexión para Discord: https://<host>/api/discord/events
    //     Verifica la firma Ed25519 (X-Signature-Ed25519 + timestamp) con
    //     la DISCORD_PUBLIC_KEY (General Information del portal) y responde
    //     204 como exige Discord para dar el endpoint por válido.
    if (url.pathname === '/api/discord/events') {
      if (method !== 'POST') {
        return json({ ok: false, error: 'Solo POST' }, 405, { Allow: 'POST' });
      }
      const pub = (env && env.DISCORD_PUBLIC_KEY) || '';
      const sig = request.headers.get('x-signature-ed25519') || '';
      const ts = request.headers.get('x-signature-timestamp') || '';
      const raw = await request.text();
      if (!pub) {
        return txt(503, 'Falta DISCORD_PUBLIC_KEY en el Worker');
      }
      if (!sig || !ts) {
        return txt(401, 'Falta firma de Discord');
      }
      const hexBytes = (h) => {
        const m = String(h).trim().match(/.{1,2}/g) || [];
        return new Uint8Array(m.map((b) => parseInt(b, 16)));
      };
      try {
        let alg = 'Ed25519';
        let key;
        try {
          key = await crypto.subtle.importKey('raw', hexBytes(pub), { name: alg }, false, ['verify']);
        } catch (eImp) {
          alg = 'NODE-ED25519';
          key = await crypto.subtle.importKey('raw', hexBytes(pub), { name: alg, namedCurve: alg }, false, ['verify']);
        }
        const enc = new TextEncoder();
        const ok = await crypto.subtle.verify({ name: alg }, key, hexBytes(sig), enc.encode(ts + raw));
        if (!ok) return txt(401, 'Firma inválida');
      } catch (eVer) {
        return txt(500, 'No se pudo verificar la firma');
      }
      let payload = null;
      try { payload = JSON.parse(raw); } catch (eJson) {}
      if (payload && payload.type === 1) {
        return json({ type: 1 }, 200);
      }
      // Persistencia 0 EUR: el evento ya verificado se reenvía a vantsbot
      // (Neon Functions) para guardarlo en web_events y avisar al dueño de
      // compras/instalaciones. waitUntil: Discord recibe su 204 aunque Neon
      // esté frío — un webhook nunca falla por la persistencia.
      if (payload && ctx && typeof ctx.waitUntil === 'function') {
        const botUrl = String((env && env.VANTS_BOT_URL) || '').replace(/\/+$/, '');
        const botSec = String((env && env.VANTS_BOT_SECRET) || '');
        if (botUrl && botSec) {
          const cuerpo = JSON.stringify({ payload });
          if (cuerpo.length <= 32768) {
            ctx.waitUntil(
              fetch(botUrl + '/evento-discord', {
                method: 'POST',
                headers: { 'content-type': 'application/json', 'x-vants-bot': botSec },
                body: cuerpo,
              }).catch(() => {})
            );
          }
        }
      }
      return new Response(null, { status: 204 });
    }

    // --- 7) Agenda esports de Valorant (datos reales, api.henrikdev.xyz)
    if (url.pathname === '/api/valorant/esports') {
      if (method !== 'GET') {
        return json({ ok: false, error: 'Solo GET' }, 405, { Allow: 'GET' });
      }
      /* Origen vacío = fetch same-origin (el navegador no manda Origin en un GET
         same-origin): se permite. Origen presente y ajeno → fuera. */
      const origin = request.headers.get('origin') || '';
      if (origin && !SITE_ORIGINS.has(origin)) {
        return json({ ok: false, error: 'Origen no permitido' }, 403, { 'Access-Control-Allow-Origin': origin || '*' });
      }
      const e = rateLimit(rlEsports, ip, LIMIT_ESPORTS);
      if (!e.ok) {
        return json({ ok: false, error: 'Demasiadas peticiones' }, 429, { 'Retry-After': String(e.retry), 'Access-Control-Allow-Origin': origin || '*' });
      }
      const key = (env && env.HENRIKDEV_API_KEY) || '';
      if (!key) {
        return json({ ok: false, error: 'HENRIKDEV_API_KEY no configurada (secret del Worker). La web usa su agenda verificada de vlr.gg.' }, 503);
      }
      const now = Date.now();
      if (esportsCache.body && now - esportsCache.at < ESPORTS_TTL_MS) {
        const c = json(esportsCache.body, esportsCache.status);
        c.headers.set('Access-Control-Allow-Origin', origin || '*');
        c.headers.set('Cache-Control', 'public, max-age=120');
        return c;
      }
      try {
        const up = await fetch('https://api.henrikdev.xyz/valorant/v1/esports/schedule', {
          headers: { [AUTH_HEADER]: key, Accept: 'application/json' },
        });
        const body = await up.json().catch(() => null);
        const payload = body || { ok: false, error: 'Respuesta inválida de api.henrikdev.xyz' };
        const status = up.ok ? 200 : (up.status === 401 ? 500 : up.status); // 401: la clave nunca se expone al cliente
        if (up.ok) {
          esportsCache = { at: now, body: payload, status: 200 };
        }
        const res = json(payload, status);
        res.headers.set('Access-Control-Allow-Origin', origin || '*');
        return res;
      } catch (err) {
        return json({ ok: false, error: 'No se pudo contactar api.henrikdev.xyz: ' + err.message }, 502);
      }
    }

    // --- 7b) Equipos asociados en vivo (lectura del canal de Discord)
    if (url.pathname === '/api/teams') {
      if (method !== 'GET') {
        return json({ ok: false, error: 'Solo GET' }, 405, { Allow: 'GET' });
      }
      /* Origen vacío = fetch same-origin (el navegador no manda Origin en un GET
         same-origin): se permite. Origen presente y ajeno → fuera. */
      const origin = request.headers.get('origin') || '';
      if (origin && !SITE_ORIGINS.has(origin)) {
        return json({ ok: false, error: 'Origen no permitido' }, 403, { 'Access-Control-Allow-Origin': origin || '*' });
      }
      const t = rateLimit(rlTeams, ip, LIMIT_TEAMS);
      if (!t.ok) {
        return json({ ok: false, error: 'Demasiadas peticiones' }, 429, { 'Retry-After': String(t.retry) });
      }
      const payload = await handleTeams(env);
      const res = json(payload);
      res.headers.set('Access-Control-Allow-Origin', origin || '*');
      res.headers.set('Cache-Control', 'public, max-age=60');
      return res;
    }

    // --- 7b1b) EN VIVO: jugadores conectados / jugando AHORA (presencia).
    // Fuente: vista v_en_vivo (presence actualizado hace < 2 min). Lectura
    // pública; con sesión el token va y RLS confirma. Caché 10 s.
    if (url.pathname === '/api/en-vivo') {
      if (method !== 'GET') {
        return json({ ok: false, error: 'Solo GET' }, 405, { Allow: 'GET' });
      }
      const origin = request.headers.get('origin') || '';
      if (origin && !SITE_ORIGINS.has(origin)) {
        return json({ ok: false, error: 'Origen no permitido' }, 403, { 'Access-Control-Allow-Origin': origin || '*' });
      }
      const t = rateLimit(rlTorneo, ip, LIMIT_TORNEO);
      if (!t.ok) {
        return json({ ok: false, error: 'Demasiadas peticiones' }, 429, { 'Retry-After': String(t.retry), 'Access-Control-Allow-Origin': origin || '*' });
      }
      const now2 = Date.now();
      if (enVivoCache.body && now2 - enVivoCache.at < 10000) {
        const resC = json(enVivoCache.body);
        resC.headers.set('Access-Control-Allow-Origin', origin || '*');
        resC.headers.set('Cache-Control', 'public, max-age=10');
        return resC;
      }
      const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
      let payload2 = null;
      try {
        const r = await neonGet('/v_en_vivo?order=actualizado.desc&limit=50', token || null);
        if (r.ok) payload2 = { ok: true, jugadores: r.body, ahora: new Date().toISOString() };
      } catch (e) { payload2 = null; }
      if (!payload2) payload2 = { ok: false, motivo: 'base_no_disponible', jugadores: [] };
      enVivoCache = { at: now2, body: payload2 };
      const res2 = json(payload2);
      res2.headers.set('Access-Control-Allow-Origin', origin || '*');
      res2.headers.set('Cache-Control', 'public, max-age=10');
      return res2;
    }

    // --- 7b1c) TORNEOS: bracket + equipos inscritos (lectura pública).
    if (url.pathname === '/api/torneos/bracket') {
      if (method !== 'GET') {
        return json({ ok: false, error: 'Solo GET' }, 405, { Allow: 'GET' });
      }
      const origin = request.headers.get('origin') || '';
      if (origin && !SITE_ORIGINS.has(origin)) {
        return json({ ok: false, error: 'Origen no permitido' }, 403, { 'Access-Control-Allow-Origin': origin || '*' });
      }
      const t = rateLimit(rlTorneo, ip, LIMIT_TORNEO);
      if (!t.ok) {
        return json({ ok: false, error: 'Demasiadas peticiones' }, 429, { 'Retry-After': String(t.retry), 'Access-Control-Allow-Origin': origin || '*' });
      }
      const torneo = (url.searchParams.get('torneo') || '').trim().slice(0, 40);
      if (!torneo || !/^[a-z0-9_-]{1,40}$/i.test(torneo)) {
        return json({ ok: false, error: 'torneo_invalido' }, 400, { 'Access-Control-Allow-Origin': origin || '*' });
      }
      const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
      let equipos = [], llaves = [];
      try {
        const [re, rb] = await Promise.all([
          neonGet('/v_torneo_equipos?tournament_id=eq.' + encodeURIComponent(torneo) + '&order=created_at', token || null),
          neonGet('/v_torneo_bracket?tournament_id=eq.' + encodeURIComponent(torneo) + '&limit=100', token || null),
        ]);
        if (re.ok) equipos = re.body;
        if (rb.ok) llaves = rb.body;
      } catch (e) { /* abajo se informa */ }
      const okRead = (equipos.length + llaves.length) > 0;
      const payload3 = okRead
        ? { ok: true, torneo, equipos, bracket: llaves }
        : { ok: false, motivo: 'sin_datos', torneo, equipos: [], bracket: [] };
      const res3 = json(payload3);
      res3.headers.set('Access-Control-Allow-Origin', origin || '*');
      res3.headers.set('Cache-Control', 'public, max-age=15');
      return res3;
    }

    // --- 7b1d) TORNEOS: inscripción REAL del equipo (requiere sesión).
    // Guarda la fila en Neon (tournament_teams) con el JWT del jugador;
    // RLS exige que auth0_sub sea el de la sesión. Estado: pendiente.
    if (url.pathname === '/api/torneos/inscribir') {
      if (method !== 'POST') {
        return json({ ok: false, error: 'Solo POST' }, 405, { Allow: 'POST' });
      }
      const origin = request.headers.get('origin') || '';
      if (!SITE_ORIGINS.has(origin)) {
        return json({ ok: false, error: 'Origen no permitido' }, 403, { 'Access-Control-Allow-Origin': origin || '*' });
      }
      const t = rateLimit(rlTorneo, ip, LIMIT_TORNEO);
      if (!t.ok) {
        return json({ ok: false, error: 'Demasiadas peticiones' }, 429, { 'Retry-After': String(t.retry), 'Access-Control-Allow-Origin': origin || '*' });
      }
      const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
      if (!token) {
        return json({ ok: false, error: 'sin_sesion' }, 401, { 'Access-Control-Allow-Origin': origin || '*' });
      }
      const info = await infoDeSesion(token);
      if (!info || !info.sub) {
        return json({ ok: false, error: 'token_invalido' }, 401, { 'Access-Control-Allow-Origin': origin || '*' });
      }
      const body = await request.json().catch(() => ({}));
      const torneo = String((body && body.torneo) || '').trim().slice(0, 40);
      const juego = String((body && body.juego) || 'valorant').trim() === 'cs2' ? 'cs2' : 'valorant';
      const equipo = String((body && body.equipo) || '').trim().replace(/[<>\\]/g, '').slice(0, 32);
      const tag = String((body && body.tag) || '').trim().replace(/[^A-Za-z0-9]/g, '').slice(0, 4);
      const capitan = String((body && body.capitan) || '').trim().replace(/[<>\\]/g, '').slice(0, 40);
      const region = String((body && body.region) || '').trim().slice(0, 40);
      const ACAO = { 'Access-Control-Allow-Origin': origin || '*' };
      if (!torneo || !/^[a-z0-9_-]{1,40}$/i.test(torneo)) {
        return json({ ok: false, error: 'torneo_invalido' }, 400, ACAO);
      }
      if (equipo.length < 2 || tag.length < 2) {
        return json({ ok: false, error: 'datos_invalidos' }, 400, ACAO);
      }
      // Fila real del jugador (por sub) para ligar la inscripción
      let pid = null;
      try {
        const pr = await neonGet('/players?auth0_sub=eq.' + encodeURIComponent(info.sub) + '&select=id&limit=1', token);
        if (pr.ok && pr.body[0]) pid = pr.body[0].id;
      } catch (e) { pid = null; }
      const fila = {
        tournament_id: torneo,
        game: juego,
        name: equipo,
        tag: tag,
        captain: capitan || null,
        region: region || null,
        auth0_sub: info.sub,
        player_id: pid,
        status: 'pendiente',
      };
      let ins;
      try {
        ins = await fetch(NEON_API + '/tournament_teams', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', [AUTH_HEADER]: 'Bearer ' + token, Prefer: 'return=representation' },
          body: JSON.stringify(fila),
        });
      } catch (e) {
        return json({ ok: false, error: 'base_inaccesible' }, 502, ACAO);
      }
      if (!ins.ok) {
        const det = await ins.text().catch(() => '');
        const dup = /duplicate key|unique/i.test(det);
        return json({ ok: false, error: dup ? 'equipo_ya_inscrito' : 'base_rechazo', detalle: det.slice(0, 300) }, dup ? 409 : 502, ACAO);
      }
      const creada = await ins.json().catch(() => []);
      return json({ ok: true, equipo: Array.isArray(creada) ? creada[0] : creada }, 200, ACAO);
    }

    // --- 7b1e) TORNEOS: gestión del OWNER (confirmar/rechazar equipos,
    // resultados de llaves, sembrar bracket, reset). Solo la fila del
    // dueño (players.role='owner') pasa; las RLS refuerzan lo mismo.
    if (url.pathname === '/api/torneos/gestionar') {
      if (method !== 'POST') {
        return json({ ok: false, error: 'Solo POST' }, 405, { Allow: 'POST' });
      }
      const origin = request.headers.get('origin') || '';
      if (!SITE_ORIGINS.has(origin)) {
        return json({ ok: false, error: 'Origen no permitido' }, 403, { 'Access-Control-Allow-Origin': origin || '*' });
      }
      const t = rateLimit(rlTorneo, ip, LIMIT_TORNEO);
      if (!t.ok) {
        return json({ ok: false, error: 'Demasiadas peticiones' }, 429, { 'Retry-After': String(t.retry), 'Access-Control-Allow-Origin': origin || '*' });
      }
      const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
      if (!token) {
        return json({ ok: false, error: 'sin_sesion' }, 401, { 'Access-Control-Allow-Origin': origin || '*' });
      }
      const info = await infoDeSesion(token);
      if (!info || !info.sub) {
        return json({ ok: false, error: 'token_invalido' }, 401, { 'Access-Control-Allow-Origin': origin || '*' });
      }
      const ACAO = { 'Access-Control-Allow-Origin': origin || '*' };
      let filaDueno = null;
      try {
        const pr = await neonGet('/players?auth0_sub=eq.' + encodeURIComponent(info.sub) + '&select=id,role&limit=1', token);
        if (pr.ok && pr.body[0]) filaDueno = pr.body[0];
      } catch (e) { filaDueno = null; }
      if (!filaDueno || filaDueno.role !== 'owner') {
        return json({ ok: false, error: 'solo_owner' }, 403, ACAO);
      }
      const body = await request.json().catch(() => ({}));
      const accion = String((body && body.accion) || '');
      const hAuth = { 'Content-Type': 'application/json', [AUTH_HEADER]: 'Bearer ' + token, Prefer: 'return=representation' };
      try {
        if (accion === 'equipo') {
          const id = String(body.id || '');
          const status = String(body.status || '');
          if (!/^[0-9a-f-]{36}$/i.test(id) || !['pendiente', 'confirmado', 'rechazado'].includes(status)) {
            return json({ ok: false, error: 'datos_invalidos' }, 400, ACAO);
          }
          const r = await fetch(NEON_API + '/tournament_teams?id=eq.' + id, { method: 'PATCH', headers: hAuth, body: JSON.stringify({ status }) });
          if (!r.ok) return json({ ok: false, error: 'base_rechazo', detalle: (await r.text().catch(() => '')).slice(0, 300) }, 502, ACAO);
          return json({ ok: true, accion }, 200, ACAO);
        }
        if (accion === 'resultado') {
          const id = String(body.id || '');
          if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ ok: false, error: 'datos_invalidos' }, 400, ACAO);
          const g = await neonGet('/tournament_matches?id=eq.' + id + '&select=*', token);
          const m = g.ok && g.body[0] ? g.body[0] : null;
          if (!m) return json({ ok: false, error: 'partido_no_encontrado' }, 404, ACAO);
          const sa = parseInt(body.score_a, 10);
          const sb = parseInt(body.score_b, 10);
          const estado = body.estado === 'en_curso' ? 'en_curso' : 'final';
          if (estado === 'final' && (!Number.isFinite(sa) || !Number.isFinite(sb) || sa === sb)) {
            return json({ ok: false, error: 'marcador_invalido' }, 400, ACAO);
          }
          const parche = { score_a: Number.isFinite(sa) ? sa : null, score_b: Number.isFinite(sb) ? sb : null, estado, ganador: estado === 'final' ? (sa > sb ? m.team_a : m.team_b) : null };
          const r = await fetch(NEON_API + '/tournament_matches?id=eq.' + id, { method: 'PATCH', headers: hAuth, body: JSON.stringify(parche) });
          if (!r.ok) return json({ ok: false, error: 'base_rechazo', detalle: (await r.text().catch(() => '')).slice(0, 300) }, 502, ACAO);
          return json({ ok: true, accion, ganador: parche.ganador }, 200, ACAO);
        }
        if (accion === 'sembrar') {
          const torneo = String(body.torneo || '').trim().slice(0, 40);
          if (!torneo || !/^[a-z0-9_-]{1,40}$/i.test(torneo)) return json({ ok: false, error: 'torneo_invalido' }, 400, ACAO);
          const r = await fetch(NEON_API + '/rpc/bracket_sembrar', { method: 'POST', headers: hAuth, body: JSON.stringify({ p_tournament: torneo }) });
          if (!r.ok) return json({ ok: false, error: 'base_rechazo', detalle: (await r.text().catch(() => '')).slice(0, 300) }, 502, ACAO);
          return json({ ok: true, accion }, 200, ACAO);
        }
        if (accion === 'reset_bracket') {
          const torneo = String(body.torneo || '').trim().slice(0, 40);
          if (!torneo || !/^[a-z0-9_-]{1,40}$/i.test(torneo)) return json({ ok: false, error: 'torneo_invalido' }, 400, ACAO);
          const r = await fetch(NEON_API + '/tournament_matches?tournament_id=eq.' + encodeURIComponent(torneo), { method: 'DELETE', headers: { [AUTH_HEADER]: 'Bearer ' + token } });
          if (!r.ok) return json({ ok: false, error: 'base_rechazo' }, 502, ACAO);
          return json({ ok: true, accion }, 200, ACAO);
        }
        return json({ ok: false, error: 'accion_desconocida' }, 400, ACAO);
      } catch (e) {
        return json({ ok: false, error: 'base_inaccesible' }, 502, ACAO);
      }
    }

    // --- 7b2) Cuenta: verificación/cambio de email vía Auth0 Management API.
    // El navegador manda el JWT de la sesión; el Worker lo valida con /userinfo,
    // opcionalmente cambia el email (email_verified=false) y crea el TICKET de
    // verificación de Auth0. Devuelve el ENLACE directo: aunque el correo caiga
    // en Spam o no salga, el jugador puede abrir el enlace desde la web.
    // Requiere secrets: AUTH0_MGMT_CLIENT_ID + AUTH0_MGMT_CLIENT_SECRET (app M2M).
    if (url.pathname === '/api/account/email-verify') {
      if (method !== 'POST') {
        return json({ ok: false, error: 'Solo POST' }, 405, { Allow: 'POST' });
      }
      const origin = request.headers.get('origin') || '';
      if (!SITE_ORIGINS.has(origin)) {
        return json({ ok: false, error: 'Origen no permitido' }, 403, { 'Access-Control-Allow-Origin': origin || '*' });
      }
      const a = rateLimit(rlAccount, ip, LIMIT_ACCOUNT);
      if (!a.ok) {
        return json({ ok: false, error: 'Demasiadas peticiones' }, 429, { 'Retry-After': String(a.retry), 'Access-Control-Allow-Origin': origin || '*' });
      }
      const authz = request.headers.get('authorization') || '';
      const token = authz.replace(/^Bearer\s+/i, '').trim();
      if (!token) {
        return json({ ok: false, error: 'sin_sesion' }, 401, { 'Access-Control-Allow-Origin': origin || '*' });
      }
      let info = null;
      try {
        const ui = await fetch('https://' + AUTH0_TENANT + '/userinfo', {
          headers: { [AUTH_HEADER]: 'Bearer ' + token },
        });
        if (ui.ok) info = await ui.json();
      } catch (eUI) { info = null; }
      if (!info || !info.sub) {
        return json({ ok: false, error: 'token_invalido' }, 401, { 'Access-Control-Allow-Origin': origin || '*' });
      }
      const body = await request.json().catch(() => ({}));
      const nuevo = String((body && body.nuevo_email) || '').trim();
      if (nuevo && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(nuevo)) {
        return json({ ok: false, error: 'email_invalido' }, 400, { 'Access-Control-Allow-Origin': origin || '*' });
      }
      const mId = (env && env.AUTH0_MGMT_CLIENT_ID) || '';
      const mSec = (env && env.AUTH0_MGMT_CLIENT_SECRET) || '';
      if (!mId || !mSec) {
        return json({ ok: false, error: 'mgmt_no_config' }, 503, { 'Access-Control-Allow-Origin': origin || '*' });
      }
      try {
        const mt = await fetch('https://' + AUTH0_TENANT + '/oauth/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            grant_type: 'client_credentials',
            client_id: mId,
            [SECRET_FIELD]: mSec,
            audience: 'https://' + AUTH0_TENANT + '/api/v2/',
          }),
        });
        if (!mt.ok) {
          return json({ ok: false, error: 'mgmt_token' }, 502, { 'Access-Control-Allow-Origin': origin || '*' });
        }
        const mtj = await mt.json();
        const mgmtH = { 'Content-Type': 'application/json', [AUTH_HEADER]: 'Bearer ' + mtj.access_token };
        let emailFinal = info.email || '';
        let notaEmail = '';
        const esSocialId = String(info.sub || '').indexOf('google-oauth2|') === 0 || String(info.sub || '').indexOf('discord|') === 0;
        if (nuevo && esSocialId) {
          /* Cuentas sociales: Auth0 no permite cambiar el email (lo gestiona
             Google/Discord). No fallamos: generamos el enlace de verificación
             del email ACTUAL y avisamos por qué no se cambió la dirección. */
          notaEmail = 'Tu cuenta entra con ' + (String(info.sub || '').indexOf('google-oauth2|') === 0 ? 'Google' : 'Discord') + ': el email lo gestiona el proveedor y no se puede cambiar desde VANTS. El enlace verifica tu email actual.';
        } else if (nuevo && nuevo.toLowerCase() !== String(info.email || '').toLowerCase()) {
          const up = await fetch('https://' + AUTH0_TENANT + '/api/v2/users/' + encodeURIComponent(info.sub), {
            method: 'PATCH',
            headers: mgmtH,
            body: JSON.stringify({ email: nuevo, email_verified: false }),
          });
          if (!up.ok) {
            const ej = await up.json().catch(() => ({}));
            return json({ ok: false, error: 'no_se_pudo_cambiar', detalle: String((ej.errorDescription || ej.message || ('HTTP ' + up.status))).slice(0, 180) }, 502, { 'Access-Control-Allow-Origin': origin || '*' });
          }
          emailFinal = nuevo;
        }
        const tk = await fetch('https://' + AUTH0_TENANT + '/api/v2/tickets/email-verification', {
          method: 'POST',
          headers: mgmtH,
          body: JSON.stringify({ user_id: info.sub, client_id: AUTH0_SPA_CLIENT_ID, ttl_sec: 259200 }),
        });
        const tj = await tk.json().catch(() => null);
        if (!tk.ok || !tj || !tj.ticket) {
          return json({ ok: false, error: 'ticket' }, 502, { 'Access-Control-Allow-Origin': origin || '*' });
        }
        return json({ ok: true, email: emailFinal, ticket: tj.ticket, nota: notaEmail }, 200, { 'Access-Control-Allow-Origin': origin || '*' });
      } catch (errA) {
        return json({ ok: false, error: 'auth0_inalcanzable' }, 502, { 'Access-Control-Allow-Origin': origin || '*' });
      }
    }

    // --- 7b2c) Cuenta: reset de contraseña vía TICKET de Auth0 (Management API).
    // Igual que la verificación de email: el enlace se crea en el servidor y se
    // devuelve en pantalla, así el jugador no depende de que el correo de Auth0
    // llegue (Spam/proveedores). SEGURIDAD: exige el JWT de la propia sesión —
    // solo puedes pedir el ticket de TU usuario; nadie genera resets para la
    // cuenta de otro. Requiere scopes M2M: create:user_tickets + read:users.
    if (url.pathname === '/api/account/password-reset') {
      if (method !== 'POST') {
        return json({ ok: false, error: 'Solo POST' }, 405, { Allow: 'POST' });
      }
      const origin = request.headers.get('origin') || '';
      if (!SITE_ORIGINS.has(origin)) {
        return json({ ok: false, error: 'Origen no permitido' }, 403, { 'Access-Control-Allow-Origin': origin || '*' });
      }
      const aP = rateLimit(rlAccount, ip, LIMIT_ACCOUNT);
      if (!aP.ok) {
        return json({ ok: false, error: 'Demasiadas peticiones' }, 429, { 'Retry-After': String(aP.retry), 'Access-Control-Allow-Origin': origin || '*' });
      }
      const authzP = request.headers.get('authorization') || '';
      const tokenP = authzP.replace(/^Bearer\s+/i, '').trim();
      if (!tokenP) {
        return json({ ok: false, error: 'sin_sesion' }, 401, { 'Access-Control-Allow-Origin': origin || '*' });
      }
      let infoP = null;
      try {
        const uiP = await fetch('https://' + AUTH0_TENANT + '/userinfo', {
          headers: { [AUTH_HEADER]: 'Bearer ' + tokenP },
        });
        if (uiP.ok) infoP = await uiP.json();
      } catch (eUIP) { infoP = null; }
      if (!infoP || !infoP.sub) {
        return json({ ok: false, error: 'token_invalido' }, 401, { 'Access-Control-Allow-Origin': origin || '*' });
      }
      const mIdP = (env && env.AUTH0_MGMT_CLIENT_ID) || '';
      const mSecP = (env && env.AUTH0_MGMT_CLIENT_SECRET) || '';
      if (!mIdP || !mSecP) {
        return json({ ok: false, error: 'mgmt_no_config' }, 503, { 'Access-Control-Allow-Origin': origin || '*' });
      }
      try {
        const mtP = await fetch('https://' + AUTH0_TENANT + '/oauth/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            grant_type: 'client_credentials',
            client_id: mIdP,
            [SECRET_FIELD]: mSecP,
            audience: 'https://' + AUTH0_TENANT + '/api/v2/',
          }),
        });
        if (!mtP.ok) {
          return json({ ok: false, error: 'mgmt_token' }, 502, { 'Access-Control-Allow-Origin': origin || '*' });
        }
        const mtjP = await mtP.json();
        const mgmtHP = { 'Content-Type': 'application/json', [AUTH_HEADER]: 'Bearer ' + mtjP.access_token };
        const tkP = await fetch('https://' + AUTH0_TENANT + '/api/v2/tickets/password-change', {
          method: 'POST',
          headers: mgmtHP,
          body: JSON.stringify({
            user_id: infoP.sub,
            ttl_sec: 259200,
            resultUrl: 'https://vants.vants.workers.dev/',
          }),
        });
        const tjP = await tkP.json().catch(() => null);
        if (!tkP.ok || !tjP || !tjP.ticket) {
          return json({ ok: false, error: 'ticket', detalle: String((tjP && (tjP.message || tjP.error_description || tjP.error)) || ('HTTP ' + tkP.status)).slice(0, 180) }, 502, { 'Access-Control-Allow-Origin': origin || '*' });
        }
        return json({ ok: true, email: infoP.email || '', ticket: tjP.ticket }, 200, { 'Access-Control-Allow-Origin': origin || '*' });
      } catch (errP) {
        return json({ ok: false, error: 'auth0_inalcanzable' }, 502, { 'Access-Control-Allow-Origin': origin || '*' });
      }
    }

    // --- 7b3) CLIPS DESTACADOS: vitrina pública de los clips de los jugadores.
    // GET (público): manifest con los clips publicados. POST (con sesión JWT):
    // multipart {video, thumb, titulo, juego, nick, username, dur, ext} → crea
    // un release inmutable en el repo de clips (video + miniatura) y actualiza
    // el manifest. DELETE (con sesión JWT, solo el dueño del clip): quita la
    // entrada y borra el release. La propiedad del clip queda atada al sub de
    // la sesión: nadie publica ni borra en nombre de otra cuenta.
    if (url.pathname === '/api/clips/featured') {
      const origin = request.headers.get('origin') || '';
      if (method === 'GET') {
        if (origin && !SITE_ORIGINS.has(origin)) {
          return json({ ok: false, error: 'Origen no permitido' }, 403, { 'Access-Control-Allow-Origin': origin || '*' });
        }
        const c0 = rateLimit(rlClips, ip, 30); // lecturas más frecuentes que subidas
        if (!c0.ok) return json({ ok: false, error: 'Demasiadas peticiones' }, 429, { 'Retry-After': String(c0.retry), 'Access-Control-Allow-Origin': origin || '*' });
        const now0 = Date.now();
        if (featCache.body && now0 - featCache.at < FEAT_TTL_MS) {
          const cf = json(featCache.body, 200);
          cf.headers.set('Access-Control-Allow-Origin', origin || '*');
          cf.headers.set('Cache-Control', 'public, max-age=60');
          return cf;
        }
        try {
          const { clips } = await leerManifest((env && env.GH_CLIPS_TOKEN) || '');
          const payload = { ok: true, clips };
          featCache = { at: now0, body: payload };
          const res0 = json(payload, 200);
          res0.headers.set('Access-Control-Allow-Origin', origin || '*');
          res0.headers.set('Cache-Control', 'public, max-age=60');
          return res0;
        } catch (eF) {
          /* si la lectura falla (p.ej. secret vencido) sirve el caché viejo
             antes que dejar la vitrina ciega */
          if (featCache.body) {
            const cf = json(featCache.body, 200);
            cf.headers.set('Access-Control-Allow-Origin', origin || '*');
            cf.headers.set('Cache-Control', 'public, max-age=60');
            return cf;
          }
          return json({ ok: false, error: 'vitrina_no_disponible' }, 502);
        }
      }
      // POST y DELETE: sesión obligatoria + origen propio + rate limit duro
      if (method !== 'POST' && method !== 'DELETE') {
        return json({ ok: false, error: 'Método no permitido' }, 405, { Allow: 'GET, POST, DELETE, OPTIONS' });
      }
      if (!SITE_ORIGINS.has(origin)) {
        return json({ ok: false, error: 'Origen no permitido' }, 403, { 'Access-Control-Allow-Origin': origin || '*' });
      }
      const cL = rateLimit(rlClips, ip, LIMIT_CLIPS);
      if (!cL.ok) return json({ ok: false, error: 'Demasiadas peticiones' }, 429, { 'Retry-After': String(cL.retry), 'Access-Control-Allow-Origin': origin || '*' });
      const ses = await verifySesionJwt(request);
      if (!ses || !ses.sub) {
        return json({ ok: false, error: 'sin_sesion' }, 401, { 'Access-Control-Allow-Origin': origin || '*' });
      }
      const ghTok = (env && env.GH_CLIPS_TOKEN) || '';
      if (!ghTok) {
        return json({ ok: false, error: 'gh_no_config' }, 503);
      }
      try {
        if (method === 'POST') {
          const len = parseInt(request.headers.get('content-length') || '0', 10);
          if (!len || len > MAX_CLIP_BYTES + 1_500_000) { // vídeo + thumb + forma-data overhead
            return json({ ok: false, error: len ? 'clip_demasiado_grande' : 'cuerpo_vacio' }, 413);
          }
          const form = await request.formData();
          const video = form.get('video');
          const thumb = form.get('thumb');
          if (!video || typeof video === 'string' || !video.size) {
            return json({ ok: false, error: 'falta_video' }, 400);
          }
          if (video.size > MAX_CLIP_BYTES) {
            return json({ ok: false, error: 'clip_demasiado_grande', max_mb: 48 }, 413);
          }
          const ext = CLIPS_EXT.includes(String(form.get('ext') || '').toLowerCase()) ? String(form.get('ext')).toLowerCase() : 'mp4';
          const titulo = nombreLimpio(form.get('titulo') || 'Clip destacado', 80) || 'Clip destacado';
          const juego = nombreLimpio(form.get('juego') || 'VALORANT', 24).toUpperCase();
          const nick = nombreLimpio(form.get('nick') || 'JUGADOR', 24).toUpperCase();
          const username = String(form.get('username') || '').replace(/[^a-z0-9_\-.]/gi, '').slice(0, 32);
          const dur = Math.max(0, Math.min(3600, parseInt(form.get('dur'), 10) || 0));
          if (!thumb || typeof thumb === 'string' || thumb.size > MAX_THUMB_BYTES) {
            return json({ ok: false, error: 'thumb_invalida' }, 400);
          }
          // 1) release BORRADOR (la organización exige borrador: las releases
          //    publicadas son inmutables y no aceptan assets)
          const tag = 'clip-' + Date.now().toString(36);
          const rRel = await fetch(GH_API + '/releases', {
            method: 'POST', headers: await ghHeaders(ghTok),
            body: JSON.stringify({ tag_name: tag, name: titulo.slice(0, 60), body: 'Destacado por ' + nick + ' en la arena VANTS.', draft: true, prerelease: true }),
            signal: AbortSignal.timeout(12000),
          });
          if (!rRel.ok) return json({ ok: false, error: 'release', detalle: await ghDetalle(rRel) }, 502);
          const rel = await rRel.json();
          // 2) subir el VÍDEO como asset binario (octet-stream)
          const vBuf = await video.arrayBuffer();
          const rVid = await fetch('https://uploads.github.com/repos/' + GH_CLIPS_REPO + '/releases/' + rel.id + '/assets?name=clip.' + ext, {
            method: 'POST', headers: { [AUTH_HEADER]: 'Bearer ' + ghTok, 'Content-Type': 'application/octet-stream', 'User-Agent': 'vants-worker' },
            body: vBuf, signal: AbortSignal.timeout(120000),
          });
          if (!rVid.ok) {
            try { await fetch(GH_API + '/releases/' + rel.id, { method: 'DELETE', headers: await ghHeaders(ghTok) }); } catch (e) {}
            return json({ ok: false, error: 'subida_video', detalle: await ghDetalle(rVid) }, 502);
          }
          const vidJ = await rVid.json();
          // 3) subir la MINIATURA como asset
          const tBuf = await thumb.arrayBuffer();
          const rTh = await fetch('https://uploads.github.com/repos/' + GH_CLIPS_REPO + '/releases/' + rel.id + '/assets?name=thumb.jpg', {
            method: 'POST', headers: { [AUTH_HEADER]: 'Bearer ' + ghTok, 'Content-Type': 'application/octet-stream', 'User-Agent': 'vants-worker' },
            body: tBuf, signal: AbortSignal.timeout(20000),
          });
          const thJ = rTh.ok ? await rTh.json() : null;
          // 4) PUBLICAR el release (inmutabilidad activa: nadie lo cambia después)
          const rPub = await fetch(GH_API + '/releases/' + rel.id, {
            method: 'PATCH', headers: await ghHeaders(ghTok), body: JSON.stringify({ draft: false }), signal: AbortSignal.timeout(12000),
          });
          if (!rPub.ok) {
            try { await fetch(GH_API + '/releases/' + rel.id, { method: 'DELETE', headers: await ghHeaders(ghTok) }); } catch (e) {}
            return json({ ok: false, error: 'publicar', detalle: await ghDetalle(rPub) }, 502);
          }
          const pubJ = await rPub.json();
          const assetReal = (n) => {
            const a = (pubJ.assets || []).find((x) => x.name === n);
            return a ? a.browser_download_url : (n === 'clip.' + ext ? vidJ.browser_download_url : (thJ && thJ.browser_download_url) || '');
          };
          // 5) actualizar el manifest (índice de la vitrina)
          const { sha, clips } = await leerManifest(ghTok);
          const entrada = {
            id: tag, sub: ses.sub, username, nick, titulo, juego, ext,
            fecha: new Date().toISOString(), dur, tam: video.size,
            video: assetReal('clip.' + ext), thumb: assetReal('thumb.jpg'),
          };
          clips.unshift(entrada);
          while (clips.length > MAX_MANIFEST_ENTRIES) clips.pop();
          const gOK = await guardarManifest(ghTok, sha, clips);
          if (!gOK) featCache = { at: 0, body: null }; // fuerza relectura en la próxima visita
          featCache = { at: 0, body: null };
          const resP = json({ ok: true, id: tag, video: entrada.video, thumb: entrada.thumb, manifest: gOK });
          resP.headers.set('Access-Control-Allow-Origin', origin);
          return resP;
        }
        // DELETE: solo el dueño del clip (sub de la sesión)
        const idDel = String(url.searchParams.get('id') || '');
        if (!/^clip-[a-z0-9]+$/.test(idDel)) {
          return json({ ok: false, error: 'id_invalido' }, 400);
        }
        const { sha: shaD, clips: clipsD } = await leerManifest(ghTok);
        const objetivo = clipsD.find((c) => c && c.id === idDel);
        if (!objetivo) return json({ ok: false, error: 'no_existe' }, 404);
        if (objetivo.sub !== ses.sub) return json({ ok: false, error: 'no_es_tuyo' }, 403);
        const restantes = clipsD.filter((c) => !(c && c.id === idDel));
        const gD = await guardarManifest(ghTok, shaD, restantes);
        featCache = { at: 0, body: null };
        // borrar release + tag (si la inmutabilidad bloquea el asset, la entrada
        // ya no está en el manifest: el clip desaparece de la vitrina igual)
        try {
          const rFind = await fetch(GH_API + '/releases/tags/' + idDel, { headers: await ghHeaders(ghTok), signal: AbortSignal.timeout(9000) });
          if (rFind.ok) {
            const relD = await rFind.json();
            await fetch(GH_API + '/releases/' + relD.id, { method: 'DELETE', headers: await ghHeaders(ghTok), signal: AbortSignal.timeout(9000) });
            await fetch(GH_API + '/git/refs/tags/' + idDel, { method: 'DELETE', headers: await ghHeaders(ghTok), signal: AbortSignal.timeout(9000) });
          }
        } catch (eDel) {}
        const resD = json({ ok: true, manifest: gD });
        resD.headers.set('Access-Control-Allow-Origin', origin);
        return resD;
      } catch (eC) {
        return json({ ok: false, error: 'clips_error' }, 502);
      }
    }

    // --- 7c) GPR · Global Power Rankings en vivo (página oficial de Riot)
    if (url.pathname === '/api/gpr') {
      if (method !== 'GET') {
        return json({ ok: false, error: 'Solo GET' }, 405, { Allow: 'GET' });
      }
      /* Origen vacío = fetch same-origin (el navegador no manda Origin en un GET
         same-origin): se permite. Origen presente y ajeno → fuera. */
      const origin = request.headers.get('origin') || '';
      if (origin && !SITE_ORIGINS.has(origin)) {
        return json({ ok: false, error: 'Origen no permitido' }, 403, { 'Access-Control-Allow-Origin': origin || '*' });
      }
      const g = rateLimit(rlGpr, ip, LIMIT_GPR);
      if (!g.ok) {
        return json({ ok: false, error: 'Demasiadas peticiones' }, 429, { 'Retry-After': String(g.retry), 'Access-Control-Allow-Origin': origin || '*' });
      }
      const payload = await handleGpr();
      const res = json(payload, payload.ok ? 200 : 502);
      res.headers.set('Access-Control-Allow-Origin', origin || '*');
      res.headers.set('Cache-Control', 'public, max-age=3600');
      return res;
    }

    // --- 8) Resto: archivos estáticos con cabeceras de seguridad
    if (env.ASSETS) {
      const res = await env.ASSETS.fetch(request);
      return harden(new Response(res.body, res));
    }

    return txt(404, 'Not found');
  },
};
