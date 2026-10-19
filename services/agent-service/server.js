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
  const herramientas = crearHerramientas(ejecutarIntencion);

  fastify.addHook('onRequest', async (req, reply) => {
    reply.header('access-control-allow-origin', allowOrigin);
    reply.header('access-control-allow-headers', 'content-type, authorization');
    reply.header('access-control-allow-methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') return reply.code(204).send();
  });

  // auth Bearer en /api/v1/* solo si AGENT_TOKEN está definido
  fastify.addHook('preHandler', async (req, reply) => {
    if (!token || !req.url.startsWith('/api/v1')) return;
    const h = req.headers.authorization || '';
    if (h !== `Bearer ${token}`) return reply.code(401).send({ ok: false, error: { message: 'token del agente requerido' } });
  });

  fastify.get('/healthz', async () => ({ ok: true, service: 'agent-service', version: VERSION, uptime: Math.round(process.uptime()), memoria: memoria.tipo(), cerebro: llm ? 'reglas+llm' : 'reglas' }));

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
      memoria,
    }),
    cerebro,
    acciones: opts.acciones || crearAcciones({ memoria }),
    llm: opts.llm !== undefined ? opts.llm : crearLlm(process.env),
  };
}

if (require.main === module) {
  const app = construir();
  const puerto = Number(process.env.PORT || 8082);
  app.listen({ port: puerto, host: '0.0.0.0' })
    .then(() => console.log(`[agent-service] v${VERSION} escuchando en :${puerto} · cerebro: ${crearLlm(process.env) ? 'reglas+llm' : 'reglas'}`))
    .catch((e) => { console.error('[agent-service] fallo al arrancar:', e.message); process.exit(1); });
}

module.exports = { construir, construirContexto };
