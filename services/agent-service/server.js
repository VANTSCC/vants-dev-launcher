'use strict';
// ============================================================
// SERVIDOR del AGENTE VANTS (Fastify, :8082) — control remoto.
//   GET  /healthz                        → siempre 200
//   GET  /api/v1/estado                  → último run + incidentes
//   POST /api/v1/ciclo                   → ciclo completo ahora
//   POST /api/v1/comando {texto}         → orden en lenguaje natural
//   GET  /api/v1/incidentes              → abiertos
//   POST /api/v1/incidentes/:id/resolver → cerrar incidente
// Auth Bearer opcional con AGENT_TOKEN. Express también instalado
// (decisión del dueño) por si se necesita un router secundario.
// ============================================================

const { crearMemoria } = require('./memoria');
const { crearChequeos, VERSION } = require('./chequeos');
const cerebro = require('./cerebro');
const { crearAcciones } = require('./acciones');
const { crearLlm } = require('./llm');
const { crearSandbox } = require('./sandbox');
const { ejecutarCiclo, ejecutarIntencion } = require('./nucleo');
const { crearHerramientas } = require('./herramientas');

function construir(opts = {}) {
  const fastify = opts.fastifyFactory ? opts.fastifyFactory() : require('fastify')({ logger: false });
  const memoria = opts.memoria || crearMemoria(opts.pg);
  const chequeos = opts.chequeos || crearChequeos({
    urls: { web: process.env.URLS_WEB || 'https://vants.vants.workers.dev', workerFaceit: process.env.URLS_WORKER_FACEIT || 'https://vants-faceit-webhook.vants.workers.dev', matchmaking: process.env.URLS_MATCHMAKING || '' },
    github: { token: process.env.GITHUB_TOKEN, repo: process.env.GITHUB_REPOSITORY },
    memoria,
  });
  const llm = opts.llm !== undefined ? opts.llm : crearLlm(process.env);
  const acciones = opts.acciones || crearAcciones({ memoria });
  const token = opts.token !== undefined ? opts.token : (process.env.AGENT_TOKEN || '');
  const allowOrigin = process.env.ALLOW_ORIGIN || 'https://vants.vants.workers.dev';

  const ctx = { memoria, chequeos, cerebro, acciones, llm };
  ctx.sandbox = crearSandbox({ memoria, cwd: process.cwd() });
  const herramientas = crearHerramientas(ejecutarIntencion);

  fastify.addHook('onRequest', async (req, reply) => {
    reply.header('access-control-allow-origin', allowOrigin);
    reply.header('access-control-allow-headers', 'content-type, authorization');
    reply.header('access-control-allow-methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') return reply.code(204).send();
  });

  // Auth de /api/v1/* — comparación timing-safe del token, sin dependencias:
  //   · AGENT_TOKEN definido → exige `Authorization: Bearer <token>` correcto
  //     (401 si falta o no coincide).
  //   · sin AGENT_TOKEN      → queda abierto para desarrollo local; el aviso
  //     se emite al arrancar el servidor (bloque require.main).
  const comparacionConstante = (a, b) => {
    const x = String(a == null ? '' : a);
    const y = String(b == null ? '' : b);
    const len = Math.max(x.length, y.length);
    let diff = x.length === y.length ? 0 : 1;
    for (let i = 0; i < len; i++) diff |= (x.charCodeAt(i) || 0) ^ (y.charCodeAt(i) || 0);
    return diff === 0;
  };
  fastify.addHook('preHandler', async (req, reply) => {
    if (!req.url.startsWith('/api/v1')) return;
    if (token) {
      const h = String(req.headers.authorization || '');
      const ok = h.startsWith('Bearer ') && comparacionConstante(h.slice(7).trim(), token);
      if (!ok) return reply.code(401).send({ ok: false, error: { message: 'token del agente requerido' } });
      return;
    }
    // sin AGENT_TOKEN: acceso abierto (desarrollo local), aviso al arrancar.
  });

  fastify.get('/healthz', async () => ({ ok: true, service: 'agent-service', version: VERSION, uptime: Math.round(process.uptime()), memoria: memoria.tipo(), cerebro: llm ? 'reglas+llm' : 'reglas', sandbox: 'activa' }));

  fastify.get('/api/v1/estado', async () => {
    const ultimo = await memoria.ultimoRun();
    const abiertos = await memoria.incidentesAbiertos(20);
    return { ok: true, ultimo, incidentes: abiertos, cerebro: llm ? 'reglas+llm' : 'reglas' };
  });

  fastify.post('/api/v1/ciclo', async () => {
    const r = await ejecutarCiclo(ctx, { fuente: 'api' });
    return { ok: true, ...r };
  });

  fastify.post('/api/v1/comando', async (req, reply) => {
    const texto = String((req.body || {}).texto || '').trim();
    if (!texto) return reply.code(400).send({ ok: false, error: { message: 'falta texto' } });
    const creado_por = String((req.body || {}).creado_por || 'api');
    // camino AGÉNTICO: GLM elige y encadena herramientas reales
    if (llm && typeof llm.conversar === 'function') {
      try {
        const agente = await llm.conversar(texto, herramientas, ctx);
        if (agente) return { ok: true, intencion: 'agente', via: 'llm-herramientas', respuesta: agente };
      } catch {}
    }
    let interpretado = null;
    if (llm) { try { interpretado = await llm.interpretar(texto); } catch {} }
    if (!interpretado) interpretado = cerebro.interpretar(texto);
    const respuesta = await ejecutarIntencion(ctx, interpretado.intencion, interpretado.args || {});
    return { ok: true, intencion: interpretado.intencion, via: interpretado.via || 'reglas', respuesta };
  });

  fastify.get('/api/v1/incidentes', async () => ({ ok: true, incidentes: await memoria.incidentesAbiertos(50) }));

  // SANDBOX AGENT — almacenes de memoria
  fastify.get('/api/v1/memoria', async (req) => {
    const consulta = String((req.query || {}).q || '');
    return { ok: true, recuerdos: consulta ? await memoria.recordarBuscar(consulta, 25) : await memoria.memoriaListar(50) };
  });
  fastify.post('/api/v1/memoria', async (req, reply) => {
    const b = req.body || {};
    if (!b.clave || b.valor == null) return reply.code(400).send({ ok: false, error: { message: 'falta clave y/o valor' } });
    const id = await memoria.recordar(b.clave, b.valor, { tipo: b.tipo, importancia: Number(b.importancia) || 3, creadoPor: 'dueno' });
    return { ok: true, id };
  });
  fastify.get('/api/v1/archivos', async (req) => {
    const prefijo = String((req.query || {}).prefijo || '');
    return { ok: true, archivos: await memoria.archivoListar(prefijo, 100) };
  });

  fastify.post('/api/v1/incidentes/:id/resolver', async (req, reply) => {
    const resolucion = String((req.body || {}).resolucion || 'resuelto via API');
    const ok = await memoria.resolverIncidente(req.params.id, resolucion);
    if (!ok) return reply.code(404).send({ ok: false, error: { message: `incidente ${req.params.id} no encontrado o ya cerrado` } });
    return { ok: true, resuelto: Number(req.params.id) };
  });

  return fastify;
}

// fábrica de memoria exportada para que cli/CI reutilicen la misma config
function construirContexto(opts = {}) {
  const memoria = opts.memoria || crearMemoria(opts.pg);
  return {
    memoria,
    chequeos: opts.chequeos || crearChequeos({
      urls: { web: process.env.URLS_WEB || 'https://vants.vants.workers.dev', workerFaceit: process.env.URLS_WORKER_FACEIT || 'https://vants-faceit-webhook.vants.workers.dev', matchmaking: process.env.URLS_MATCHMAKING || '' },
      github: { token: process.env.GITHUB_TOKEN, repo: process.env.GITHUB_REPOSITORY },
      vercel: { token: process.env.VERCEL_TOKEN, teamId: process.env.VERCEL_TEAM_ID, projectId: process.env.VERCEL_PROJECT_ID },
      memoria,
    }),
    cerebro,
    acciones: opts.acciones || crearAcciones({ memoria }),
    llm: opts.llm !== undefined ? opts.llm : crearLlm(process.env),
    sandbox: opts.sandbox || crearSandbox({ memoria, cwd: process.cwd() }),
  };
}

if (require.main === module) {
  if (!String(process.env.AGENT_TOKEN || '').trim()) {
    console.warn('AGENT_TOKEN no configurado — endpoints de agente sin autenticación');
  }
  const app = construir();
  const puerto = Number(process.env.PORT || 8082);
  app.listen({ port: puerto, host: '0.0.0.0' })
    .then(() => console.log(`[agent-service] v${VERSION} escuchando en :${puerto} · cerebro: ${crearLlm(process.env) ? 'reglas+llm' : 'reglas'}`))
    .catch((e) => { console.error('[agent-service] fallo al arrancar:', e.message); process.exit(1); });
}

module.exports = { construir, construirContexto };
