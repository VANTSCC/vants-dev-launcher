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
 */

const COLORS = {
  rojo: 0xff0d2e,
  violeta: 0xb44cff,
  twitch: 0x9146ff,
  oro: 0xf5c044,
};

/* ==================== SEGURIDAD: CONFIGURACIÓN ==================== */

// Orígenes desde los que se permite llamar a la API interna.
// ⚠️ vants.gg ya está en la lista: funcionará en cuanto conectes el dominio
// al Worker (panel -> Workers & Pages -> vants -> Dominios y rutas).
// Si agregas otro dominio propio, añádelo aquí también.
const SITE_ORIGINS = new Set([
  'https://vants.geimerjhoan099.workers.dev',
  'https://feispla.github.io',
  'https://vants.gg',
  'https://www.vants.gg',
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
const WINDOW_MS = 60_000;    // ventana de 1 minuto
const MAX_BODY_NOTIFY = 8192; // máximo 8 KB por notificación

const rlGeneral = new Map();
const rlNotify = new Map();

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
      if (url.pathname === '/api/discord/notify' && SITE_ORIGINS.has(origin)) {
        return harden(new Response(null, { status: 204 }), {
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

    // --- 7) Resto: archivos estáticos con cabeceras de seguridad
    if (env.ASSETS) {
      const res = await env.ASSETS.fetch(request);
      return harden(new Response(res.body, res));
    }

    return txt(404, 'Not found');
  },
};
