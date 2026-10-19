'use strict';
// ============================================================
// HERRAMIENTAS del AGENTE VANTS — las manos del cerebro (GLM).
// Cada herramienta envuelve 1:1 una intención del núcleo
// (ejecutarIntencion): CERO lógica duplicada. GLM decide CUÁL
// ejecutar y con qué argumentos (function calling estándar
// OpenAI-compatible: tools / tool_calls).
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
];

function crearHerramientas(ejecutarIntencion) {
  return {
    // catálogo en formato tools de OpenAI/GLM
    catalogo: () => LISTA.map((h) => ({
      type: 'function',
      function: { name: h.nombre, description: h.descripcion, parameters: h.parametros },
    })),
    // ejecutor por nombre: devuelve { ejecutar(args, ctx) } o null
    obtener: (nombre) => {
      const h = LISTA.find((x) => x.nombre === nombre);
      if (!h) return null;
      return {
        nombre: h.nombre,
        ejecutar: async (args, ctx) => ejecutarIntencion(ctx, h.intencion, args || {}),
      };
    },
    // util para tests/docs: nombres expuestos
    nombres: () => LISTA.map((h) => h.nombre),
  };
}

module.exports = { crearHerramientas, LISTA };
