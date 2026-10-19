// ============================================
// VANTS — matchmaking-service (Fastify) · Fase 4
// --------------------------------------------
// Cola de matchmaking CON PERSISTENCIA (Neon, migración 21):
//   · Tickets autenticados (JWT Auth0 RS256 por JWKS, auth.js).
//   · Elegibilidad: el sub debe existir en players (Neon).
//   · Emparejamiento atómico: mm_intentar_emparejar (SKIP LOCKED);
//     tamaños duo=2 (1v1) y team=10 (5v5).
//   · Prevención de duplicados: índice único parcial (sub, game)
//     sobre tickets activos — reencolar devuelve el ticket vivo.
//   · Partidas: consulta para participantes y reporte de resultado
//     (primer reporte gana; verificación FACEIT + RR: próximo paso).
//
// Reglas de la casa:
//   · JSON siempre; errores con forma { ok:false, error:{ message } }.
//   · express está instalado como decisión del dueño (este servicio
//     usa Fastify por rendimiento y logging).
//   · Sin DATABASE_URL el servicio arranca en modo memoria (degradado,
//     con aviso) para no romper desarrollo local ni tests.
// ============================================
const fastify = require('fastify');
const { Pool } = require('pg');
const { crearAuthVerifier } = require('./auth');
const { crearStoreMemoria, crearStorePg } = require('./store');

const APP = 'matchmaking-service';
const VERSION = '0.5.0';
const PORT = process.env.PORT || 8081;
const ALLOW_ORIGIN = process.env.ALLOW_ORIGIN || 'https://vants.vants.workers.dev';
const TICKET_TTL_MS = 10 * 60 * 1000; // ticket caduca en 10 min
const MODOS = { duo: 2, team: 10 };   // tamaño de grupo por modo

/**
 * construir(opts) → instancia Fastify (sin escuchar).
 *  opts.store → store inyectable (tests); por defecto pg si hay
 *               DATABASE_URL, si no memoria.
 *  opts.auth  → verificador inyectable (tests).
 */
function construir(opts = {}) {
  const app = fastify({
    logger: { level: process.env.LOG_LEVEL || 'info' },
    trustProxy: true,
  });

  // pg SOLO con cadena postgres:// (evita placeholders tipo file: del entorno);
  // si no hay, modo memoria (degradado: los datos viven solo en el proceso).
  const store = opts.store || (process.env.DATABASE_URL && /^postgres(ql)?:\/\//.test(process.env.DATABASE_URL)
    ? crearStorePg(new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 5 }))
    : crearStoreMemoria({}));

  const auth = opts.auth || crearAuthVerifier({});

  // --- CORS cerrado (hook, sin dependencias extra) ---
  app.addHook('onRequest', (req, reply, done) => {
    reply.header('Access-Control-Allow-Origin', ALLOW_ORIGIN);
    reply.header('Vary', 'Origin');
    reply.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    reply.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') return reply.code(204).send();
    done();
  });

  // --- Identidad: valida el Bearer JWT de Auth0 ---
  async function requireAuth(req, reply) {
    const h = req.headers.authorization || '';
    const token = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
    const res = await auth.verify(token);
    if (!res.ok) {
      req.log.warn({ err: res.error }, 'auth rechazada');
      reply.code(401).send({ ok: false, error: { message: 'Autenticación requerida' } });
      return false;
    }
    req.sub = res.sub; // identidad Auth0 verificada por firma
    return true;
  }

  // Red de seguridad: si el store (BD) lanza, respuesta JSON limpia 503.
  const guard = (fn) => async (req, reply) => {
    try {
      return await fn(req, reply);
    } catch (e) {
      req.log.error({ err: e.code || e.message }, 'error de almacenamiento');
      return reply.code(503).send({ ok: false, error: { message: 'Servicio de datos no disponible, intentá de nuevo' } });
    }
  };

  app.get('/healthz', async () => {
    // Nunca 500: si la BD no responde, se reporta degradado (útil en local
    // con un DATABASE_URL fantasma y en producción para monitoreo).
    let db = 'ok';
    let queued = null;
    try {
      queued = await store.encolados();
    } catch (e) {
      db = 'error';
      app.log.warn({ err: e.code || e.message }, 'healthz: BD no disponible');
    }
    return { ok: true, service: APP, version: VERSION, store: store.tipo, db, queued };
  });

  // Entrar en la cola: { game:"valorant", mode:"duo"|"team", region:"EU" }
  // 201 con el ticket (reencolar devuelve el ticket vivo, nunca duplica);
  // 403 si el sub no existe en players (no elegible).
  app.post('/api/v1/matchmaking/queue', guard(async (req, reply) => {
    if (!(await requireAuth(req, reply))) return;
    const body = req.body || {};
    const game = String(body.game || '').trim().slice(0, 40);
    const mode = String(body.mode || 'duo').trim().slice(0, 20);
    const region = String(body.region || 'EU').trim().slice(0, 8);
    if (!game) return reply.code(400).send({ ok: false, error: { message: 'game requerido' } });
    if (!MODOS[mode]) {
      return reply.code(400).send({ ok: false, error: { message: `mode inválido (usá: ${Object.keys(MODOS).join(', ')})` } });
    }

    const elig = await store.elegible(req.sub);
    if (!elig.ok) {
      return reply.code(403).send({ ok: false, error: { message: 'Perfil de jugador no elegible: creá tu perfil en VANTS primero' } });
    }

    const ticket = 'MM-' + Math.random().toString(36).slice(2, 10).toUpperCase();
    const res = await store.encolar({ ticket, sub: req.sub, game, mode, region, ttl_ms: TICKET_TTL_MS });
    if (!res.ok) {
      return reply.code(500).send({ ok: false, error: { message: 'No se pudo encolar' } });
    }

    // Intento de emparejamiento inmediato (atómico; si aún no completa
    // el grupo, el ticket queda 'queued' y el próximo intento empareja).
    const tam = MODOS[mode];
    let matchId = null;
    try {
      matchId = await store.emparejar(game, mode, region, tam);
    } catch (e) {
      req.log.error({ err: e.message }, 'emparejador falló (el ticket sigue en cola)');
    }

    const fila = await store.ticket(res.ticket);
    const position = await store.posicion(res.ticket);
    req.log.info({ ticket: res.ticket, game, reutilizado: res.reutilizado, match: matchId }, 'ticket en cola');
    return reply.code(res.reutilizado ? 200 : 201).send({
      ok: true,
      data: {
        ticket: res.ticket,
        reutilizado: res.reutilizado,
        // Si reutiliza, el ticket activo conserva su modo/región originales:
        // para cambiarlos, DELETE del ticket y POST de nuevo.
        game: fila ? fila.game : game,
        mode: fila ? fila.mode : mode,
        region: fila ? fila.region : region,
        position,
        ttl_ms: TICKET_TTL_MS,
        expires_at: fila ? fila.expires_at : null,
        match_id: (fila && fila.status === 'matched' && fila.match_id) ? fila.match_id : matchId,
      },
    });
  }));

  // Consultar ticket (solo el dueño)
  app.get('/api/v1/matchmaking/queue/:ticket', guard(async (req, reply) => {
    if (!(await requireAuth(req, reply))) return;
    const t = await store.ticket(req.params.ticket);
    if (!t) return reply.code(404).send({ ok: false, error: { message: 'ticket no encontrado o caducado' } });
    if (t.sub !== req.sub) return reply.code(403).send({ ok: false, error: { message: 'ticket de otro jugador' } });
    const position = t.status === 'queued' ? await store.posicion(t.ticket) : 0;
    return { ok: true, data: { ...t, position } };
  }));

  // Salir de la cola (solo el dueño)
  app.delete('/api/v1/matchmaking/queue/:ticket', guard(async (req, reply) => {
    if (!(await requireAuth(req, reply))) return;
    const t = await store.ticket(req.params.ticket);
    if (!t) return reply.code(404).send({ ok: false, error: { message: 'ticket no encontrado' } });
    if (t.sub !== req.sub) return reply.code(403).send({ ok: false, error: { message: 'ticket de otro jugador' } });
    const removed = await store.salir(t.ticket);
    return { ok: true, data: { removed: removed ? t.ticket : null } };
  }));

  // Partida: solo participantes pueden verla
  app.get('/api/v1/matchmaking/matches/:id', guard(async (req, reply) => {
    if (!(await requireAuth(req, reply))) return;
    const m = await store.match(req.params.id);
    if (!m) return reply.code(404).send({ ok: false, error: { message: 'partida no encontrada' } });
    if (!(await store.participa(req.params.id, req.sub))) {
      return reply.code(403).send({ ok: false, error: { message: 'no sos parte de esta partida' } });
    }
    return { ok: true, data: m };
  }));

  // Reportar resultado: { score_a, score_b } — participantes; primer
  // reporte gana (los demás → 409). Verificación y RR: próximo incremento.
  app.post('/api/v1/matchmaking/matches/:id/result', guard(async (req, reply) => {
    if (!(await requireAuth(req, reply))) return;
    const m = await store.match(req.params.id);
    if (!m) return reply.code(404).send({ ok: false, error: { message: 'partida no encontrada' } });
    if (!(await store.participa(req.params.id, req.sub))) {
      return reply.code(403).send({ ok: false, error: { message: 'no sos parte de esta partida' } });
    }
    const a = Number(req.body && req.body.score_a);
    const b = Number(req.body && req.body.score_b);
    if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0 || a + b === 0) {
      return reply.code(400).send({ ok: false, error: { message: 'score_a y score_b deben ser enteros ≥ 0 (no ambos 0)' } });
    }
    const res = await store.reportar(req.params.id, req.sub, a, b);
    if (!res.ok) {
      const code = res.error === 'ya_reportado' ? 409 : 404;
      return reply.code(code).send({ ok: false, error: { message: res.error === 'ya_reportado' ? 'resultado ya reportado' : 'partida no encontrada' } });
    }
    // Aplicar RR al instante (migración 22, idempotente). Si falla, el match
    // queda 'reportado' y se recupera re-llamando al reporte con 409 → verificar.
    let ver = null;
    try {
      ver = await store.verificar(req.params.id);
    } catch (e) {
      req.log.warn({ err: e.code || e.message }, 'verificación diferida (match queda reportado)');
    }
    return {
      ok: true,
      data: {
        match_id: req.params.id,
        status: ver && ver.ok ? 'verificado' : 'reportado',
        score_a: a,
        score_b: b,
        rr: ver && ver.ok
          ? { aplicados: ver.aplicados != null ? ver.aplicados : null, omitidos: ver.omitidos != null ? ver.omitidos : null, ya: !!ver.ya }
          : null,
      },
    };
  }));

  // Historial RR propio: matches en los que participé, con rr_before/after
  // (vista mm_historial, migración 22). ?limite=1..100 (default 50).
  app.get('/api/v1/matchmaking/history', guard(async (req, reply) => {
    if (!(await requireAuth(req, reply))) return;
    const limite = parseInt((req.query && req.query.limite) || '50', 10) || 50;
    const rows = await store.historial(req.sub, limite);
    return { ok: true, data: rows };
  }));

  // ¿Quién soy? (diagnóstico de sesión para el hub/launcher)
  app.get('/api/v1/me', guard(async (req, reply) => {
    if (!(await requireAuth(req, reply))) return;
    return { ok: true, data: { sub: req.sub } };
  }));

  app.construido = { store, auth };
  return app;
}

// Limpieza defensiva de tickets vencidos (además del UPDATE que hace
// el emparejador en cada llamada).
function iniciarLimpieza(store, logger) {
  setInterval(() => {
    store.encolados().catch((e) => logger && logger.warn({ err: e.message }, 'limpieza falló'));
  }, 60_000).unref();
}

if (require.main === module) {
  const app = construir();
  iniciarLimpieza(app.construido.store, app.log);
  app.listen({ port: Number(PORT), host: '0.0.0.0' }).then(() => {
    app.log.info(`${APP} v${VERSION} en :${PORT} (store: ${app.construido.store.tipo} · CORS → ${ALLOW_ORIGIN})`);
  }).catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
}

module.exports = { construir, iniciarLimpieza, MODOS, TICKET_TTL_MS, VERSION, APP };
