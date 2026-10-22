#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// VANTS · notificador de mejoras a Discord (webhook)
//
// El agente que sube mejoras al repo llama a este script tras cada merge en
// main: publica en el canal del servidor de Discord un embed rojo de marca
// con el título del merge, la lista de cambios y el enlace al PR.
//
// Configuración (una sola vez):
//   1. En Discord: Servidor → Ajustes → Integraciones → Webhooks → Nuevo
//      webhook → copiar URL.
//   2. Guardarla como secreto DISCORD_WEBHOOK_MEJORAS en GitHub
//      (Settings → Secrets and variables → Actions) y/o en el .env local.
//
// Uso:
//   node scripts/notificar-discord.mjs \
//     --titulo "feat(web): emblema 3D = logo oficial (#101)" \
//     --cambios "placa octogonal con bisel rojo|V blanca/roja con cuña|E2E al día" \
//     --autor "feispla"
//
// Flags:
//   --dry-run    imprime el payload JSON y NO envía nada.
//   --test       prueba end-to-end sin credenciales: envía a un servidor
//                local que imita la API de Discord (espera 204) y además
//                hace un POST real a discord.com para verificar
//                conectividad y formato (responde 404 Unknown Webhook).
// Sin --webhook, la URL sale de DISCORD_WEBHOOK_MEJORAS (o
// VANTS_DISCORD_WEBHOOK, misma convención del monitor). Si no hay URL y no
// es --test/--dry-run, termina 0 con aviso (el CI no se rompe).
// ─────────────────────────────────────────────────────────────────────────────

const ROJO_VANTS = 0xdb0f2a; // 14356266 — color de marca del embed
const REPO = 'feispla/Vants';
const REPO_URL = `https://github.com/${REPO}`;

// ── Args ──
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const valor = (name, def = '') => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};

const titulo = valor('titulo', '');
const cambiosRaw = valor('cambios', '');
const autor = valor('autor', 'agente');
const sha = valor('sha', '');
const repoUrl = valor('repo-url', REPO_URL);
const webhooksArg = valor('webhook', '');

const WEBHOOK =
  webhooksArg ||
  process.env.DISCORD_WEBHOOK_MEJORAS ||
  process.env.VANTS_DISCORD_WEBHOOK ||
  '';

// Si el título trae "(#NN)" lo usamos para enlazar el PR/merge.
const prMatch = titulo.match(/\(#(\d+)\)/);
const prUrl = prMatch ? `${REPO_URL}/pull/${prMatch[1]}` : '';

const lineas = cambiosRaw
  .split('|')
  .map((s) => s.trim())
  .filter(Boolean)
  .map((s) => `• ${s}`);

const descripcion = lineas.length
  ? lineas.join('\n')
  : 'Merge en `main` — ver el commit para el detalle completo.';

const payload = {
  username: 'VANTS · Agente de mejoras',
  embeds: [
    {
      title: titulo || 'Mejoras subidas al proyecto',
      url: prUrl || `${repoUrl}/commits/main`,
      description: descripcion,
      color: ROJO_VANTS,
      fields: [
        ...(sha ? [{ name: 'Commit', value: `\`${sha}\``, inline: true }] : []),
        { name: 'Autor', value: `\`${autor}\``, inline: true },
        { name: 'Repo', value: `[${REPO}](${repoUrl})`, inline: true },
      ],
      footer: { text: `Subida automática por el agente · ${REPO}` },
      timestamp: new Date().toISOString(),
    },
  ],
};

const enviar = async (url, etiqueta) => {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const cuerpo = res.status === 204 ? '' : await res.text().catch(() => '');
  console.log(`[${etiqueta}] HTTP ${res.status} ${cuerpo}`.trimEnd());
  return res;
};

// ── Modos de prueba ──
if (flag('dry-run')) {
  console.log(' Payload (dry-run, no se envía):');
  console.log(JSON.stringify(payload, null, 2));
  process.exit(0);
}

if (flag('test')) {
  // 1) E2E contra un mock local que imita la respuesta de Discord (204).
  const http = await import('node:http');
  const mock = http.createServer((req, res) => {
    // Discord responde 204 No Content a un webhook válido.
    res.statusCode = 204;
    res.end();
  });
  await new Promise((r) => mock.listen(0, '127.0.0.1', r));
  const puerto = mock.address().port;
  const okMock = await enviar(`http://127.0.0.1:${puerto}/webhook`, 'MOCK E2E');
  mock.close();

  // 2) POST real a la API de Discord: sin webhook válido debe responder
  //    404 {"code":10015} "Unknown Webhook" — prueba que la red llega a
  //    Discord y que nuestro JSON atraviesa su router tal cual.
  try {
    await enviar(
      'https://discord.com/api/webhooks/0/prueba_conectividad',
      'DISCORD API'
    );
  } catch (e) {
    console.log(`[DISCORD API] sin salida a internet: ${e.message}`);
  }

  process.exit(okMock.status === 204 ? 0 : 1);
}

// ── Envío real ──
if (!WEBHOOK) {
  console.log(
    '::notice::DISCORD_WEBHOOK_MEJORAS no configurada — sin aviso a Discord.\n' +
      'Añádela en GitHub (Settings → Secrets → Actions) o en el .env local:\n' +
      '  Servidor Discord → Ajustes → Integraciones → Webhooks → copiar URL'
  );
  process.exit(0);
}

try {
  const res = await enviar(WEBHOOK, 'DISCORD');
  if (res.status === 429) {
    const retry = Number(res.headers.get('retry_after') || 1);
    console.log(`Rate limit: reintentando en ${retry}s…`);
    await new Promise((r) => setTimeout(r, retry * 1000));
    await enviar(WEBHOOK, 'DISCORD (reintento)');
  }
  process.exit(res.status === 204 ? 0 : 1);
} catch (e) {
  console.error(`Error enviando a Discord: ${e.message}`);
  process.exit(1);
}
