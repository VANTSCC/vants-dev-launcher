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
const WINDOW_MS = 60_000;    // ventana de 1 minuto
const MAX_BODY_NOTIFY = 8192; // máximo 8 KB por notificación

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
    const allowedMethods = ['GET', 'HEAD', 'POST', 'OPTIONS'];
    if (!allowedMethods.includes(method)) {
      return txt(405, 'Método no permitido', { Allow: 'GET, HEAD, POST, OPTIONS' });
    }

    // --- 2) Pre-flight CORS solo para la API propia
    if (method === 'OPTIONS') {
      const origin = request.headers.get('origin') || '';
      const isGetApi = url.pathname === '/api/valorant/esports' || url.pathname === '/api/teams' || url.pathname === '/api/gpr';
      if ((url.pathname === '/api/discord/notify' || isGetApi) && SITE_ORIGINS.has(origin)) {
        return harden(new Response(null, { status: 204 }), {
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Methods': isGetApi ? 'GET, OPTIONS' : 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
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
