#!/usr/bin/env node
'use strict';
// ============================================================
// TESTS del AGENTE VANTS — sin red, todo inyectado (fastify.inject).
//   cd repo-vants && node scripts/test_agente.js
// ============================================================

const assert = require('assert');
const path = require('path');

const cerebro = require(path.join(__dirname, '..', 'services', 'agent-service', 'cerebro'));
const { crearMemoriaMemoria } = require(path.join(__dirname, '..', 'services', 'agent-service', 'memoria'));
const { ejecutarCiclo, ejecutarIntencion } = require(path.join(__dirname, '..', 'services', 'agent-service', 'nucleo'));
const { crearChequeos } = require(path.join(__dirname, '..', 'services', 'agent-service', 'chequeos'));
const { crearAcciones } = require(path.join(__dirname, '..', 'services', 'agent-service', 'acciones'));

let PASSED = 0;
function ok(cond, nombre) { if (!cond) { console.error(`  FAIL ${nombre}`); process.exit(1); } PASSED++; console.log(`  ok ${nombre}`); }

const R_OK = { id: 'web', label: 'Web', estado: 'ok', detalle: 'HTTP 200' };
const R_WORKER_OK = { id: 'worker_faceit', label: 'Worker FACEIT', estado: 'ok', detalle: 'version 2' };
const R_LAUNCH_OK = { id: 'launcher', label: 'Launcher', estado: 'ok', detalle: 'v2.4.1 publicada' };
const R_WF_OK = { id: 'workflows', label: 'Workflows', estado: 'ok', detalle: 'todo success' };

async function test_cerebro() {
  console.log('\n— cerebro: evaluación de reglas —');
  const evOk = cerebro.evaluar([R_OK, R_WORKER_OK, R_LAUNCH_OK, R_WF_OK]);
  ok(evOk.estadoGlobal === 'UP', 'todo ok → UP');
  ok(evOk.incidentes.length === 0, 'todo ok → sin incidentes');
  ok(evOk.acciones.length === 0, 'todo ok → sin acciones');

  const evDown = cerebro.evaluar([{ id: 'web', label: 'Web', estado: 'fallo', detalle: 'timeout' }, R_WORKER_OK]);
  ok(evDown.estadoGlobal === 'DOWN', 'web caída → DOWN');
  ok(evDown.incidentes.length === 1 && evDown.incidentes[0].severity === 'critical', 'web caída → incidente critical');
  ok(evDown.incidentes[0].dedupe_key === 'web_down:web', 'incidente con dedupe_key estable');
  ok(evDown.acciones.some((a) => a.id === 'redispatch_cloudflare' && a.seguridad === 'auto'), 'web caída → acción auto redispatch');

  const evWf = cerebro.evaluar([{ id: 'workflows', label: 'Workflows', estado: 'fallo', detalle: 'cloudflare-deploy FALLÓ (abc1234)', fallos: [{ id: 'cloudflare-deploy', nombre: 'Cloudflare · deploy del Worker (vants)', runId: 99, sha: 'abc1234' }] }, R_OK, R_WORKER_OK]);
  ok(evWf.estadoGlobal === 'DEGRADED', 'workflow fallido → DEGRADED');
  ok(evWf.incidentes[0].severity === 'warn', 'workflow fallido → warn');
  ok(evWf.acciones.some((a) => a.id === 'redispatch_cloudflare' && a.sha === 'abc1234'), 'workflow deploy fallido → redispatch con sha');
  const evWf2 = cerebro.evaluar([{ id: 'workflows', label: 'Workflows', estado: 'fallo', detalle: 'desktop-electron FALLÓ', fallos: [{ id: 'desktop-electron', nombre: 'VANTS HUB', runId: 77, sha: 'def5678' }] }, R_OK]);
  ok(evWf2.acciones.some((a) => a.id === 'rerun_fallidos' && a.runId === 77), 'workflow no-deploy fallido → rerun con runId');

  const evOmit = cerebro.evaluar([{ id: 'matchmaking', label: 'MM', estado: 'omitido', detalle: '' }]);
  ok(evOmit.estadoGlobal === 'DESCONOCIDO', 'solo omitidos → DESCONOCIDO');

  const inf = cerebro.informe([R_OK, { id: 'web', label: 'Web', estado: 'fallo', detalle: '500' }]);
  ok(inf.includes('FALLO') && inf.includes('Web'), 'informe legible contiene el fallo');
}

async function test_nlu() {
  console.log('\n— cerebro: NLU en español —');
  const casos = [
    ['estado', 'estado'], ['¿cómo va todo?', 'estado'], ['salud', 'estado'],
    ['informe completo', 'informe'], ['revisa todo', 'ciclo'], ['chequea', 'ciclo'],
    ['despliega la web', 'desplegar_web'], ['redeploy de la web', 'desplegar_web'],
    ['migraciones por favor', 'migrar'], ['incidentes abiertos', 'incidentes'],
    ['qué problemas hay', 'incidentes'], ['resuelve 12', 'resolver'],
    ['cierra el incidente #34', 'resolver'], ['ayuda', 'ayuda'],
    ['hazme un cafe', 'desconocido'],
  ];
  for (const [texto, esperado] of casos) ok(cerebro.interpretar(texto).intencion === esperado, `"${texto}" → ${esperado}`);
  ok(cerebro.interpretar('resuelve 12').args.id === 12, 'resolver extrae el id');
  ok(cerebro.interpretar('cierra el incidente #34').args.id === 34, 'cierra #N extrae el id');
}

async function test_memoria() {
  console.log('\n— memoria (RAM): dedupe, reabrir, acciones, comandos —');
  const m = crearMemoriaMemoria();
  ok(m.tipo() === 'memoria', 'tipo memoria');

  const a = await m.incidente({ dedupe_key: 'web_down:web', kind: 'web_down', severity: 'critical', titulo: 'Web caída', detalle: {} });
  ok(a.creado === true, 'primer incidente se crea');
  const b = await m.incidente({ dedupe_key: 'web_down:web', kind: 'web_down', severity: 'critical', titulo: 'Web caída', detalle: {} });
  ok(b.creado === false && b.id === a.id, 'mismo dedupe_key no duplica');

  ok(await m.resolverIncidente(a.id, 'arreglado'), 'resolver incidente');
  const c = await m.incidente({ dedupe_key: 'web_down:web', kind: 'web_down', severity: 'critical', titulo: 'Web caída otra vez', detalle: {} });
  ok(c.creado === false && c.id === a.id, 'vuelve a fallar → reabre el mismo');
  const abiertos = await m.incidentesAbiertos();
  ok(abiertos.length === 1 && abiertos[0].estado === 'abierto' && abiertos[0].notificado === false, 'reabierto está abierto y sin notificar');

  ok(await m.marcarAccion('redispatch:cloudflare-deploy.yml:abc', 'redispatch', {}) === true, 'accion nueva → true');
  ok(await m.marcarAccion('redispatch:cloudflare-deploy.yml:abc', 'redispatch', {}) === false, 'misma accion → false (guarda)');

  const runId = await m.abrirRun({ fuente: 'test', modo: 'ciclo' });
  await m.cerrarRun(runId, { estado_global: 'UP', hallazgos: [], acciones: [], resumen: 'prueba' });
  const ultimo = await m.ultimoRun();
  ok(ultimo && ultimo.estado_global === 'UP' && ultimo.resumen === 'prueba', 'run abierto y cerrado');

  const cid = await m.insertarComando({ texto: 'estado', creado_por: 'discord:1' });
  const pend = await m.comandosPendientes();
  ok(pend.length === 1 && pend[0].texto === 'estado', 'comando pendiente en cola');
  await m.responderComando(cid, 'todo bien', true);
  ok((await m.comandosPendientes()).length === 0, 'comando respondido sale de la cola');
  await m.cerrar();
}

async function test_nucleo() {
  console.log('\n— núcleo: ciclo completo con componentes falsos —');
  const memoria = crearMemoriaMemoria();
  let accionesLlamadas = [];
  // fake de acciones que emula la guarda anti-bucle de acciones.js real
  const ctx = {
    memoria,
    chequeos: { todos: () => [Promise.resolve({ id: 'web', label: 'Web', estado: 'fallo', detalle: 'HTTP 503' }), Promise.resolve(R_WORKER_OK)] },
    cerebro,
    acciones: {
      ejecutar: async (id, args) => {
        const clave = `fake:${id}:${args.sha || args.runId || 'sin-sha'}`;
        const nueva = await memoria.marcarAccion(clave, `accion ${id}`, args);
        if (!nueva) return { ejecutada: false, resultado: 'ya ejecutada (guarda)' };
        accionesLlamadas.push({ id, args });
        return { ejecutada: true, resultado: 'lanzado' };
      },
    },
    llm: null,
  };
  const r = await ejecutarCiclo(ctx, { fuente: 'test' });
  ok(r.estado === 'DOWN', 'ciclo detecta DOWN');
  ok(r.acciones.some((a) => a.id === 'redispatch_cloudflare' && a.ejecutada), 'ciclo ejecuta la acción auto');
  ok(accionesLlamadas.length === 1, 'una sola acción ejecutada');
  const ultimo = await memoria.ultimoRun();
  ok(ultimo && ultimo.fuente === 'test' && ultimo.resumen.includes('fallos: web'), 'run persistido con resumen');
  const abiertos = await memoria.incidentesAbiertos();
  ok(abiertos.length === 1 && abiertos[0].severity === 'critical', 'incidente del ciclo en memoria');

  // segundo ciclo igual → la guarda anti-bucle frena la acción
  const r2 = await ejecutarCiclo(ctx, { fuente: 'test' });
  const acc2 = r2.acciones.filter((a) => a.id === 'redispatch_cloudflare');
  ok(acc2.length === 1 && acc2[0].ejecutada === false, '2º ciclo: guarda anti-bucle frena el redispatch');
  ok(accionesLlamadas.length === 1, 'no se volvió a ejecutar la acción');

  // comando pendiente procesado en el ciclo
  await memoria.insertarComando({ texto: 'incidentes', creado_por: 'discord:dueno' });
  const r3 = await ejecutarCiclo(ctx, { fuente: 'test' });
  const cmdAccion = r3.acciones.find((a) => a.id === 'comandos_procesados');
  ok(cmdAccion && cmdAccion.ejecutada, 'comando del dueño procesado en el ciclo');

  // ejecutarIntencion directo
  const resEstado = await ejecutarIntencion(ctx, 'estado', {});
  ok(resEstado.includes('Ultimo ciclo') || resEstado.includes('último') || resEstado.includes('Incidentes'), 'intencion estado responde');
  const resResolver = await ejecutarIntencion(ctx, 'resolver', { id: 9999 });
  ok(resResolver.includes('No encontre'), 'resolver id inexistente avisa');
}

// respuesta falsa estilo fetch
const respuesta = (status, cuerpo) => ({ status, ok: status >= 200 && status < 300, text: async () => JSON.stringify(cuerpo) });

async function test_vercel() {
  console.log('\n— Vercel: chequeo vercel_deploy + acción redeploy_vercel —');
  const deploy = (estado, extra = {}) => ({ uid: 'dpl_abc', readyState: estado, url: 'vants-xyz.vercel.app', inspectorUrl: 'https://vercel.com/vants/vants/dpl_abc', target: 'production', meta: { githubCommitSha: 'a1b2c3d4e5f6', githubCommitRef: 'main' }, ...extra });
  const conApi = (lista) => crearChequeos({ vercel: { token: 'tok' }, fetchImpl: async (url) => { ok(url.includes('/v6/deployments?projectId=prj_') && url.includes('teamId=team_'), 'pide a /v6/deployments con projectId y teamId'); return respuesta(200, { deployments: lista }); } });

  const omitido = await crearChequeos({}).vercelDeploy();
  ok(omitido.estado === 'omitido' && /VERCEL_TOKEN/.test(omitido.detalle), 'sin VERCEL_TOKEN → omitido (no falla)');
  const okV = await conApi([deploy('READY')]).vercelDeploy();
  ok(okV.estado === 'ok' && okV.datos.uid === 'dpl_abc' && okV.datos.sha === 'a1b2c3d4e5', 'READY → ok con uid y sha');
  const fallo = await conApi([deploy('ERROR')]).vercelDeploy();
  ok(fallo.estado === 'fallo' && fallo.datos.estado === 'ERROR' && fallo.url.includes('vercel.com'), 'ERROR → fallo con URL del log');
  const cancel = await conApi([deploy('CANCELED')]).vercelDeploy();
  ok(cancel.estado === 'fallo', 'CANCELED → fallo');
  const build = await conApi([deploy('BUILDING')]).vercelDeploy();
  ok(build.estado === 'aviso', 'BUILDING → aviso');
  const preview = await conApi([deploy('ERROR', { target: null, meta: { githubCommitSha: 'ffff', githubCommitRef: 'rama-preview' } }), deploy('READY')]).vercelDeploy();
  ok(preview.estado === 'ok', 'un preview roto no tapa al último deploy de main');
  const caida = await crearChequeos({ vercel: { token: 'tok' }, fetchImpl: async () => respuesta(500, {}) }).vercelDeploy();
  ok(caida.estado === 'aviso' && /500/.test(caida.detalle), 'API de Vercel caída → aviso, no fallo');

  // cerebro: fallo de vercel → acción auto redeploy_vercel con uid+sha
  const ev = cerebro.evaluar([fallo, R_OK]);
  ok(ev.estadoGlobal === 'DEGRADED' && ev.incidentes[0].severity === 'error', 'deploy Vercel fallido → DEGRADED/error');
  ok(ev.incidentes[0].accion_sugerida === 'redeploy_vercel', 'incidente sugiere redeploy_vercel');
  ok(ev.acciones.some((a) => a.id === 'redeploy_vercel' && a.uid === 'dpl_abc' && a.sha === 'a1b2c3d4e5'), 'acción auto redeploy_vercel con uid y sha');

  // acción: POST v13 con deploymentId, guarda 2 intentos por sha
  const memoria = crearMemoriaMemoria();
  const posts = [];
  const acc = crearAcciones({ memoria, vercel: { token: 'tok' }, fetchImpl: async (url, opts) => { posts.push({ url, body: JSON.parse(opts.body) }); return respuesta(200, { id: 'dpl_nuevo', inspectorUrl: 'https://vercel.com/vants/vants/dpl_nuevo' }); } });
  const r1 = await acc.ejecutar('redeploy_vercel', { uid: 'dpl_abc', sha: 'a1b2c3d4e5', motivo: 'test' });
  ok(r1.ejecutada && posts.length === 1 && posts[0].url.includes('/v13/deployments?teamId=team_'), 'redeploy_vercel → POST /v13/deployments');
  ok(posts[0].body.deploymentId === 'dpl_abc' && posts[0].body.name === 'vants' && posts[0].body.target === 'production', 'cuerpo: name, deploymentId (uid fallido), target production');
  const r2 = await acc.ejecutar('redeploy_vercel', { uid: 'dpl_abc', sha: 'a1b2c3d4e5', motivo: 'test' });
  ok(r2.ejecutada && posts.length === 2 && /2\/2/.test(r2.resultado), '2º fallo del mismo sha → 2º intento');
  const r3 = await acc.ejecutar('redeploy_vercel', { uid: 'dpl_abc', sha: 'a1b2c3d4e5', motivo: 'test' });
  ok(!r3.ejecutada && posts.length === 2 && /guarda/.test(r3.resultado), '3º → frenado por la guarda (máx. 2 por sha)');
  const sinUid = await acc.ejecutar('redeploy_vercel', { sha: 'zzz' });
  ok(!sinUid.ejecutada && /uid/.test(sinUid.resultado), 'sin uid → solo propuesta');
  const sinToken = await crearAcciones({ memoria, vercel: { token: '' }, fetchImpl: async () => { throw new Error('no debe llamar'); } }).ejecutar('redeploy_vercel', { uid: 'x', sha: 'y' });
  ok(!sinToken.ejecutada && /VERCEL_TOKEN/.test(sinToken.resultado), 'sin VERCEL_TOKEN → solo propuesta');
  const api500 = await crearAcciones({ memoria, vercel: { token: 'tok' }, fetchImpl: async () => respuesta(403, { error: { code: 'forbidden', message: 'Not authorized' } }) }).ejecutar('redeploy_vercel', { uid: 'dpl_otro', sha: 'otro', motivo: 'test' });
  ok(!api500.ejecutada && /403/.test(api500.resultado) && /forbidden/.test(api500.resultado), 'Vercel 403 → no ejecutada con el código del error');
}

async function test_servidor() {
  console.log('\n— servidor: endpoints con fastify.inject —');
  let Fastify;
  try { Fastify = require(path.join(__dirname, '..', 'services', 'agent-service', 'node_modules', 'fastify')); }
  catch { Fastify = require('fastify'); }
  const { construir } = require(path.join(__dirname, '..', 'services', 'agent-service', 'server'));

  const memoria = crearMemoriaMemoria();
  const ctxAcciones = { ejecutar: async (id) => ({ ejecutada: true, resultado: 'lanzado por test' }) };
  const app = construir({
    memoria,
    chequeos: { todos: () => [Promise.resolve(R_OK), Promise.resolve(R_WORKER_OK)] },
    acciones: ctxAcciones,
    llm: null,
    token: 'secreto-agente',
    fastifyFactory: () => Fastify({ logger: false }),
  });

  const h = await app.inject({ method: 'GET', url: '/healthz' });
  ok(h.statusCode === 200 && h.json().service === 'agent-service', 'healthz 200 con service');
  ok(h.json().cerebro === 'reglas', 'healthz informa modo reglas');

  const noAuth = await app.inject({ method: 'GET', url: '/api/v1/estado' });
  ok(noAuth.statusCode === 401, 'sin token → 401');
  const badAuth = await app.inject({ method: 'GET', url: '/api/v1/estado', headers: { authorization: 'Bearer incorrecto' } });
  ok(badAuth.statusCode === 401, 'token incorrecto → 401');

  const ciclo = await app.inject({ method: 'POST', url: '/api/v1/ciclo', headers: { authorization: 'Bearer secreto-agente' } });
  ok(ciclo.statusCode === 200 && ciclo.json().ok && ciclo.json().estado === 'UP', 'ciclo via API → UP');

  const estado = await app.inject({ method: 'GET', url: '/api/v1/estado', headers: { authorization: 'Bearer secreto-agente' } });
  ok(estado.statusCode === 200 && estado.json().ok && typeof estado.json().incidentes === 'object', 'estado via API');

  const cmd = await app.inject({ method: 'POST', url: '/api/v1/comando', headers: { authorization: 'Bearer secreto-agente', 'content-type': 'application/json' }, payload: { texto: 'despliega la web' } });
  ok(cmd.statusCode === 200 && cmd.json().intencion === 'desplegar_web', 'comando interpretado → desplegar_web');
  ok(cmd.json().respuesta.includes('re-lanzado') || cmd.json().respuesta.includes('re-lanzar'), 'respuesta del comando coherente');

  const cmdMal = await app.inject({ method: 'POST', url: '/api/v1/comando', headers: { authorization: 'Bearer secreto-agente', 'content-type': 'application/json' }, payload: {} });
  ok(cmdMal.statusCode === 400, 'comando sin texto → 400');

  const inc404 = await app.inject({ method: 'POST', url: '/api/v1/incidentes/777/resolver', headers: { authorization: 'Bearer secreto-agente', 'content-type': 'application/json' }, payload: {} });
  ok(inc404.statusCode === 404, 'resolver incidente inexistente → 404');

  await app.close();
}

(async () => {
  try {
    await test_cerebro();
    await test_nlu();
    await test_memoria();
    await test_nucleo();
    await test_vercel();
    await test_servidor();
    console.log(`\n✅ AGENTE VANTS — ${PASSED}/${PASSED} asserts PASS`);
    process.exit(0);
  } catch (e) {
    console.error(`\n❌ FAIL tras ${PASSED} asserts:`, e);
    process.exit(1);
  }
})();
