// ============================================
// VANTS — matchmaking-service (Fastify) · Fase 2/4
// --------------------------------------------
// Cola de matchmaking con tickets autenticados. Estado actual: cola EN MEMORIA
// (placeholder funcional y reiniciable); la Fase 4 la persiste en Neon (tablas
// del árbol objetivo del doc de arquitectura, sin duplicar existentes).
// Reglas de la casa:
//  · JSON siempre; errores con forma { ok:false, error:{ message } }.
//  · express está instalado como decisión del dueño (rutas secundarias o
//    compatibilidad); este servicio usa Fastify por rendimiento y logging.
//  · Identidad: JWT de Auth0 (RS256) verificado por JWKS en el servidor
//    (docs/ARCHITECTURE.md §6: tokens validados en el servidor, nunca confiar
//    en el cliente). El sub queda guardado en el ticket.
// ============================================
const fastify = require('fastify')({
  logger: { level: process.env.LOG_LEVEL || 'info' },
  trustProxy: true,
});
const { crearAuthVerifier } = require('./auth');

const APP = 'matchmaking-service';
const VERSION = '0.2.0';
const PORT = process.env.PORT || 8081;
const ALLOW_ORIGIN = process.env.ALLOW_ORIGIN || 'https://vants.vants.workers.dev';
const TICKET_TTL_MS = 10 * 60 * 1000; // ticket caduca en 10 min
const auth = crearAuthVerifier({});

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

// --- Identidad: valida el Bearer JWT de Auth0 en las rutas de matchmaking ---
async function requireAuth(req, reply) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
  const res = await auth.verify(token);
  if (!res.ok) {
    req.log.warn({ err: res.error }, 'auth rechazada');
    reply.code(401).send({ ok: false, error: { message: 'Autenticación requerida' } });
    return false;
  }
  req.sub = res.sub; // identidad verificada (auth0|...)
  return true;
}

fastify.get('/healthz', async () => ({
  ok: true,
  service: APP,
  version: VERSION,
  uptime: Math.round((Date.now() - t0) / 1000),
  queued: queue.size,
}));

// Entrar en la cola: { game:"valorant", mode:"duo"|"team", region:"EU" }
// Requiere Authorization: Bearer <JWT Auth0>. La elegibilidad (rango, sanciones,
// región) se aplicará en Fase 4 contra Neon; hoy: identidad verificada + cola.
fastify.post('/api/v1/matchmaking/queue', async (req, reply) => {
  if (!(await requireAuth(req, reply))) return;
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
    sub: req.sub, // identidad Auth0 verificada por firma
    enqueued_at: new Date().toISOString(),
  });
  req.log.info({ ticket, game }, 'ticket encolado');
  return reply.code(201).send({ ok: true, data: { ticket, position: queue.size, ttl_ms: TICKET_TTL_MS } });
});

// Consultar ticket (solo el dueño del ticket puede verlo)
fastify.get('/api/v1/matchmaking/queue/:ticket', async (req, reply) => {
  if (!(await requireAuth(req, reply))) return;
  const t = queue.get(req.params.ticket);
  if (!t) return reply.code(404).send({ ok: false, error: { message: 'ticket no encontrado o caducado' } });
  if (t.sub !== req.sub) return reply.code(403).send({ ok: false, error: { message: 'ticket de otro jugador' } });
  return { ok: true, data: { ticket: req.params.ticket, ...t, position: queue.size } };
});

// Salir de la cola (solo el dueño del ticket)
fastify.delete('/api/v1/matchmaking/queue/:ticket', async (req, reply) => {
  if (!(await requireAuth(req, reply))) return;
  const t = queue.get(req.params.ticket);
  if (!t) return reply.code(404).send({ ok: false, error: { message: 'ticket no encontrado' } });
  if (t.sub !== req.sub) return reply.code(403).send({ ok: false, error: { message: 'ticket de otro jugador' } });
  queue.delete(req.params.ticket);
  return { ok: true, data: { removed: req.params.ticket } };
});

// ¿Quién soy? (diagnóstico de sesión para el hub/launcher)
fastify.get('/api/v1/me', async (req, reply) => {
  if (!(await requireAuth(req, reply))) return;
  return { ok: true, data: { sub: req.sub } };
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
