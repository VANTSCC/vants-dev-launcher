#!/usr/bin/env node
/* ============================================================
   T52 · audit_enlaces.js — F16: crawler de enlaces internos
   ------------------------------------------------------------
   Parsea los HTML del sitio (espejo vants-server/public), extrae
   href/src internos y verifica que el destino existe como archivo
   o como ruta manejada por el Worker (rutas dinámicas conocidas).
   NUNCA toca la red: auditoría local del árbol estático.
   Uso: node scripts/audit_enlaces.js
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');

const BASE = path.join(__dirname, '..', 'vants-server', 'public');

/* Rutas que el Worker maneja aunque no existan como archivo */
const RUTAS_WORKER = new Set([
  '/', '/torneo', '/torneo.html', '/torneos', '/torneos.html',
  '/es/tournaments', '/en/tournaments',
  '/es/tournaments/valorant/upcoming/', '/es/tournaments/valorant/ongoing/', '/es/tournaments/valorant/archive/',
  '/es/tournaments/cs2/upcoming/', '/es/tournaments/cs2/ongoing/', '/es/tournaments/cs2/archive/',
  '/es/tournaments/dota2/upcoming/', '/es/tournaments/dota2/ongoing/', '/es/tournaments/dota2/archive/',
  '/en/tournaments/valorant/upcoming/', '/en/tournaments/valorant/ongoing/', '/en/tournaments/valorant/archive/',
  '/en/tournaments/cs2/upcoming/', '/en/tournaments/cs2/ongoing/', '/en/tournaments/cs2/archive/',
  '/en/tournaments/dota2/upcoming/', '/en/tournaments/dota2/ongoing/', '/en/tournaments/dota2/archive/',
]);

let OK = 0, KO = 0;
const roto = [];
const htmls = fs.readdirSync(BASE).filter((f) => f.endsWith('.html'));

for (const pag of htmls) {
  const full = fs.readFileSync(path.join(BASE, pag), 'utf8');
  // HTML sin los <script> inline (su JS contiene href/src de concatenación, no enlaces reales)
  const html = full.replace(/<script[\s\S]*?<\/script>/gi, '');
  const hrefs = [...html.matchAll(/(?:href|src)="([^"#]+)(?:#[^"]*)?"/g)].map((m) => m[1]);
  const unicos = [...new Set(hrefs)];
  for (let h of unicos) {
    if (/^(https?:|data:|mailto:|javascript:)/.test(h)) { OK++; continue; }
    if (h.startsWith('#')) { OK++; continue; }
    // query strings no cambian el archivo servido
    h = h.split('?')[0];
    if (h.startsWith('/')) {
      if (RUTAS_WORKER.has(h) || RUTAS_WORKER.has(h.endsWith('/') ? h : h + '/')) { OK++; continue; }
      const destino = path.join(BASE, h);
      if (fs.existsSync(destino)) { OK++; continue; }
      KO++; roto.push(pag + ' → ' + h);
      continue;
    }
    // relativo ./assets/x.html o torneo.html
    const limpio = h.replace(/^\.\//, '');
    if (fs.existsSync(path.join(BASE, limpio))) { OK++; continue; }
    KO++; roto.push(pag + ' → ' + h);
  }
}

console.log('AUDITORÍA DE ENLACES (local, ' + htmls.length + ' páginas)');
console.log('  ✓ enlaces válidos: ' + OK);
if (KO) {
  console.log('  ✗ rotos: ' + KO);
  for (const r of roto) console.log('      ' + r);
} else {
  console.log('  ✗ rotos: 0');
}
process.exit(KO ? 1 : 0);
