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

// Tenant Auth0 del sitio (misma configuración que assets/js/auth0-config.js)
const AUTH0_TENANT = 'vants.eu.auth0.com';
const AUTH0_SPA_CLIENT_ID = 'oaOmNizh7HrASWfmfM29bN284IMJvqPG';

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
  if (token) h.Authorization = 'Bearer ' + token;
  return h;
}
async function leerManifest(token) {
  const r = await fetch(GH_API + '/contents/manifest.json', { headers: await ghHeaders(token), signal: AbortSignal.timeout(9000) });
  if (r.status === 404) return { sha: null, clips: [] };
  if (!r.ok) throw new Error('manifest ' + r.status);
  const j = await r.json();
  let clips = [];
  try { clips = JSON.parse(b64ToUtf8(j.content || '')); } catch (e) { clips = []; }
  if (!Array.isArray(clips)) clips = [];
  return { sha: j.sha || null, clips };
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
          Authorization: `Bot ${env.DISCORD_TOKEN}`,
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
      { headers: { Authorization: `Bot ${token}`, Accept: 'application/json' } }
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
  async fetch(request, env) {
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
      const isGetApi = url.pathname === '/api/valorant/esports' || url.pathname === '/api/teams' || url.pathname === '/api/gpr' || url.pathname === '/api/clips/featured';
      const isPostApi = url.pathname === '/api/discord/notify' || url.pathname === '/api/account/email-verify' || url.pathname === '/api/clips/featured';
      if ((isPostApi || isGetApi) && SITE_ORIGINS.has(origin)) {
        return harden(new Response(null, { status: 204 }), {
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Methods': url.pathname === '/api/clips/featured' ? 'GET, POST, DELETE, OPTIONS' : (isGetApi ? 'GET, OPTIONS' : 'POST, OPTIONS'),
          'Access-Control-Allow-Headers': isPostApi ? 'Content-Type, Authorization' : 'Content-Type',
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
        return json({ ok: false, error: 'Origen no permitido' }, 403);
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

    // --- 7) Agenda esports de Valorant (datos reales, api.henrikdev.xyz)
    if (url.pathname === '/api/valorant/esports') {
      if (method !== 'GET') {
        return json({ ok: false, error: 'Solo GET' }, 405, { Allow: 'GET' });
      }
      /* Origen vacío = fetch same-origin (el navegador no manda Origin en un GET
         same-origin): se permite. Origen presente y ajeno → fuera. */
      const origin = request.headers.get('origin') || '';
      if (origin && !SITE_ORIGINS.has(origin)) {
        return json({ ok: false, error: 'Origen no permitido' }, 403);
      }
      const e = rateLimit(rlEsports, ip, LIMIT_ESPORTS);
      if (!e.ok) {
        return json({ ok: false, error: 'Demasiadas peticiones' }, 429, { 'Retry-After': String(e.retry) });
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
          headers: { Authorization: key, Accept: 'application/json' },
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
        return json({ ok: false, error: 'Origen no permitido' }, 403);
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
        return json({ ok: false, error: 'Origen no permitido' }, 403);
      }
      const a = rateLimit(rlAccount, ip, LIMIT_ACCOUNT);
      if (!a.ok) {
        return json({ ok: false, error: 'Demasiadas peticiones' }, 429, { 'Retry-After': String(a.retry) });
      }
      const authz = request.headers.get('authorization') || '';
      const token = authz.replace(/^Bearer\s+/i, '').trim();
      if (!token) {
        return json({ ok: false, error: 'sin_sesion' }, 401);
      }
      let info = null;
      try {
        const ui = await fetch('https://' + AUTH0_TENANT + '/userinfo', {
          headers: { Authorization: 'Bearer ' + token },
        });
        if (ui.ok) info = await ui.json();
      } catch (eUI) { info = null; }
      if (!info || !info.sub) {
        return json({ ok: false, error: 'token_invalido' }, 401);
      }
      const body = await request.json().catch(() => ({}));
      const nuevo = String((body && body.nuevo_email) || '').trim();
      if (nuevo && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(nuevo)) {
        return json({ ok: false, error: 'email_invalido' }, 400);
      }
      const mId = (env && env.AUTH0_MGMT_CLIENT_ID) || '';
      const mSec = (env && env.AUTH0_MGMT_CLIENT_SECRET) || '';
      if (!mId || !mSec) {
        return json({ ok: false, error: 'mgmt_no_config' }, 503);
      }
      try {
        const mt = await fetch('https://' + AUTH0_TENANT + '/oauth/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            grant_type: 'client_credentials',
            client_id: mId,
            client_secret: mSec,
            audience: 'https://' + AUTH0_TENANT + '/api/v2/',
          }),
        });
        if (!mt.ok) {
          return json({ ok: false, error: 'mgmt_token' }, 502);
        }
        const mtj = await mt.json();
        const mgmtH = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + mtj.access_token };
        let emailFinal = info.email || '';
        if (nuevo && nuevo.toLowerCase() !== String(info.email || '').toLowerCase()) {
          const up = await fetch('https://' + AUTH0_TENANT + '/api/v2/users/' + encodeURIComponent(info.sub), {
            method: 'PATCH',
            headers: mgmtH,
            body: JSON.stringify({ email: nuevo, email_verified: false }),
          });
          if (!up.ok) {
            const ej = await up.json().catch(() => ({}));
            return json({ ok: false, error: 'no_se_pudo_cambiar', detalle: String((ej.errorDescription || ej.message || ('HTTP ' + up.status))).slice(0, 180) }, 502);
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
          return json({ ok: false, error: 'ticket' }, 502);
        }
        return json({ ok: true, email: emailFinal, ticket: tj.ticket });
      } catch (errA) {
        return json({ ok: false, error: 'auth0_inalcanzable' }, 502);
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
          return json({ ok: false, error: 'Origen no permitido' }, 403);
        }
        const c0 = rateLimit(rlClips, ip, 30); // lecturas más frecuentes que subidas
        if (!c0.ok) return json({ ok: false, error: 'Demasiadas peticiones' }, 429, { 'Retry-After': String(c0.retry) });
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
          return json({ ok: false, error: 'vitrina_no_disponible' }, 502);
        }
      }
      // POST y DELETE: sesión obligatoria + origen propio + rate limit duro
      if (method !== 'POST' && method !== 'DELETE') {
        return json({ ok: false, error: 'Método no permitido' }, 405, { Allow: 'GET, POST, DELETE, OPTIONS' });
      }
      if (!SITE_ORIGINS.has(origin)) {
        return json({ ok: false, error: 'Origen no permitido' }, 403);
      }
      const cL = rateLimit(rlClips, ip, LIMIT_CLIPS);
      if (!cL.ok) return json({ ok: false, error: 'Demasiadas peticiones' }, 429, { 'Retry-After': String(cL.retry) });
      const ses = await verifySesionJwt(request);
      if (!ses || !ses.sub) {
        return json({ ok: false, error: 'sin_sesion' }, 401);
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
          if (!rRel.ok) return json({ ok: false, error: 'release' }, 502);
          const rel = await rRel.json();
          // 2) subir el VÍDEO como asset binario (octet-stream)
          const vBuf = await video.arrayBuffer();
          const rVid = await fetch('https://uploads.github.com/repos/' + GH_CLIPS_REPO + '/releases/' + rel.id + '/assets?name=clip.' + ext, {
            method: 'POST', headers: { Authorization: 'Bearer ' + ghTok, 'Content-Type': 'application/octet-stream', 'User-Agent': 'vants-worker' },
            body: vBuf, signal: AbortSignal.timeout(120000),
          });
          if (!rVid.ok) {
            try { await fetch(GH_API + '/releases/' + rel.id, { method: 'DELETE', headers: await ghHeaders(ghTok) }); } catch (e) {}
            return json({ ok: false, error: 'subida_video' }, 502);
          }
          const vidJ = await rVid.json();
          // 3) subir la MINIATURA como asset
          const tBuf = await thumb.arrayBuffer();
          const rTh = await fetch('https://uploads.github.com/repos/' + GH_CLIPS_REPO + '/releases/' + rel.id + '/assets?name=thumb.jpg', {
            method: 'POST', headers: { Authorization: 'Bearer ' + ghTok, 'Content-Type': 'application/octet-stream', 'User-Agent': 'vants-worker' },
            body: tBuf, signal: AbortSignal.timeout(20000),
          });
          const thJ = rTh.ok ? await rTh.json() : null;
          // 4) PUBLICAR el release (inmutabilidad activa: nadie lo cambia después)
          const rPub = await fetch(GH_API + '/releases/' + rel.id, {
            method: 'PATCH', headers: await ghHeaders(ghTok), body: JSON.stringify({ draft: false }), signal: AbortSignal.timeout(12000),
          });
          if (!rPub.ok) {
            try { await fetch(GH_API + '/releases/' + rel.id, { method: 'DELETE', headers: await ghHeaders(ghTok) }); } catch (e) {}
            return json({ ok: false, error: 'publicar' }, 502);
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
        return json({ ok: false, error: 'Origen no permitido' }, 403);
      }
      const g = rateLimit(rlGpr, ip, LIMIT_GPR);
      if (!g.ok) {
        return json({ ok: false, error: 'Demasiadas peticiones' }, 429, { 'Retry-After': String(g.retry) });
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
