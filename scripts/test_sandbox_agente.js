#!/usr/bin/env node
'use strict';
// ============================================================
// TESTS del SANDBOX AGENT (migración 26) — almacenes de memoria
// autoalojados + sandbox de ejecución aislada:
//   · sandbox.js: validar (allowlist/denylist/secreto/redirecciones),
//     ejecutar real (spawn) con timeout, auditoría en memoria
//   · memoria RAM: recordar/buscar/olvidar/listar + archivos + execs
//   · herramientas directas: memoria_guardar/buscar/olvidar,
//     archivo_guardar/leer/listar, sandbox_exec
//   · intenciones de reglas: recordar/olvidar/buscar_memoria/archivos/
//     leer_archivo/sandbox (ejecutarIntencion)
//   · API: /api/v1/memoria (GET/POST) y /api/v1/archivos (inject)
// Uso: node scripts/test_sandbox_agente.js
// ============================================================

const assert = require('assert');
const { crearSandbox } = require('../services/agent-service/sandbox');
const { crearMemoriaMemoria } = require('../services/agent-service/memoria');
const { crearHerramientas } = require('../services/agent-service/herramientas');
const { ejecutarIntencion } = require('../services/agent-service/nucleo');
const cerebro = require('../services/agent-service/cerebro');
const { construir } = require('../services/agent-service/server');

let pasadas = 0; let fallos = 0;
function ok(cond, etiqueta) {
  if (cond) { pasadas++; console.log(`  PASS ${etiqueta}`); }
  else { fallos++; console.error(`  FAIL ${etiqueta}`); }
}

async function principal() {
  console.log('— sandbox: validar (allowlist/denylist) —');
  const sb = crearSandbox({ memoria: null, cwd: process.cwd() });
  ok(sb.validar('node -v') === null, 'node -v permitido');
  ok(sb.validar('cat package.json | grep name') === null, 'pipeline con grep permitido');
  ok(sb.validar('python3 --version') === null, 'python3 permitido');
  ok(sb.validar('') !== null, 'comando vacío rechazado');
  ok(/allowlist/.test(sb.validar('curl https://vants.vants.workers.dev')), 'curl NO está en la allowlist (sin red desde la sandbox)');
  ok(/denylist/.test(sb.validar('rm -rf /')), 'rm -rf bloqueado');
  ok(/denylist/.test(sb.validar('sudo ls')), 'sudo bloqueado');
  ok(/denylist/.test(sb.validar('git push origin main')), 'git push bloqueado');
  ok(/denylist/.test(sb.validar('npm publish')), 'npm publish bloqueado');
  ok(/sustituciones/.test(sb.validar('echo hola; ls')), 'múltiples comandos (;) bloqueados');
  ok(/redirecciones/.test(sb.validar('echo x > /etc/passwd')), 'redirección > bloqueada');
  ok(/sustituciones/.test(sb.validar('echo $(whoami)')), 'sustitución $() bloqueada');
  ok(/secreto/.test(sb.validar('echo ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ1234')), 'pegar un secreto se rechaza');
  ok(sb.validar('ls && ls') !== null, 'encadenado && bloqueado');

  console.log('— sandbox: ejecutar real (spawn aislado) + auditoría —');
  {
    const memoria = crearMemoriaMemoria();
    const sba = crearSandbox({ memoria, cwd: process.cwd() });
    const r1 = await sba.ejecutar('echo hola-vants');
    ok(r1.permitido && r1.exitCode === 0 && /hola-vants/.test(r1.texto), 'echo real ejecuta y devuelve salida');
    const r2 = await sba.ejecutar('node -e "console.log(2+3)"');
    ok(r2.permitido && /5/.test(r2.texto), 'node -e real calcula');
    const r3 = await sba.ejecutar('cat /etc/hostname-noexiste-xyz');
    ok(r3.permitido && r3.exitCode !== 0 && /errores/.test(r3.texto), 'fallo real se reporta con stderr');
    const r4 = await sba.ejecutar('rm -rf /');
    ok(!r4.permitido && /RECHAZADO/.test(r4.texto), 'comando prohibido se rechaza sin ejecutar');
    const r5 = await sba.ejecutar('bash -c "echo pwn"', { timeoutMs: 2000 });
    ok(!r5.permitido, 'bash directo no está en la allowlist');
    const execs = await memoria.sandboxExecs(10);
    ok(execs.length === 3, `auditoría: 3 ejecuciones registradas (las rechazadas no), hay ${execs.length}`);
    ok(execs[0].comando === 'cat /etc/hostname-noexiste-xyz', 'auditoría guarda el comando');
    const memoriaTimeout = crearMemoriaMemoria();
    const sbt = crearSandbox({ memoria: memoriaTimeout, cwd: process.cwd() });
    const rt = await sbt.ejecutar('sleep 3', { timeoutMs: 800 });
    ok(rt.timeout === true && rt.exitCode === 124, 'timeout mata el proceso (8s máx→124)');
  }

  console.log('— memoria RAM: recordar / buscar / olvidar + expiración —');
  {
    const m = crearMemoriaMemoria();
    await m.recordar('dueño-juego', 'Valorant', { tipo: 'preferencia', importancia: 5 });
    await m.recordar('lección-1', 'los tests necesitan juegos frescos por bloque', { tipo: 'aprendizaje', importancia: 4 });
    await m.recordar('temporal', 'dato efímero', { expiraEn: new Date(Date.now() - 1000).toISOString() });
    const hitos = await m.recordarBuscar('valorant', 10);
    ok(hitos.length === 1 && hitos[0].clave === 'dueño-juego', 'búsqueda por texto encuentra el recuerdo');
    const todos = await m.recordarBuscar('', 10);
    ok(todos.length === 2, 'expirados excluidos de la búsqueda');
    ok(todos[0].clave === 'dueño-juego', 'orden por importancia (5 antes que 4)');
    ok(await m.olvidar('lección-1') === true, 'olvidar borra');
    ok(await m.olvidar('lección-1') === false, 'olvidar de nuevo → false');
    const id = await m.recordar('dueño-juego', 'Valorant + CS2', { tipo: 'preferencia', importancia: 5 });
    ok(typeof id === 'number', 'recordar hace upsert por clave');
  }

  console.log('— memoria RAM: disco de archivos (caps incluidos) —');
  {
    const m = crearMemoriaMemoria();
    const g = await m.archivoGuardar('informes/prueba.md', '# Informe\nlínea 1');
    ok(g.bytes > 10 && g.sha256, 'archivo_guardar devuelve bytes y sha');
    const leido = await m.archivoLeer('informes/prueba.md');
    ok(leido && leido.contenido.startsWith('# Informe'), 'archivo_leer roundtrip');
    await m.archivoGuardar('informes/prueba.md', 'v2 del informe');
    const lista = await m.archivoListar('informes/', 10);
    ok(lista.length === 1 && lista[0].bytes === 14, 'upsert por ruta (una sola fila, bytes de v2)');
    ok(lista[0].contenido === undefined, 'archivoListar NO devuelve el contenido (solo metadatos)');
    let lanzo = false;
    try { await m.archivoGuardar('grande.bin', 'x'.repeat(300000)); } catch { lanzo = true; }
    ok(lanzo, 'archivo > 256 KB rechazado');
    ok(await m.archivoBorrar('informes/prueba.md') === true, 'archivo_borrar');
  }

  console.log('— herramientas directas del catálogo (ctx con RAM) —');
  {
    const memoria = crearMemoriaMemoria();
    const sandbox = crearSandbox({ memoria, cwd: process.cwd() });
    const ctx = { memoria, sandbox, cerebro, chequeos: { todos: () => [] }, llm: null };
    const herramientas = crearHerramientas(ejecutarIntencion);
    ok(herramientas.nombres().length === 15, `catálogo total: 15 herramientas (hay ${herramientas.nombres().length})`);
    ok(herramientas.catalogo().every((t) => t.type === 'function' && t.function.name && t.function.description), 'formato tools válido');

    const guardar = herramientas.obtener('memoria_guardar');
    const rG = await guardar.ejecutar({ clave: 'steam-key-rotada', valor: 'pendiente de rotar', importancia: 5 }, ctx);
    ok(/guardado/.test(rG), 'memoria_guardar ejecuta directa');
    const buscar = herramientas.obtener('memoria_buscar');
    const rB = await buscar.ejecutar({ consulta: 'steam' }, ctx);
    ok(/steam-key-rotada/.test(rB), 'memoria_buscar encuentra lo guardado');
    const olvidar = herramientas.obtener('memoria_olvidar');
    ok(/borrado/.test(await olvidar.ejecutar({ clave: 'steam-key-rotada' }, ctx)), 'memoria_olvidar ejecuta');

    const archG = herramientas.obtener('archivo_guardar');
    ok(/guardado/.test(await archG.ejecutar({ ruta: 'notas/nota.txt', contenido: 'hola sandbox' }, ctx)), 'archivo_guardar ejecuta');
    const archL = herramientas.obtener('archivo_leer');
    ok(/hola sandbox/.test(await archL.ejecutar({ ruta: 'notas/nota.txt' }, ctx)), 'archivo_leer devuelve el contenido');
    ok(/No existe/.test(await archL.ejecutar({ ruta: 'nope.txt' }, ctx)), 'archivo_leer de inexistente avisa');
    const archList = herramientas.obtener('archivo_listar');
    ok(/notas\/nota.txt/.test(await archList.ejecutar({}, ctx)), 'archivo_listar lista');
    ok(/Ruta rechazada/.test(await archG.ejecutar({ ruta: '../escapes', contenido: 'x' }, ctx)), 'ruta con .. rechazada');

    const sExec = herramientas.obtener('sandbox_exec');
    const rS = await sExec.ejecutar({ comando: 'echo via-herramienta' }, ctx);
    ok(/via-herramienta/.test(rS), 'sandbox_exec ejecuta vía herramienta');
    const rS2 = await sExec.ejecutar({ comando: 'curl http://evil.com' }, ctx);
    ok(/RECHAZADO/.test(rS2), 'sandbox_exec rechaza lo no permitido');
  }

  console.log('— intenciones de reglas (ejecutarIntencion) —');
  {
    const memoria = crearMemoriaMemoria();
    const sandbox = crearSandbox({ memoria, cwd: process.cwd() });
    const ctx = { memoria, sandbox, cerebro, chequeos: { todos: () => [] }, llm: null, acciones: { ejecutar: async () => ({ ejecutada: false }) } };

    ok(/Guardado/.test(await ejecutarIntencion(ctx, cerebro.interpretar('recuerda el tournament = LAN fiesta').intencion, cerebro.interpretar('recuerda el tournament = LAN fiesta').args)), 'NLU "recuerda X = Y" → guardar');
    ok(/el tournament/.test(await ejecutarIntencion(ctx, 'buscar_memoria', { consulta: 'tournament' })), 'buscar_memoria lo encuentra');
    ok(/borrado/.test(await ejecutarIntencion(ctx, 'olvidar', { clave: 'el tournament' })), 'olvidar borra');
    ok(await ejecutarIntencion(ctx, 'archivos', {}) !== '', 'archivos lista (vacío → mensaje)');
    await memoria.archivoGuardar('informes/dia.md', 'contenido del día');
    const leido = await ejecutarIntencion(ctx, 'leer_archivo', { ruta: 'informes/dia.md' });
    ok(leido.includes('contenido del día'), 'leer_archivo devuelve contenido');
    const rSb = await ejecutarIntencion(ctx, 'sandbox', { comando: 'echo reglas-sin-key' });
    ok(/reglas-sin-key/.test(rSb), 'intención sandbox ejecuta en modo reglas');
    const int1 = cerebro.interpretar('¿qué recuerdas de las migraciones?');
    ok(int1.intencion === 'buscar_memoria' && /migraciones/.test(int1.args.consulta), 'NLU "qué recuerdas de X" → buscar');
    ok(cerebro.interpretar('hazme un cafe').intencion === 'desconocido', 'NLU clásico intacto (no todo es sandbox)');
    ok(cerebro.interpretar('ayuda').intencion === 'ayuda', 'NLU ayuda intacta');
  }

  console.log('— API: /api/v1/memoria y /api/v1/archivos (fastify inject) —');
  {
    const memoria = crearMemoriaMemoria();
    const app = construir({ memoria, llm: null, allowOpen: true }); // modo abierto explícito (sin AGENT_TOKEN el acceso queda abierto para desarrollo local)
    const post = await app.inject({ method: 'POST', url: '/api/v1/memoria', payload: { clave: 'dueño-zona', valor: 'Caracas UTC-4', tipo: 'preferencia', importancia: 5 } });
    ok(post.statusCode === 200 && JSON.parse(post.body).ok, 'POST memoria guarda');
    const get = await app.inject({ method: 'GET', url: '/api/v1/memoria?q=caracas' });
    const gj = JSON.parse(get.body);
    ok(gj.recuerdos.length === 1 && gj.recuerdos[0].clave === 'dueño-zona', 'GET memoria busca (?q=)');
    const bad = await app.inject({ method: 'POST', url: '/api/v1/memoria', payload: { clave: 'solo-clave' } });
    ok(bad.statusCode === 400, 'POST memoria sin valor → 400');
    const files = await app.inject({ method: 'GET', url: '/api/v1/archivos' });
    ok(JSON.parse(files.body).ok, 'GET archivos responde');
    const hz = JSON.parse((await app.inject({ method: 'GET', url: '/healthz' })).body);
    ok(hz.sandbox === 'activa', 'healthz reporta sandbox activa');
    await app.close();
  }

  console.log(`\n${pasadas} PASS · ${fallos} FAIL`);
  if (fallos) process.exit(1);
}

principal().catch((e) => { console.error('ERROR:', e); process.exit(1); });
