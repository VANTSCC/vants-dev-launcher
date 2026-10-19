'use strict';
// ============================================================
// HERRAMIENTAS del AGENTE VANTS — las manos del cerebro (GLM).
// Dos clases de herramientas:
//   1. Herramientas de INTENCIÓN: envuelven 1:1 ejecutarIntencion
//      (estado, informe, incidentes, resolver, ciclo, desplegar_web,
//      migrar, ayuda) — cero lógica duplicada.
//   2. Herramientas DIRECTAS (SANDBOX AGENT, migración 26): memoria
//      semántica (recordar/buscar/olvidar), el disco de la sandbox
//      (archivo_guardar/leer/listar) y la propia sandbox_exec para
//      ejecutar comandos aislados — usan ctx.memoria y ctx.sandbox.
// Para evitar dependencias circulares, este módulo recibe el
// ejecutor de intenciones por parámetro: crearHerramientas(fn).
// ============================================================

const LISTA = [
  {
    nombre: 'estado', intencion: 'estado',
    descripcion: 'Estado general de la plataforma: último ciclo de vigilancia (UP/DEGRADED/DOWN) e incidentes abiertos.',
    parametros: { type: 'object', properties: {} },
  },
  {
    nombre: 'informe', intencion: 'informe',
    descripcion: 'Diagnóstico completo EN VIVO: web, worker FACEIT, launcher/auto-update, workflows de CI y base de datos Neon.',
    parametros: { type: 'object', properties: {} },
  },
  {
    nombre: 'incidentes', intencion: 'incidentes',
    descripcion: 'Lista los incidentes abiertos con número, severidad y título.',
    parametros: { type: 'object', properties: { limite: { type: 'number', description: 'Máximo de incidentes a listar (por defecto 15)' } } },
  },
  {
    nombre: 'resolver', intencion: 'resolver',
    descripcion: 'Marca un incidente abierto como resuelto. Necesita el número del incidente.',
    parametros: { type: 'object', properties: { id: { type: 'number', description: 'Número del incidente (ej. 7 para #7)' } }, required: ['id'] },
  },
  {
    nombre: 'ciclo', intencion: 'ciclo',
    descripcion: 'Ejecuta AHORA un ciclo completo de vigilancia (chequeos + decisiones + acciones automáticas).',
    parametros: { type: 'object', properties: {} },
  },
  {
    nombre: 'desplegar_web', intencion: 'desplegar_web',
    descripcion: 'Re-lanza el despliegue de la web (workflow de Cloudflare Workers en GitHub Actions).',
    parametros: { type: 'object', properties: {} },
  },
  {
    nombre: 'migrar', intencion: 'migrar',
    descripcion: 'Re-lanza las migraciones de la base de datos Neon (workflow neon-migrate).',
    parametros: { type: 'object', properties: {} },
  },
  {
    nombre: 'ayuda', intencion: 'ayuda',
    descripcion: 'Muestra qué sabe hacer el Agente VANTS.',
    parametros: { type: 'object', properties: {} },
  },

  // ── SANDBOX AGENT: memoria semántica ──
  {
    nombre: 'memoria_guardar', descripcion: 'Guarda un recuerdo permanente en la memoria semántica (hechos, aprendizajes, preferencias del dueño). Upsert por clave.',
    parametros: {
      type: 'object',
      properties: {
        clave: { type: 'string', description: 'Identificador corto y único, ej. "dueño-juego-favorito"' },
        valor: { type: 'string', description: 'Contenido del recuerdo' },
        tipo: { type: 'string', description: 'hecho | aprendizaje | preferencia | nota' },
        importancia: { type: 'number', description: '1..5 (5 = crítico, nunca olvidar)' },
      },
      required: ['clave', 'valor'],
    },
    ejecutarDirecta: async (ctx, args) => {
      if (!args.clave || args.valor == null) return 'Falta clave y/o valor: memoria_guardar({clave, valor, tipo?, importancia?}).';
      const id = await ctx.memoria.recordar(args.clave, args.valor, { tipo: args.tipo, importancia: args.importancia, creadoPor: 'agente' });
      return `Recuerdo guardado (id ${id}): "${args.clave}" → ${String(args.valor).slice(0, 120)}`;
    },
  },
  {
    nombre: 'memoria_buscar', descripcion: 'Busca en la memoria semántica del agente por texto (clave, valor o tipo). Úsala ANTES de preguntar al dueño algo que ya sabes.',
    parametros: {
      type: 'object',
      properties: {
        consulta: { type: 'string', description: 'Texto a buscar (vacío = listar los más importantes)' },
        limite: { type: 'number', description: 'Máximo de recuerdos (por defecto 10)' },
      },
    },
    ejecutarDirecta: async (ctx, args) => {
      const filas = await ctx.memoria.recordarBuscar(args.consulta || '', Math.max(1, Math.min(25, Number(args.limite) || 10)));
      if (!filas.length) return 'No encontré recuerdos con esa búsqueda.';
      return filas.map((f) => `• [${f.tipo}·${f.importancia}] ${f.clave}: ${String(f.valor).slice(0, 160)}`).join('\n');
    },
  },
  {
    nombre: 'memoria_olvidar', descripcion: 'Borra un recuerdo de la memoria semántica por su clave.',
    parametros: { type: 'object', properties: { clave: { type: 'string', description: 'Clave exacta del recuerdo a borrar' } }, required: ['clave'] },
    ejecutarDirecta: async (ctx, args) => {
      if (!args.clave) return 'Dime la clave del recuerdo a borrar.';
      const ok = await ctx.memoria.olvidar(args.clave);
      return ok ? `Recuerdo "${args.clave}" borrado.` : `No existía ningún recuerdo con clave "${args.clave}".`;
    },
  },

  // ── SANDBOX AGENT: el disco (ficheros persistentes en Neon) ──
  {
    nombre: 'archivo_guardar', descripcion: 'Guarda un fichero en el disco de la sandbox (persistente en Neon, máx 256 KB). Para informes, notas largas, scripts reutilizables.',
    parametros: {
      type: 'object',
      properties: {
        ruta: { type: 'string', description: 'Ruta lógica, ej. "informes/2026-10-19.md" o "scripts/check-mmr.js"' },
        contenido: { type: 'string', description: 'Contenido completo del fichero (texto)' },
      },
      required: ['ruta', 'contenido'],
    },
    ejecutarDirecta: async (ctx, args) => {
      if (!args.ruta || args.contenido == null) return 'Falta ruta y/o contenido: archivo_guardar({ruta, contenido}).';
      if (/[`;$&]/.test(String(args.ruta)) || String(args.ruta).includes('..')) return 'Ruta rechazada por seguridad (sin .., `, ;, $, &).';
      const r = await ctx.memoria.archivoGuardar(args.ruta, args.contenido);
      return `Fichero "${args.ruta}" guardado (${r.bytes} bytes, sha ${r.sha256}).`;
    },
  },
  {
    nombre: 'archivo_leer', descripcion: 'Lee un fichero del disco de la sandbox por su ruta.',
    parametros: { type: 'object', properties: { ruta: { type: 'string', description: 'Ruta lógica del fichero' } }, required: ['ruta'] },
    ejecutarDirecta: async (ctx, args) => {
      if (!args.ruta) return 'Dime la ruta del fichero a leer.';
      const f = await ctx.memoria.archivoLeer(args.ruta);
      if (!f) return `No existe el fichero "${args.ruta}". Usa archivo_listar para ver qué hay.`;
      return `--- ${f.ruta} (${f.bytes} bytes) ---\n${String(f.contenido).slice(0, 8000)}`;
    },
  },
  {
    nombre: 'archivo_listar', descripcion: 'Lista los ficheros guardados en el disco de la sandbox (opcionalmente por prefijo de ruta).',
    parametros: { type: 'object', properties: { prefijo: { type: 'string', description: 'Filtro por prefijo, ej. "informes/"' } } },
    ejecutarDirecta: async (ctx, args) => {
      const filas = await ctx.memoria.archivoListar(String(args.prefijo || ''), 50);
      if (!filas.length) return 'El disco de la sandbox está vacío (o sin coincidencias).';
      return filas.map((f) => `• ${f.ruta} (${f.bytes} B, ${String(f.updated_at).slice(0, 16).replace('T', ' ')})`).join('\n');
    },
  },

  // ── SANDBOX AGENT: ejecución aislada ──
  {
    nombre: 'sandbox_exec', descripcion: 'Ejecuta UN comando de solo lectura/diagnóstico en la sandbox autoalojada (runner efímero, aislado, auditado). Permitidos: node, npm test, python3, ls, cat, head, tail, wc, grep, rg, find, echo, date, uname, df, du, ps, sort, uniq, cut, awk, jq. Prohibidos: escrituras, red, sudo, git push.',
    parametros: {
      type: 'object',
      properties: {
        comando: { type: 'string', description: 'Un solo comando (se permiten tuberías |), ej. "node -v" o "cat package.json | grep name"' },
        timeout_ms: { type: 'number', description: 'Timeout en ms (1000..30000, por defecto 10000)' },
      },
      required: ['comando'],
    },
    ejecutarDirecta: async (ctx, args) => {
      if (!ctx.sandbox) return 'Sandbox no disponible en este entorno.';
      if (!args.comando) return 'Dime el comando a ejecutar.';
      const r = await ctx.sandbox.ejecutar(args.comando, { timeoutMs: args.timeout_ms });
      return r.texto;
    },
  },
];

function crearHerramientas(ejecutarIntencion) {
  return {
    // catálogo en formato tools de OpenAI/GLM
    catalogo: () => LISTA.map((h) => ({
      type: 'function',
      function: { name: h.nombre, description: h.descripcion, parameters: h.parametros },
    })),
    // ejecutor por nombre: herramientas de intención → ejecutarIntencion;
    // directas → su propia función con ctx (memoria/sandbox)
    obtener: (nombre) => {
      const h = LISTA.find((x) => x.nombre === nombre);
      if (!h) return null;
      if (h.ejecutarDirecta) return { nombre: h.nombre, ejecutar: (args, ctx) => h.ejecutarDirecta(ctx, args || {}) };
      return { nombre: h.nombre, ejecutar: async (args, ctx) => ejecutarIntencion(ctx, h.intencion, args || {}) };
    },
    // util para tests/docs: nombres expuestos
    nombres: () => LISTA.map((h) => h.nombre),
  };
}

module.exports = { crearHerramientas, LISTA };
