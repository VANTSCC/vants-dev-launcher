// ============================================
// VANTS — api-gateway (Express) · Fase 2/4
// --------------------------------------------
// Puerta única /api/v1 para los servicios de dominio. Reglas de la casa:
//  · JSON siempre; errores con forma { ok:false, error:{ message } }.
//  · Rate limit simple en memoria (ventana fija) — sin dependencias extra.
//  · CORS cerrado: solo ALLOW_ORIGIN (por defecto el dominio del Worker).
//  · fastify está instalado como decisión del dueño (usos futuros: tests con
//    fastify.inject, servicio interno); este servicio usa Express.
// ============================================
const express = require('express');

const APP = 'api-gateway';
const VERSION = '0.1.0';
const PORT = process.env.PORT || 8080;
const ALLOW_ORIGIN = process.env.ALLOW_ORIGIN || 'https://vants.vants.workers.dev';
const WINDOW_MS = 60_000;
const MAX_REQ = 120; // req por IP y ventana

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '256kb' }));

// --- CORS cerrado ---
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', ALLOW_ORIGIN);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});

// --- Rate limit en memoria (ventana fija) ---
const hits = new Map(); // ip -> [timestamps]
app.use((req, res, next) => {
  const ip = req.ip || 'unknown';
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  arr.push(now);
  hits.set(ip, arr);
  if (hits.size > 5000) hits.clear(); // higiene de memoria
  if (arr.length > MAX_REQ) {
    return res.status(429).json({ ok: false, error: { message: 'Demasiadas peticiones' } });
  }
  next();
});

// --- Log mínimo con id de petición ---
app.use((req, res, next) => {
  req.id = Math.random().toString(36).slice(2, 10);
  res.setHeader('X-Request-Id', req.id);
  console.log(`[${req.id}] ${req.method} ${req.url}`);
  next();
});

const t0 = Date.now();
app.get('/healthz', (req, res) => {
  res.json({ ok: true, service: APP, version: VERSION, uptime: Math.round((Date.now() - t0) / 1000) });
});

app.get('/api/v1/status', (req, res) => {
  res.json({
    ok: true,
    data: {
      gateway: VERSION,
      services: {
        auth: 'worker',        // vive en vants-server/worker.js (Auth0)
        players: 'worker',
        ranked: 'worker',
        matchmaking: 'http://localhost:8081', // matchmaking-service (Fastify)
      },
    },
  });
});

// 404 JSON
app.use((req, res) => {
  res.status(404).json({ ok: false, error: { message: 'No encontrado' } });
});

// Manejador de errores final
app.use((err, req, res, next) => {
  console.error(`[${req.id}]`, err && err.message);
  res.status(err.status || 500).json({ ok: false, error: { message: 'Error interno' } });
});

app.listen(PORT, () => {
  console.log(`${APP} v${VERSION} en http://localhost:${PORT} (CORS → ${ALLOW_ORIGIN})`);
});
