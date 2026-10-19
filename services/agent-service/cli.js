#!/usr/bin/env node
'use strict';
// ============================================================
// CLI del AGENTE VANTS — el mando del dueño y de CI.
//   node cli.js ciclo              → vigilancia completa (CI cada 30 min)
//   node cli.js estado             → último estado + incidentes
//   node cli.js informe            → diagnóstico completo legible
//   node cli.js comando "texto"    → orden en lenguaje natural
// Memoria: Neon (DATABASE_URL postgres://) o RAM si no hay credenciales.
// ============================================================

const { construirContexto } = require('./server');
const { ejecutarCiclo, ejecutarIntencion } = require('./nucleo');

async function principal() {
  const ctx = construirContexto();
  const [, , comando, ...resto] = process.argv;
  const textoLibre = resto.join(' ').trim();

  try {
    if (comando === 'ciclo') {
      const r = await ejecutarCiclo(ctx, { fuente: 'cli' });
      console.log(JSON.stringify(r, null, 2));
    } else if (comando === 'informe') {
      const r = await ejecutarIntencion(ctx, 'informe', {});
      console.log(r);
    } else if (comando === 'estado') {
      const r = await ejecutarIntencion(ctx, 'estado', {});
      console.log(r);
    } else if (comando === 'comando') {
      if (!textoLibre) { console.error('uso: node cli.js comando "texto de la orden"'); process.exitCode = 2; return; }
      let interpretado = null;
      if (ctx.llm) { try { interpretado = await ctx.llm.interpretar(textoLibre); } catch {} }
      if (!interpretado) interpretado = ctx.cerebro.interpretar(textoLibre);
      const respuesta = await ejecutarIntencion(ctx, interpretado.intencion, interpretado.args || {});
      console.log(`[intencion: ${interpretado.intencion}${interpretado.via ? ' · ' + interpretado.via : ''}]`);
      console.log(respuesta);
    } else {
      console.log('uso: node cli.js <ciclo|estado|informe|comando "texto">');
      process.exitCode = comando ? 2 : 0;
    }
  } finally {
    await ctx.memoria.cerrar();
  }
}

principal().catch((e) => { console.error('[agente] error:', e.message); process.exit(1); });
