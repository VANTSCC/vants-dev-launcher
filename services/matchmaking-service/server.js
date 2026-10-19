// ============================================
// VANTS — matchmaking-service (Fastify) · Fase 2/4
// --------------------------------------------
// Cola de matchmaking con tickets. Estado actual: cola EN MEMORIA (placeholder
// funcional y reiniciable); la Fase 4 la persiste en Neon (tablas del árbol
// objetivo del doc de arquitectura, sin duplicar existentes).
// Reglas de la casa:
//  · JSON siempre; errores con forma { ok:false, error:{ message } }.
//  · express está instalado como decisión del dueño (rutas secundarias o
//    compatibilidad); este servicio usa Fastify por rendimiento y logging.
//  · Validación estricta de entrada; sin PII en logs.
// ============================================
const fastify = require('fastify')({
  logger: { level: process.env.LOG_LEVEL || 'info' },
  trustProxy: true,
});

const APP = 'matchmaking-service';
const VERSION = '0.1.0';
const PORT = process.env.PORT || 8081;
const ALLOW_ORIGIN = process.env.ALLOW_ORIGIN || 'https://vants.vants.workers.dev';
const TICKET_TTL_MS = 10 * 60 * 1000; // ticket caduca en 10 min

// --- Cola en memoria ---
const queue = new Map(); // ticket -> { sub, game, mode, region, enqueued_at }
const t0 = Date.now();

// --- CORS cerrado (hook, sin dependencias extra) ---
fastify.addHook('onRequest', (req, reply, done) => {
  reply.header('Access-Control-Allow-Origin', ALLOW_ORIGIN);
  reply.header('Vary', 'Origin');
  reply.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  reply.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return reply.code(204).send();
  done();
});

fastify.get('/healthz', async () => ({
  ok: true,
  service: APP,
  version: VERSION,
  uptime: Math.round((Date.now() - t0) / 1000),
  queued: queue.size,
}));

// Entrar en la cola: { game:"valorant", mode:"duo"|"team", region:"EU" }
// auth: Authorization: Bearer <Auth0 token> — la validación real llega en Fase 4
// con el JWT en el servidor (docs/ARCHITECTURE.md §6).
fastify.post('/api/v1/matchmaking/queue', async (req, reply) => {
  const body = req.body || {};
  const { game, mode, region } = body;
  if (!game || typeof game !== 'string') {
    return reply.code(400).send({ ok: false, error: { message: 'game requerido' } });
  }
  const ticket = 'MM-' + Math.random().toString(36).slice(2, 10).toUpperCase();
  queue.set(ticket, {
    game: String(game).slice(0, 40),
    mode: String(mode || 'duo').slice(0, 20),
    region: String(region || 'EU').slice(0, 8),
    sub: null, // Fase 4: sub del JWT validado
    enqueued_at: new Date().toISOString(),
  });
  req.log.info({ ticket, game }, 'ticket encolado');
  return reply.code(201).send({ ok: true, data: { ticket, position: queue.size, ttl_ms: TICKET_TTL_MS } });
});

// Consultar ticket
fastify.get('/api/v1/matchmaking/queue/:ticket', async (req, reply) => {
  const t = queue.get(req.params.ticket);
  if (!t) return reply.code(404).send({ ok: false, error: { message: 'ticket no encontrado o caducado' } });
  return { ok: true, data: { ticket: req.params.ticket, ...t, position: queue.size } };
});

// Salir de la cola
fastify.delete('/api/v1/matchmaking/queue/:ticket', async (req, reply) => {
  const gone = queue.delete(req.params.ticket);
  if (!gone) return reply.code(404).send({ ok: false, error: { message: 'ticket no encontrado' } });
  return { ok: true, data: { removed: req.params.ticket } };
});

// Limpieza periódica de tickets caducados
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of queue) {
    if (now - Date.parse(v.enqueued_at) > TICKET_TTL_MS) queue.delete(k);
  }
}, 60_000).unref();

fastify.listen({ port: Number(PORT), host: '0.0.0.0' }).then(() => {
  fastify.log.info(`${APP} v${VERSION} en :${PORT} (CORS → ${ALLOW_ORIGIN})`);
}).catch((err) => {
  fastify.log.error(err);
  process.exit(1);
});
