'use strict';
// ============================================================
// NUCLEO del AGENTE VANTS — orquesta un ciclo completo:
//   1. abre run en la memoria          4. ejecuta acciones automaticas seguras
//   2. ejecuta los chequeos            5. atiende comandos pendientes del dueno
//   3. el cerebro decide e inserta     6. cierra el run con resumen
//      incidentes (dedupe en Neon)
// Lo usan igual el CLI, la API y el workflow de CI.
// ============================================================

const { AYUDA } = require('./cerebro');
const { crearHerramientas } = require('./herramientas');

// catálogo de herramientas del cerebro (GLM function calling)
const herramientas = crearHerramientas((ctx, intencion, args) => ejecutarIntencion(ctx, intencion, args));

async function ejecutarChequeos(chequeos) {
  const resultados = [];
  for (const promesa of chequeos.todos()) {
    try { resultados.push(await promesa); }
    catch (e) { resultados.push({ id: 'interno', label: 'Chequeo interno', estado: 'aviso', detalle: String(e.message).slice(0, 120) }); }
  }
  return resultados;
}

// Atiende UNA intencion ya interpretada. Devuelve texto de respuesta.
async function ejecutarIntencion(ctx, intencion, args = {}) {
  const { memoria, chequeos, acciones, cerebro, llm } = ctx;
  switch (intencion) {
    case 'estado': {
      const ultimo = await memoria.ultimoRun();
      const abiertos = await memoria.incidentesAbiertos(5);
      const partes = [];
      partes.push(`Ultimo ciclo: ${ultimo ? `${ultimo.estado_global} (${new Date(ultimo.started_at).toISOString().slice(0, 16).replace('T', ' ')} UTC)` : 'nunca ejecutado'}`);
      if (ultimo && ultimo.resumen) partes.push(ultimo.resumen);
      partes.push(`Incidentes abiertos: ${abiertos.length ? abiertos.map((e) => `#${e.id} ${e.titulo}`).join(' · ') : 'ninguno'}`);
      return partes.join('\n');
    }
    case 'informe': {
      const resultados = await ejecutarChequeos(chequeos);
      const abiertos = await memoria.incidentesAbiertos(10);
      const texto = cerebro.informe(resultados, { incidentesAbiertos: abiertos.length });
      if (llm) { const narrado = await llm.narrar(texto); if (narrado) return narrado; }
      return texto;
    }
    case 'ciclo': {
      const r = await ejecutarCiclo(ctx, { fuente: 'discord' });
      return `Ciclo completado: ${r.resumen}`;
    }
    case 'desplegar_web': {
      const r = await acciones.ejecutar('redispatch_cloudflare', { motivo: 'orden del dueno' });
      return r.ejecutada ? `Despliegue de la web re-lanzado. ${r.resultado}` : `No pude re-lanzar el despliegue: ${r.resultado}`;
    }
    case 'migrar': {
      const r = await acciones.ejecutar('redispatch_neon_migrate', { motivo: 'orden del dueno' });
      return r.ejecutada ? `Migraciones re-lanzadas. ${r.resultado}` : `No pude re-lanzar migraciones: ${r.resultado}`;
    }
    case 'incidentes': {
      const abiertos = await memoria.incidentesAbiertos(15);
      if (!abiertos.length) return 'Sin incidentes abiertos. Todo controlado.';
      return 'Incidentes abiertos:\n' + abiertos.map((e) => `#${e.id} [${e.severity}] ${e.titulo}`).join('\n');
    }
    case 'resolver': {
      if (!args.id) return 'Dime el numero del incidente: "resuelve 12".';
      const ok = await memoria.resolverIncidente(args.id, 'resuelto por orden del dueno');
      return ok ? `Incidente #${args.id} marcado como resuelto.` : `No encontre un incidente abierto #${args.id}.`;
    }
    case 'ayuda': return AYUDA;
    // ── SANDBOX AGENT (migración 26): memoria semántica + disco + ejecución ──
    case 'recordar': {
      if (!args.clave || args.valor == null) return 'Formato: recuerda clave = valor';
      const id = await memoria.recordar(args.clave, args.valor, { creadoPor: 'dueno' });
      return `Guardado en mi memoria: "${args.clave}" → ${String(args.valor).slice(0, 120)}`;
    }
    case 'buscar_memoria': {
      const filas = await memoria.recordarBuscar(args.consulta || '', 10);
      if (!filas.length) return 'No tengo recuerdos que coincidan con eso.';
      return 'Mi memoria:\n' + filas.map((f) => `• [${f.tipo}·${f.importancia}] ${f.clave}: ${String(f.valor).slice(0, 140)}`).join('\n');
    }
    case 'olvidar': {
      if (!args.clave) return 'Dime la clave del recuerdo a borrar: "olvida clave".';
      const ok = await memoria.olvidar(args.clave);
      return ok ? `Recuerdo "${args.clave}" borrado.` : `No tenía ningún recuerdo con clave "${args.clave}".`;
    }
    case 'archivos': {
      const filas = await memoria.archivoListar('', 50);
      if (!filas.length) return 'El disco de la sandbox está vacío.';
      return 'Ficheros de la sandbox:\n' + filas.map((f) => `• ${f.ruta} (${f.bytes} B)`).join('\n');
    }
    case 'leer_archivo': {
      if (!args.ruta) return 'Dime la ruta del fichero: "lee el archivo informes/x.md".';
      const f = await memoria.archivoLeer(args.ruta);
      if (!f) return `No existe el fichero "${args.ruta}".`;
      return `--- ${f.ruta} (${f.bytes} B) ---\n${String(f.contenido).slice(0, 6000)}`;
    }
    case 'sandbox': {
      if (!ctx.sandbox) return 'La sandbox no está disponible en este entorno.';
      if (!args.comando) return 'Dime el comando entre comillas: "ejecuta \\"node -v\\"".';
      const r = await ctx.sandbox.ejecutar(args.comando, {});
      return r.texto;
    }
    default: {
      if (llm && args.texto) {
        const narrado = await llm.narrar(`El dueno de VANTS dice: "${args.texto}". Contexto: eres el agente de control; explica breve que no puedes con eso o da una opinion util del estado.`);
        if (narrado) return narrado;
      }
      return `No entendi esa orden.\n\n${AYUDA}`;
    }
  }
}

// Procesa los comandos pendientes (tabla agent_comandos, ruta Discord sin servidor)
async function procesarComandos(ctx) {
  const { memoria, cerebro, llm } = ctx;
  const pendientes = await memoria.comandosPendientes(10);
  const hechos = [];
  for (const cmd of pendientes) {
    let respuesta = null;
    // 1) camino AGÉNTICO: GLM con herramientas reales (si hay key configurada)
    if (llm && typeof llm.conversar === 'function') {
      try { respuesta = await llm.conversar(cmd.texto, herramientas, ctx); } catch {}
    }
    // 2) camino clásico: intención fija + ejecución (modo reglas)
    if (respuesta == null) {
      let intento = null;
      if (llm) { try { intento = await llm.interpretar(cmd.texto); } catch {} }
      const interpretado = intento || cerebro.interpretar(cmd.texto);
      try { respuesta = await ejecutarIntencion(ctx, interpretado.intencion, interpretado.args || {}); }
      catch (e) { respuesta = `Error al procesar: ${String(e.message).slice(0, 140)}`; await memoria.responderComando(cmd.id, respuesta, false); hechos.push(cmd.id); continue; }
    }
    await memoria.responderComando(cmd.id, respuesta, true);
    hechos.push(cmd.id);
  }
  return hechos;
}

async function ejecutarCiclo(ctx, opciones = {}) {
  const { memoria, chequeos, cerebro, acciones } = ctx;
  const runId = await memoria.abrirRun({ fuente: opciones.fuente || 'cli', modo: opciones.modo || 'ciclo', comando: opciones.comando || null });
  const registro = { acciones: [] };
  try {
    const resultados = await ejecutarChequeos(chequeos);
    const decision = cerebro.evaluar(resultados);
    registro.resultados = resultados;
    registro.decision = { estadoGlobal: decision.estadoGlobal, resumen: decision.resumen };

    // incidentes a memoria (dedupe_key evita duplicados; reabre si volvio)
    for (const inc of decision.incidentes) {
      try { await memoria.incidente(inc); } catch {}
    }

    // acciones automaticas seguras
    for (const accion of decision.acciones || []) {
      if (accion.seguridad !== 'auto') continue;
      const r = await acciones.ejecutar(accion.id, { motivo: accion.motivo, sha: accion.sha, runId: accion.runId, uid: accion.uid });
      registro.acciones.push({ id: accion.id, ...r });
    }

    // comandos pendientes del dueno (ruta Discord -> Neon)
    try { const hechos = await procesarComandos(ctx); if (hechos.length) registro.acciones.push({ id: 'comandos_procesados', ejecutada: true, resultado: `${hechos.length} comando(s)` }); }
    catch {}

    await memoria.cerrarRun(runId, { estado_global: decision.estadoGlobal, hallazgos: resultados, acciones: registro.acciones, resumen: decision.resumen });
    // estado de la capa IA (diagnóstico: probar() = llamada mínima de ~8 tokens)
    let ia = { activa: false, modo: 'reglas' };
    if (ctx.llm && typeof ctx.llm.activo === 'function' && ctx.llm.activo() && typeof ctx.llm.probar === 'function') {
      try {
        const p = await ctx.llm.probar();
        ia = p && p.ok
          ? { activa: true, modelo: p.modelo, estado: 'ok' }
          : { activa: true, modelo: (p && p.modelo) || null, estado: `fallo:${(p && p.motivo) || 'desconocido'}` };
      } catch { ia = { activa: true, modelo: null, estado: 'fallo:excepcion' }; }
    }
    const resumenFinal = decision.resumen + (ia.activa && ia.estado !== 'ok' ? ` · IA ${ia.estado}` : '');
    if (resumenFinal !== decision.resumen) {
      await memoria.cerrarRun(runId, { estado_global: decision.estadoGlobal, hallazgos: resultados, acciones: registro.acciones, resumen: resumenFinal }).catch(() => {});
    }
    return { run_id: runId, estado: decision.estadoGlobal, resumen: resumenFinal, hallazgos: resultados, acciones: registro.acciones, ia };
  } catch (e) {
    await memoria.cerrarRun(runId, { estado_global: 'DESCONOCIDO', hallazgos: registro.resultados || [], acciones: registro.acciones, resumen: 'ciclo interrumpido', error: String(e.message).slice(0, 300) });
    throw e;
  }
}

module.exports = { ejecutarCiclo, ejecutarIntencion, ejecutarChequeos, procesarComandos };
