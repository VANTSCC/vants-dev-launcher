#!/usr/bin/env node
'use strict';
// ============================================================
// TESTS del MODO AGÉNTICO del AGENTE VANTS (llm.js v2 + herramientas)
// Servidor OpenAI-falso que responde tool_calls / content según
// secuencia. Verifica: catálogo tools, ejecución real de herramientas,
// encadenado, args JSON, herramienta desconocida, anti-bucle (MAX_PASOS
// + forzar texto final), y compatibilidad interpretar()/narrar().
// Uso: node scripts/test_llm_agente.js
// ============================================================

const assert = require('assert');
const http = require('http');
const { crearLlm, MAX_PASOS } = require('../services/agent-service/llm');
const { crearHerramientas } = require('../services/agent-service/herramientas');
const { ejecutarIntencion } = require('../services/agent-service/nucleo');

let pasadas = 0; let fallos = 0;
function ok(cond, etiqueta) {
  if (cond) { pasadas++; console.log(`  PASS ${etiqueta}`); }
  else { fallos++; console.error(`  FAIL ${etiqueta}`); }
}

// ── servidor OpenAI-falso: secuencia de respuestas (o fn por llamada) ──
function crearServidorFalso(secuencia) {
  const peticiones = [];
  let i = 0;
  const servidor = http.createServer((req, res) => {
    let cuerpo = '';
    req.on('data', (c) => { cuerpo += c; });
    req.on('end', () => {
      const entrada = JSON.parse(cuerpo || '{}');
      peticiones.push(entrada);
      const paso = secuencia[Math.min(i, secuencia.length - 1)];
      i++;
      const salida = typeof paso === 'function' ? paso(entrada, peticiones.length) : paso;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(salida));
    });
  });
  return new Promise((resolve) => servidor.listen(0, '127.0.0.1', () => {
    resolve({
      peticiones,
      url: `http://127.0.0.1:${servidor.address().port}/v1`,
      cerrar: () => new Promise((r) => servidor.close(r)),
    });
  }));
}

function toolCall(id, nombre, args) {
  return { id, type: 'function', function: { name: nombre, arguments: typeof args === 'string' ? args : JSON.stringify(args || {}) } };
}
function msgToolCalls(llamadas) { return { choices: [{ message: { role: 'assistant', content: null, tool_calls: llamadas } }] }; }
function msgTexto(texto) { return { choices: [{ message: { role: 'assistant', content: texto } }] }; }

// ── ctx mínimo: memoria espía (las herramientas llegan vía ejecutarIntencion) ──
function crearCtx() {
  const espia = { resueltos: [], ciclos: 0, redispatch: [] };
  const memoria = {
    tipo: () => 'ram',
    ultimoRun: async () => ({ estado_global: 'UP', started_at: new Date('2026-10-19T10:00:00Z').toISOString(), resumen: 'Todo en orden (5 chequeos OK)' }),
    incidentesAbiertos: async (n) => [{ id: 3, severity: 'aviso', titulo: 'web lenta' }],
    resolverIncidente: async (id) => { espia.resueltos.push(id); return espia.resueltos.includes(id); },
    abrirRun: async () => ++espia.ciclos,
    cerrarRun: async () => true,
    incidente: async () => true,
    comandosPendientes: async () => [],
    responderComando: async () => true,
    marcarAccion: async () => true,
  };
  const acciones = { ejecutar: async (id, args) => ({ ejecutada: true, id, args, resultado: 'ok' }) };
  const cerebro = require('../services/agent-service/cerebro');
  const ctx = { memoria, acciones, cerebro, chequeos: { todos: () => [] }, llm: null };
  ctx.espia = espia;
  return ctx;
}

async function principal() {
  console.log('— Test: catálogo de herramientas —');
  {
    const herramientas = crearHerramientas(ejecutarIntencion);
    const catalogo = herramientas.catalogo();
    ok(catalogo.length === 15, `catálogo expone 15 herramientas (hay ${catalogo.length})`);
    ok(catalogo.every((t) => t.type === 'function' && t.function.name && t.function.description), 'todas con formato function válido');
    ok(herramientas.obtener('resolver').ejecutar && herramientas.obtener('no_existe') === null, 'obtener() resuelve conocidas y null en desconocidas');
  }

  console.log('— Test: bucle agéntico con tool_call → resultado → respuesta final —');
  {
    const srv = await crearServidorFalso([
      msgToolCalls([toolCall('c1', 'incidentes', {})]),
      msgTexto('Tienes 1 incidente abierto: #3 [aviso] web lenta. ¿Lo resuelvo?'),
    ]);
    const llm = crearLlm({ AGENT_LLM_URL: srv.url, AGENT_LLM_KEY: 'k-test', AGENT_LLM_MODEL: 'glm-test' });
    const ctx = crearCtx();
    const herramientas = crearHerramientas(ejecutarIntencion);
    const respuesta = await llm.conversar('¿qué incidentes hay?', herramientas, ctx);
    ok(respuesta === 'Tienes 1 incidente abierto: #3 [aviso] web lenta. ¿Lo resuelvo?', 'devuelve la respuesta final del modelo');
    ok(srv.peticiones[0].tools && srv.peticiones[0].tools.length === 15, '1ª llamada envía el catálogo tools completo');
    const mensajes2 = srv.peticiones[1].messages;
    ok(mensajes2.some((m) => m.role === 'tool' && m.tool_call_id === 'c1'), '2ª llamada incluye role:tool con el id de la llamada');
    const contenidoTool = mensajes2.find((m) => m.role === 'tool').content;
    ok(contenidoTool.includes('#3') && contenidoTool.includes('web lenta'), 'el resultado de la herramienta llega al modelo (datos reales, no inventados)');
    ok(mensajes2.some((m) => m.role === 'assistant' && Array.isArray(m.tool_calls)), 'el historial preserva el assistant con tool_calls');
    await srv.cerrar();
  }

  console.log('— Test: argumentos JSON parseados y ejecutados de verdad —');
  {
    const srv = await crearServidorFalso([
      msgToolCalls([toolCall('c2', 'resolver', { id: 7 })]),
      msgTexto('Incidente #7 marcado como resuelto.'),
    ]);
    const llm = crearLlm({ AGENT_LLM_URL: srv.url, AGENT_LLM_KEY: 'k-test' });
    const ctx = crearCtx();
    const herramientas = crearHerramientas(ejecutarIntencion);
    const respuesta = await llm.conversar('resuelve el 7', herramientas, ctx);
    ok(ctx.espia.resueltos.includes(7), 'resolver ejecutó resolverIncidente(7) en la memoria');
    ok(/#7/.test(respuesta), 'la respuesta final cita el incidente');
    await srv.cerrar();
  }

  console.log('— Test: encadenado de 2 herramientas (estado → resolver) —');
  {
    const srv = await crearServidorFalso([
      msgToolCalls([toolCall('a1', 'estado', {})]),
      msgToolCalls([toolCall('a2', 'resolver', { id: 3 })]),
      msgTexto('Estado UP; cerré el #3.'),
    ]);
    const llm = crearLlm({ AGENT_LLM_URL: srv.url, AGENT_LLM_KEY: 'k-test' });
    const ctx = crearCtx();
    const herramientas = crearHerramientas(ejecutarIntencion);
    const respuesta = await llm.conversar('mira el estado y cierra lo que puedas', herramientas, ctx);
    ok(ctx.espia.resueltos.includes(3), 'segunda herramienta ejecutada tras la primera');
    ok(srv.peticiones.length === 3, '3 llamadas HTTP (2 con tools + 1 final)');
    ok(respuesta === 'Estado UP; cerré el #3.', 'respuesta final correcta tras encadenar');
    await srv.cerrar();
  }

  console.log('— Test: herramienta desconocida no rompe el bucle —');
  {
    const srv = await crearServidorFalso([
      msgToolCalls([toolCall('c3', 'apagar_internet', {})]),
      msgTexto('No tengo esa herramienta; lo que sí puedo es darte el estado.'),
    ]);
    const llm = crearLlm({ AGENT_LLM_URL: srv.url, AGENT_LLM_KEY: 'k-test' });
    const ctx = crearCtx();
    const herramientas = crearHerramientas(ejecutarIntencion);
    const respuesta = await llm.conversar('apaga internet', herramientas, ctx);
    const toolMsg = srv.peticiones[1].messages.find((m) => m.role === 'tool');
    ok(toolMsg.content.includes('desconocida'), 'el modelo recibe el error de herramienta desconocida');
    ok(respuesta && respuesta.includes('No tengo'), 'el bucle continúa y llega a la respuesta final');
    await srv.cerrar();
  }

  console.log(`— Test: anti-bucle — agotado MAX_PASOS (${MAX_PASOS}) fuerza respuesta final sin tools —`);
  {
    // siempre pide otra herramienta PERO cuando ya hay 2*MAX_PASOS mensajes devuelve texto
    const srv = await crearServidorFalso([
      (entrada) => {
        const tools = (entrada.messages || []).filter((m) => m.role === 'tool').length;
        return tools >= MAX_PASOS ? msgTexto('Me quedé sin pasos; esto es lo que sé.') : msgToolCalls([toolCall('x' + tools, 'estado', {})]);
      },
    ]);
    const llm = crearLlm({ AGENT_LLM_URL: srv.url, AGENT_LLM_KEY: 'k-test' });
    const ctx = crearCtx();
    const herramientas = crearHerramientas(ejecutarIntencion);
    const respuesta = await llm.conversar('haz cosas sin fin', herramientas, ctx);
    ok(respuesta === 'Me quedé sin pasos; esto es lo que sé.', 'bucle acotado y respuesta final entregada');
    ok(srv.peticiones.length === MAX_PASOS + 1, `exactamente ${MAX_PASOS + 1} llamadas (bucle + forzado final), hay ${srv.peticiones.length}`);
    ok(srv.peticiones[srv.peticiones.length - 1].tools === undefined, 'la llamada final NO envía tools (forzarTexto)');
    await srv.cerrar();
  }

  console.log('— Test: API caída / respuesta vacía → null (el núcleo cae a reglas) —');
  {
    const srv = await crearServidorFalso([{ choices: [{ message: { role: 'assistant', content: '' } }] }]);
    const llm = crearLlm({ AGENT_LLM_URL: srv.url, AGENT_LLM_KEY: 'k-test' });
    const ctx = crearCtx();
    const herramientas = crearHerramientas(ejecutarIntencion);
    ok(await llm.conversar('hola', herramientas, ctx) === null, 'content vacío sin tools → null');
    ok(await llm.interpretar('estado') === null, 'interpretar con content vacío → null');
    await srv.cerrar();
    const llmCaido = crearLlm({ AGENT_LLM_URL: 'http://127.0.0.1:9/v1', AGENT_LLM_KEY: 'k' });
    ok(await llmCaido.conversar('hola', herramientas, ctx) === null, 'conexión rechazada → null sin lanzar');
  }

  console.log('— Test: compatibilidad interpretar() y narrar() (modo clásico) —');
  {
    const srv = await crearServidorFalso([
      msgTexto('{"intencion":"resolver","args":{"id":12}}'),
      msgTexto('Resumen: todo UP.'),
    ]);
    const llm = crearLlm({ AGENT_LLM_URL: srv.url, AGENT_LLM_KEY: 'k-test' });
    const intento = await llm.interpretar('cierra el incidente 12');
    ok(intento && intento.intencion === 'resolver' && intento.args.id === 12 && intento.via === 'llm', 'interpretar() sigue devolviendo {intencion,args,via}');
    ok(await llm.narrar('informe técnico largo...') === 'Resumen: todo UP.', 'narrar() devuelve el texto narrado');
    ok(!srv.peticiones[0].tools, 'interpretar no envía tools (forzarTexto)');
    await srv.cerrar();
  }

  console.log('— Test: probar() diagnóstico (ok · http_401) —');
  {
    const okLlm = crearLlm({ AGENT_LLM_KEY: 'k' }, async () => new Response(
      JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'OK' } }] }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    ));
    const p1 = await okLlm.probar();
    ok(p1.ok === true && p1.modelo === 'glm-4.5-flash' && String(p1.url).includes('api.z.ai'), 'probar() ok con URL global por defecto');
    const badLlm = crearLlm({ AGENT_LLM_KEY: 'k' }, async () => new Response(
      JSON.stringify({ error: { message: 'invalid api key' } }),
      { status: 401, headers: { 'content-type': 'application/json' } }
    ));
    const p2 = await badLlm.probar();
    ok(p2.ok === false && p2.motivo === 'http_401', 'probar() reporta el motivo exacto (http_401 = key inválida)');
  }

  console.log('— Test: sin KEY → null · KEY sola → URL global de GLM por defecto —');
  ok(crearLlm({}) === null, 'crearLlm({}) devuelve null (falta la key)');
  {
    let urlVista = '';
    const fetchCap = async (u) => {
      urlVista = String(u);
      return new Response(
        JSON.stringify({ choices: [{ message: { content: '{"intencion":"estado","args":{},"via":"llm"}' } }] }),
        { headers: { 'content-type': 'application/json' } }
      );
    };
    const llm = crearLlm({ AGENT_LLM_KEY: 'k-sola' }, fetchCap);
    ok(!!llm && llm.activo(), 'con KEY sin URL el LLM está activo');
    const r = await llm.interpretar('estado');
    ok(!!r && r.intencion === 'estado', 'interpretar responde con la URL por defecto');
    ok(urlVista === 'https://api.z.ai/api/paas/v4/chat/completions', 'usa la endpoint global de GLM por defecto (' + urlVista + ')');
  }

  console.log(`\n${pasadas} PASS · ${fallos} FAIL`);
  if (fallos) process.exit(1);
}

principal().catch((e) => { console.error('ERROR:', e); process.exit(1); });
