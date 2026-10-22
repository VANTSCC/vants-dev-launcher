#!/usr/bin/env node
'use strict';
// ============================================================
// TESTS de seguridad del VANTS HUB · puente IPC (proceso principal)
// Sin red y sin Electron:
//   cd repo-vants && node scripts/test_hub_seguridad.js
//
// Cubre desktop-electron/seguridad.js (lógica pura) y vigila que main.js
// la use y que el renderer no se desincronice de las listas permitidas.
// ============================================================

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const HUB = path.join(__dirname, '..', 'desktop-electron');
const S = require(path.join(HUB, 'seguridad.js'));
const leer = (...p) => fs.readFileSync(path.join(HUB, ...p), 'utf8');

let OK = 0, KO = 0;
function t(nombre, fn) {
  try { fn(); OK++; console.log('  ✓ ' + nombre); }
  catch (e) { KO++; console.error('  ✗ ' + nombre + '\n      ' + String(e.message).split('\n')[0]); }
}

console.log('\n— urlExternaPermitida (hub:abrir) —');
t('permite lo que el HUB abre de verdad', () => {
  for (const u of ['https://vants.vants.workers.dev/tienda.html', 'https://playvalorant.com/', 'steam://rungameid/730',
    'com.epicgames.launcher://apps/Sugar?action=launch&silent=true',
    'com.epicgames.launcher://apps/' + encodeURIComponent('Mi Juego') + '?action=launch&silent=true'])
    assert.ok(S.urlExternaPermitida(u), u);
});
t('bloquea protocolos que ejecutan cosas en el sistema', () => {
  for (const u of ['file:///C:/Windows/System32/calc.exe', 'javascript:alert(1)', 'ms-msdt:/id PCWDiagnostic',
    'search-ms:query=a&crumb=location:\\\\evil\\share', 'ssh://evil/x', 'vbscript:x', 'data:text/html,<b>x</b>', 'ftp://x/y',
    'calculator:', 'http://vants.vants.workers.dev/'])
    assert.ok(!S.urlExternaPermitida(u), u + ' debería bloquearse');
});
t('steam:// y Epic: formato estricto (sin comandos extra ni otras rutas)', () => {
  for (const u of ['steam://run/730', 'steam://rungameid/730 -applaunch', 'steam://rungameid/7a', 'steam://rungameid/../x',
    'steam://rungameid/', 'com.epicgames.launcher://apps/X?action=launch&silent=true&extra=1', 'com.epicgames.launcher://store/x'])
    assert.ok(!S.urlExternaPermitida(u), u + ' debería bloquearse');
});
t('https con credenciales o inválido → bloqueado', () => {
  for (const u of ['https://user:pass@evil.com/', 'https://', '//evil.com', 'evil.com', 'https:evil', 'https:/evil.com', 'https:\\\\evil.com', 'https://evil.com\\@vants.vants.workers.dev/'])
    assert.ok(!S.urlExternaPermitida(u), u + ' debería bloquearse');
});
t('entradas no-cadena, vacías, con espacios/control o gigantes → bloqueado', () => {
  for (const u of [null, undefined, 42, {}, [], '', 'https://a.com/ b', 'https://a.com/\r\nX: 1', 'https://a.com/\u0000', 'https://a.com/' + 'a'.repeat(2100)])
    assert.ok(!S.urlExternaPermitida(u));
});

console.log('\n— validarPeticionApi (hub:api) —');
t('permite las llamadas reales del renderer', () => {
  assert.deepStrictEqual(S.validarPeticionApi('/players?select=id,username&order=xp.desc&limit=50'), { ok: true, metodo: 'GET' });
  assert.deepStrictEqual(S.validarPeticionApi('/vants_links', 'POST', 'resolution=merge-duplicates'), { ok: true, metodo: 'POST' });
  assert.ok(S.validarPeticionApi('/vants_links?auth0_sub=eq.google-oauth2%7C1&platform=eq.riot', 'DELETE').ok);
  assert.ok(S.validarPeticionApi('/rpc/mm_encolar', 'POST').ok);
  assert.ok(S.validarPeticionApi('/players?or=(username.ilike.*ab*,display_name.ilike.*ab*)&limit=5').ok);
});
t('normaliza el método (minúsculas y valor por defecto)', () => {
  assert.strictEqual(S.validarPeticionApi('/players', 'post').metodo, 'POST');
  assert.strictEqual(S.validarPeticionApi('/players', null).metodo, 'GET');
});
t('bloquea tablas y funciones fuera de la lista', () => {
  for (const r of ['/pt_inscripciones', '/web_events', '/presence', '/rpc/otra_funcion', '/rpc', '/rpc/', '/information_schema'])
    assert.ok(!S.validarPeticionApi(r, 'POST').ok, r);
});
t('RPC solo con POST y sin query', () => {
  assert.ok(!S.validarPeticionApi('/rpc/mm_encolar', 'GET').ok);
  assert.ok(!S.validarPeticionApi('/rpc/mm_encolar?x=1', 'POST').ok);
});
t('bloquea subrutas, traversal, URLs absolutas y espacios', () => {
  for (const r of ['/players/x/y', '/players/../web_events', '../players', '//evil.com/players', 'https://evil.com/players',
    '/players?x=1 or 1=1', '/players?x=\\y', 'players', '', '/'])
    assert.ok(!S.validarPeticionApi(r).ok, JSON.stringify(r));
});
t('métodos fuera de GET/POST/PATCH/DELETE y rutas no-cadena → bloqueado', () => {
  for (const m of ['PUT', 'TRACE', 'CONNECT', 'OPTIONS', '', 'GET /x']) assert.ok(!S.validarPeticionApi('/players', m).ok, m);
  for (const r of [null, undefined, 42, {}]) assert.ok(!S.validarPeticionApi(r).ok);
});
t('cabecera Prefer: solo valores simples (sin inyección CRLF)', () => {
  assert.ok(S.validarPeticionApi('/players', 'POST', 'return=representation').ok);
  for (const p of ['x\r\nInjected: 1', 'a;b', '', 42, 'a'.repeat(101)]) assert.ok(!S.validarPeticionApi('/players', 'POST', p).ok);
});

console.log('\n— idDeJuego / resolverLanzamiento (hub:jugar) —');
const BIB = [
  { fuente: 'riot', id: 'valorant', nombre: 'VALORANT', exe: 'C:\\Riot Games\\Riot Client\\RiotClientServices.exe', args: ['--launch-product=valorant', '--launch-patchline=live'] },
  { fuente: 'steam', id: '730', nombre: 'Counter-Strike 2', lanzar: 'steam://rungameid/730' },
  { fuente: 'epic', id: 'Sugar', nombre: 'Rocket League', lanzar: 'com.epicgames.launcher://apps/Sugar?action=launch&silent=true' }
];
t('idDeJuego: acepta id (cadena/número) o el objeto heredado, y nada más', () => {
  assert.strictEqual(S.idDeJuego('valorant'), 'valorant');
  assert.strictEqual(S.idDeJuego(730), '730');
  assert.strictEqual(S.idDeJuego({ id: '730', nombre: 'x' }), '730');
  for (const v of [null, undefined, {}, [], '', '   ', 'a'.repeat(201), NaN, true]) assert.strictEqual(S.idDeJuego(v), null);
});
t('Riot → proceso con el ejecutable y argumentos de la biblioteca', () => {
  const r = S.resolverLanzamiento(BIB, 'valorant');
  assert.strictEqual(r.tipo, 'proceso');
  assert.ok(/RiotClientServices\.exe$/.test(r.exe));
  assert.deepStrictEqual(r.args, ['--launch-product=valorant', '--launch-patchline=live']);
});
t('Steam y Epic → url', () => {
  assert.deepStrictEqual(S.resolverLanzamiento(BIB, '730'), { tipo: 'url', url: 'steam://rungameid/730' });
  assert.strictEqual(S.resolverLanzamiento(BIB, 'Sugar').tipo, 'url');
});
t('PROPIEDAD CLAVE: el renderer no puede colar su propio exe/args/url', () => {
  // un renderer comprometido manda el objeto con un exe malicioso pero el id de un juego real
  const malicioso = { id: 'valorant', exe: 'C:\\Windows\\System32\\cmd.exe', args: ['/c', 'calc'], lanzar: 'file:///C:/x.exe' };
  const r = S.resolverLanzamiento(BIB, S.idDeJuego(malicioso));
  assert.strictEqual(r.tipo, 'proceso');
  assert.ok(!/cmd\.exe/i.test(r.exe) && r.args.every((a) => a.startsWith('--launch-')), 'debe usar SOLO lo detectado por main');
});
t('un id que main no detectó → error (no se ejecuta nada)', () => {
  assert.deepStrictEqual(S.resolverLanzamiento(BIB, 'calc'), { error: 'juego no encontrado' });
  for (const b of [[], null, undefined, 'x']) assert.ok(S.resolverLanzamiento(b, 'valorant').error);
  assert.ok(S.resolverLanzamiento(BIB, null).error);
});
t('defensa en profundidad: entradas detectadas pero manipuladas también se rechazan', () => {
  const mal = (e) => S.resolverLanzamiento([e], String(e.id));
  assert.strictEqual(mal({ id: 'v', exe: 'C:\\Windows\\System32\\cmd.exe', args: ['--launch-product=valorant'] }).error, 'lanzador no permitido');
  assert.strictEqual(mal({ id: 'v', exe: 'C:\\Riot Client\\RiotClientServices.exe', args: ['--launch-product=valorant;calc'] }).error, 'argumentos no permitidos');
  assert.strictEqual(mal({ id: 'v', exe: 'C:\\Riot Client\\RiotClientServices.exe', args: ['--evil'] }).error, 'argumentos no permitidos');
  assert.strictEqual(mal({ id: 'v', exe: 'C:\\Riot Client\\RiotClientServices.exe', args: [42] }).error, 'argumentos no permitidos');
  assert.strictEqual(mal({ id: 'v', lanzar: 'file:///C:/x.exe' }).error, 'URL de lanzamiento no permitida');
  assert.strictEqual(mal({ id: 'v' }).error, 'sin vía de lanzamiento');
});
t('el resultado es una copia: mutar args no altera la biblioteca', () => {
  const r = S.resolverLanzamiento(BIB, 'valorant'); r.args.push('--x');
  assert.strictEqual(BIB[0].args.length, 2);
});

console.log('\n— las listas permitidas no se desincronizan del renderer —');
const RENDER = ['app.js', 'mm.js', 'update-ui.js'].map((f) => leer('renderer', f)).join('\n');
t('toda tabla que el renderer consulta está permitida, y no sobra ninguna', () => {
  const usadas = new Set(); const re = /\bapi\(\s*['"`]\/([A-Za-z0-9_]+)/g; let m;
  while ((m = re.exec(RENDER))) if (m[1] !== 'rpc') usadas.add(m[1]);
  for (const u of usadas) assert.ok(S.TABLAS_API.has(u), 'el renderer usa /' + u + ' y no está en TABLAS_API (añádelo a conciencia o quita el uso)');
  for (const p of S.TABLAS_API) assert.ok(usadas.has(p), p + ' está permitida pero el renderer ya no la usa: quítala');
});
t('toda función RPC del renderer está permitida, y no sobra ninguna', () => {
  const usadas = new Set(); const re = /\brpc\(\s*['"]([a-z_]+)['"]/g; let m;
  while ((m = re.exec(RENDER))) usadas.add(m[1]);
  assert.ok(usadas.size >= 8, 'se esperaban ≥8 RPC en mm.js, hay ' + usadas.size);
  for (const u of usadas) assert.ok(S.RPC_API.has(u), u + ' falta en RPC_API');
  for (const p of S.RPC_API) assert.ok(usadas.has(p), p + ' está permitida pero no se usa');
});
t('los métodos que usa el renderer están permitidos', () => {
  const re = /metodo:\s*'([A-Z]+)'/g; let m;
  while ((m = re.exec(RENDER))) assert.ok(S.METODOS_API.has(m[1]), m[1]);
});
t('toda URL literal que el renderer manda a abrir() está permitida', () => {
  const re = /\babrir\(\s*'([^']+)'/g; let m, n = 0;
  while ((m = re.exec(RENDER))) { n++; assert.ok(S.urlExternaPermitida(m[1]), m[1]); }
  assert.ok(n >= 4, 'se esperaban ≥4 llamadas a abrir(), hay ' + n);
});

console.log('\n— main.js usa las validaciones (no se pueden ejecutar fuera de Electron) —');
const main = leer('main.js');
const bloque = (inicio) => {
  const i = main.indexOf(inicio); assert.ok(i > -1, 'no encuentro ' + inicio);
  const j = main.indexOf('ipcMain.handle(', i + 10); return main.slice(i, j > -1 ? j : i + 1500);
};
t("hub:jugar resuelve por id con la biblioteca de main y no ejecuta lo que manda el renderer", () => {
  const b = bloque("ipcMain.handle('hub:jugar'");
  assert.ok(/idDeJuego\(/.test(b) && /resolverLanzamiento\(bibliotecaCache/.test(b));
  assert.ok(!/juego\.(exe|args|lanzar)/.test(b), 'no debe leer exe/args/lanzar del argumento del renderer');
});
t('hub:abrir valida con urlExternaPermitida antes de openExternal', () => {
  const b = bloque("ipcMain.handle('hub:abrir'");
  assert.ok(b.indexOf('urlExternaPermitida') > -1 && b.indexOf('urlExternaPermitida') < b.indexOf('openExternal'));
});
t('hub:api valida con validarPeticionApi antes de llamar a la API', () => {
  const b = bloque("ipcMain.handle('hub:api'");
  assert.ok(b.indexOf('validarPeticionApi') > -1 && b.indexOf('validarPeticionApi') < b.indexOf('apiFetch('));
});
t('la cadena ready-check solo acepta los juegos permitidos para ExitLag', () => {
  const b = bloque("ipcMain.handle('hub:exitlag'");
  assert.ok(/idDeJuego\(extra\)/.test(b));
  assert.ok(/valorant: 'VALORANT', cs2: 'Counter-Strike 2'/.test(b));
  assert.ok(/exitlagActivar\(\{ id, nombre: nombres\[id\] \}, null\)/.test(b));
});
t('la ventana principal bloquea la navegación y window.open', () => {
  assert.ok(/webContents\.on\('will-navigate'/.test(main));
  assert.ok(/setWindowOpenHandler\(/.test(main));
});
t('preload: jugar envía solo el id', () => {
  assert.ok(/jugar:\s*\(id\)\s*=>/.test(leer('preload.js')));
  assert.ok(/H\.jugar\(j\.id\)/.test(leer('renderer', 'app.js')) && /H\.jugar\(objetivo\.id\)/.test(leer('renderer', 'mm.js')));
});
t('EMPAQUETADO: todo require("./x") de main.js está en build.files (si no, el instalador falla al arrancar)', () => {
  const files = JSON.parse(leer('package.json')).build.files;
  const re = /require\('\.\/([^']+)'\)/g; let m, n = 0;
  while ((m = re.exec(main))) {
    n++; const rel = m[1].endsWith('.js') ? m[1] : m[1] + '.js';
    const cubierto = files.some((g) => g === rel || (g.endsWith('/**/*') && rel.startsWith(g.slice(0, -4))));
    assert.ok(cubierto, rel + ' se requiere en main.js pero NO está en build.files');
  }
  assert.ok(n >= 2, 'se esperaban ≥2 require locales, hay ' + n);
});

console.log('\n' + '='.repeat(44));
console.log('  HUB · seguridad IPC · ' + OK + ' ✓ · ' + KO + ' ✗');
console.log('='.repeat(44));
process.exit(KO ? 1 : 0);
