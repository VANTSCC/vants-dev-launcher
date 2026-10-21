#!/usr/bin/env node
'use strict';
// ============================================================
// TESTS del VANTS HUB · detección de juego por proceso + presencia
// Sin red y sin Electron:
//   cd repo-vants && node scripts/test_hub_juegos.js
//
// Cubre desktop-electron/renderer/juegos.js (lógica pura) y añade
// guardas sobre main.js / renderer / package.json, que NO se pueden
// ejecutar fuera de Electron.
// ============================================================

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const Module = require('module');

const HUB = path.join(__dirname, '..', 'desktop-electron');
const J = require(path.join(HUB, 'renderer', 'juegos.js'));
const leer = (...p) => fs.readFileSync(path.join(HUB, ...p), 'utf8');

let OK = 0, KO = 0;
function t(nombre, fn) {
  try { fn(); OK++; console.log('  ✓ ' + nombre); }
  catch (e) { KO++; console.error('  ✗ ' + nombre + '\n      ' + String(e.message).split('\n')[0]); }
}

console.log('\n— detectarJuego —');
t('VALORANT por su proceso real (cualquier mayúscula)', () => {
  assert.deepStrictEqual(J.detectarJuego(['explorer.exe', 'VALORANT-Win64-Shipping.exe']), { slug: 'valorant', nombre: 'VALORANT' });
});
t('CS2 → slug cs2 (el de pt_games, no el nombre de pantalla)', () => {
  assert.strictEqual(J.detectarJuego(['cs2.exe']).slug, 'cs2');
});
t('proceso con espacios: League of Legends.exe → lol', () => {
  assert.strictEqual(J.detectarJuego(['League of Legends.exe']).slug, 'lol');
});
t('REGRESIÓN: solo el Riot Client abierto NO es "jugando"', () => {
  assert.strictEqual(J.detectarJuego(['RiotClientServices.exe', 'RiotClientUx.exe']), null);
});
t('REGRESIÓN: solo el cliente de LoL (LeagueClient.exe) NO es "jugando"', () => {
  assert.strictEqual(J.detectarJuego(['LeagueClient.exe', 'RiotClientServices.exe']), null);
});
t('juego + Riot Client a la vez → el juego, no "Riot Client"', () => {
  assert.strictEqual(J.detectarJuego(['RiotClientServices.exe', 'cs2.exe']).slug, 'cs2');
});
t('los juegos que antes no se detectaban (OW2, LoL, R6, FC26) ahora sí', () => {
  assert.strictEqual(J.detectarJuego(['Overwatch.exe']).slug, 'ow2');
  assert.strictEqual(J.detectarJuego(['RainbowSix.exe']).slug, 'r6s');
  assert.strictEqual(J.detectarJuego(['FC26.exe']).slug, 'fc26');
});
t('entradas vacías o inválidas → null (sin lanzar)', () => {
  assert.strictEqual(J.detectarJuego([]), null);
  assert.strictEqual(J.detectarJuego(null), null);
  assert.strictEqual(J.detectarJuego(undefined), null);
  assert.strictEqual(J.detectarJuego('cs2.exe'), null);
  assert.strictEqual(J.detectarJuego([null, 42, {}]), null);
});
t('proceso desconocido → null', () => {
  assert.strictEqual(J.detectarJuego(['chrome.exe', 'notepad.exe']), null);
});
t('devuelve una copia: mutarla no corrompe el catálogo', () => {
  const r = J.detectarJuego(['cs2.exe']); r.nombre = 'X';
  assert.strictEqual(J.detectarJuego(['cs2.exe']).nombre, 'Counter-Strike 2');
});

console.log('\n— nombreDe (lo que pinta la lista "en vivo" del HUB) —');
t('slug de plataforma → nombre', () => { assert.strictEqual(J.nombreDe('cs2'), 'Counter-Strike 2'); });
t('slug escrito por la web (valorant) → VALORANT', () => { assert.strictEqual(J.nombreDe('valorant'), 'VALORANT'); });
t('valor heredado de HUB antiguo (nombre de pantalla) se mantiene', () => {
  assert.strictEqual(J.nombreDe('Counter-Strike 2'), 'Counter-Strike 2');
  assert.strictEqual(J.nombreDe('VALORANT'), 'VALORANT');
});
t('desconocido se devuelve tal cual; null/undefined → cadena vacía', () => {
  assert.strictEqual(J.nombreDe('cod'), 'cod');
  assert.strictEqual(J.nombreDe(null), '');
  assert.strictEqual(J.nombreDe(undefined), '');
});

console.log('\n— integridad del catálogo —');
t('slugs únicos', () => {
  const s = J.JUEGOS.map((j) => j.slug); assert.strictEqual(new Set(s).size, s.length);
});
t('procesos: minúsculas, .exe, sin repetir entre juegos', () => {
  const todos = [];
  for (const j of J.JUEGOS) for (const p of j.procesos) {
    assert.strictEqual(p, p.toLowerCase(), p + ' debe ir en minúsculas (tasklist se normaliza a minúsculas)');
    assert.ok(p.endsWith('.exe'), p + ' debe terminar en .exe');
    todos.push(p);
  }
  assert.strictEqual(new Set(todos).size, todos.length, 'un proceso no puede pertenecer a dos juegos');
});
t('ningún lanzador/cliente figura como proceso de juego', () => {
  const prohibidos = ['riotclientservices.exe', 'riotclientux.exe', 'leagueclient.exe', 'steam.exe', 'steamwebhelper.exe',
    'epicgameslauncher.exe', 'eadesktop.exe', 'origin.exe', 'battle.net.exe'];
  const todos = J.JUEGOS.flatMap((j) => j.procesos);
  for (const p of prohibidos) assert.ok(!todos.includes(p), p + ' es un cliente, no un juego');
});
t('los slugs de plataforma coinciden con pt_games (migración 28)', () => {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'db', 'migrations', '28-plataforma-torneos.sql'), 'utf8');
  for (const slug of ['valorant', 'cs2', 'dota2', 'lol', 'r6s']) {
    assert.ok(new RegExp("\\('" + slug + "'").test(sql), slug + ' no está en pt_games');
    assert.ok(J.JUEGOS.some((j) => j.slug === slug), slug + ' falta en el catálogo del HUB');
  }
});

console.log('\n— el mismo módulo funciona en el renderer (sin require) —');
t('carga como script de navegador y expone VANTS_JUEGOS', () => {
  const ctx = { self: {} }; ctx.self = ctx; vm.createContext(ctx);
  vm.runInContext(leer('renderer', 'juegos.js'), ctx);
  assert.strictEqual(typeof ctx.VANTS_JUEGOS.nombreDe, 'function');
  assert.strictEqual(ctx.VANTS_JUEGOS.nombreDe('dota2'), 'Dota 2');
});

console.log('\n— guardas sobre lo que no se puede ejecutar fuera de Electron —');
const main = leer('main.js');
t('main.js usa el catálogo compartido y ya no lleva su PROC_MAP', () => {
  assert.ok(/require\('\.\/renderer\/juegos\.js'\)/.test(main), 'falta require del catálogo');
  assert.ok(!/PROC_MAP/.test(main), 'PROC_MAP no debe volver (duplica el catálogo y trataba Riot Client como juego)');
});
t('la presencia guarda el slug y NO inventa "valorant" cuando solo está en línea', () => {
  assert.ok(/const juego = juegoSlug \|\| null;/.test(main), 'latir() debe enviar juegoSlug || null');
  assert.ok(!/juegoActual \|\| 'valorant'/.test(main), "no debe volver el default 'valorant'");
});
t('main.js carga sin errores con un electron simulado (ruta del require resuelta)', () => {
  const noop = () => {};
  const electron = {
    app: { requestSingleInstanceLock: () => false, quit: noop, on: noop, whenReady: () => ({ then: noop }),
      isPackaged: false, getPath: () => '/tmp', getVersion: () => '0.0.0' },
    BrowserWindow: function () {}, ipcMain: { handle: noop, on: noop }, shell: {}, Tray: function () {},
    Menu: { buildFromTemplate: noop }, nativeImage: { createFromPath: noop }, dialog: {}, safeStorage: {}
  };
  const cargar = Module._load;
  Module._load = function (req, ...r) { return req === 'electron' ? electron : cargar.call(this, req, ...r); };
  try { delete require.cache[require.resolve(path.join(HUB, 'main.js'))]; require(path.join(HUB, 'main.js')); }
  finally { Module._load = cargar; }
});
t('el módulo se empaqueta (build.files cubre renderer/) y el renderer lo carga antes que app.js', () => {
  const files = JSON.parse(leer('package.json')).build.files;
  assert.ok(files.includes('renderer/**/*'), 'build.files debe incluir renderer/**/*');
  const html = leer('renderer', 'index.html');
  const iJ = html.indexOf('src="juegos.js"'), iA = html.indexOf('src="app.js"');
  assert.ok(iJ > -1 && iA > -1 && iJ < iA, 'juegos.js debe cargarse antes que app.js');
});
t('la lista "en vivo" del HUB traduce el slug al nombre (no pinta "R6S"/"OW2")', () => {
  assert.ok(/VANTS_JUEGOS\.nombreDe\(f\.juego\)/.test(leer('renderer', 'app.js')));
});

console.log('\n' + '='.repeat(44));
console.log('  HUB · detección de juego · ' + OK + ' ✓ · ' + KO + ' ✗');
console.log('='.repeat(44));
process.exit(KO ? 1 : 0);
