// ============================================================
// VANTS HUB · main.js — proceso principal de Electron
// ------------------------------------------------------------
// · Login Auth0 (PKCE en ventana embebida + respaldo por
//   sesión de la web) con refresco automático del token.
// · Cajones: MI CUENTA · PARTIDOS · BRACKET · LÍDERES ·
//   EN VIVO · BIBLIOTECA · MEMBRESÍA · CONEXIONES.
// · Biblioteca: detecta juegos instalados en Steam, Riot
//   (VALORANT) y Epic; lanza cada uno por su vía oficial.
// · Presencia: latido cada 60 s a Neon (EN LÍNEA / JUGANDO X)
//   y detección de procesos locales cada 15 s.
// · Bandeja de Windows con accesos rápidos.
// Seguridad: renderer aislado (contextIsolation), toda la red
// vive aquí; tokens cifrados con safeStorage en el perfil.
// ============================================================
'use strict';

const { app, BrowserWindow, ipcMain, shell, Tray, Menu, nativeImage, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { spawn } = require('child_process');

// ---------- configuración ----------
const AUTH0_DOMAIN = 'vants.eu.auth0.com';
const AUTH0_CLIENT_ID = 'oaOmNizh7HrASWfmfM29bN284IMJvqPG';
const AUTH0_AUDIENCE = 'https://api.vants.app';
const WEB_BASE = 'https://vants.vants.workers.dev';
const API = 'https://ep-autumn-scene-b4opu2ip.apirest.c-6.us-east-2.aws.neon.tech/neondb/rest/v1';
const REDIRECT_URI = WEB_BASE + '/';                 // misma que usa la web en la raíz
const SCOPE = 'openid profile email offline_access';

const IS_WIN = process.platform === 'win32';
const IS_MAC = process.platform === 'darwin';

// ---------- estado global ----------
let win = null;              // ventana principal
let authWin = null;          // ventana de login
let tray = null;
let sesion = null;           // { access_token, refresh_token, expires_at, sub, name, email, picture, pid }
let latidoTimer = null;
let procesosTimer = null;
let juegoActual = null;      // nombre del juego en ejecución
let estadoPresencia = 'online'; // online | jugando | invisible

const SESION_FILE = () => path.join(app.getPath('userData'), 'vants-session.bin');

// ============================================================
// UTILIDADES
// ============================================================
function log(...a) { try { console.log('[vants-hub]', ...a); } catch (e) {} }
function b64url(buf) { return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function sha256(s) { return crypto.createHash('sha256').update(s).digest(); }
function httpErrorBody(r) { return r.text().then(t => t.slice(0, 300)).catch(() => ''); }

async function apiFetch(pathname, opts = {}, token) {
  const headers = Object.assign({ Accept: 'application/json' }, opts.headers || {});
  if (token) headers['Authorization'] = 'Bearer ' + token;
  if (opts.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  const r = await fetch(API + pathname, { method: opts.method || 'GET', headers, body: opts.body });
  if (!r.ok) throw new Error('API ' + r.status + ': ' + (await httpErrorBody(r)));
  const ct = r.headers.get('content-type') || '';
  return ct.includes('json') ? r.json() : r.text();
}

// Token vigente (refresca si faltan <90 s)
async function tokenVigente() {
  if (!sesion) return null;
  const falta = (sesion.expires_at || 0) - Date.now();
  if (falta > 90 * 1000) return sesion.access_token;
  if (!sesion.refresh_token) { if (falta > 0) return sesion.access_token; return null; }
  try {
    const r = await fetch('https://' + AUTH0_DOMAIN + '/oauth/token', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ grant_type: 'refresh_token', client_id: AUTH0_CLIENT_ID, refresh_token: sesion.refresh_token })
    });
    if (!r.ok) throw new Error(await httpErrorBody(r));
    const t = await r.json();
    sesion.access_token = t.access_token || sesion.access_token;
    sesion.refresh_token = t.refresh_token || sesion.refresh_token;
    sesion.expires_at = Date.now() + (t.expires_in || 86400) * 1000;
    guardarSesion();
    return sesion.access_token;
  } catch (e) { log('refresh falló:', e.message); return falta > 0 ? sesion.access_token : null; }
}

// ============================================================
// SESIÓN PERSISTENTE (cifrada con safeStorage)
// ============================================================
function guardarSesion() {
  try {
    const raw = JSON.stringify(sesion || {});
    if (require('electron').safeStorage.isEncryptionAvailable()) {
      fs.writeFileSync(SESION_FILE(), require('electron').safeStorage.encryptString(raw));
    } else {
      fs.writeFileSync(SESION_FILE(), Buffer.from(raw, 'utf8'));
    }
  } catch (e) { log('guardarSesion:', e.message); }
}
function cargarSesion() {
  try {
    if (!fs.existsSync(SESION_FILE())) return null;
    const buf = fs.readFileSync(SESION_FILE());
    let raw;
    try { raw = require('electron').safeStorage.decryptString(buf); }
    catch (e) { raw = buf.toString('utf8'); }
    const s = JSON.parse(raw);
    return s && s.access_token ? s : null;
  } catch (e) { return null; }
}
function borrarSesion() { try { fs.unlinkSync(SESION_FILE()); } catch (e) {} }

// ============================================================
// LOGIN — PKCE en ventana embebida (con respaldo web)
// ============================================================
async function loginConPKCE() {
  const verifier = b64url(crypto.randomBytes(48));
  const challenge = b64url(sha256(verifier));
  const state = b64url(crypto.randomBytes(16));
  const url = 'https://' + AUTH0_DOMAIN + '/authorize' +
    '?response_type=code' +
    '&client_id=' + encodeURIComponent(AUTH0_CLIENT_ID) +
    '&redirect_uri=' + encodeURIComponent(REDIRECT_URI) +
    '&scope=' + encodeURIComponent(SCOPE) +
    '&audience=' + encodeURIComponent(AUTH0_AUDIENCE) +
    '&state=' + encodeURIComponent(state) +
    '&code_challenge=' + challenge +
    '&code_challenge_method=S256' +
    '&prompt=login';

  return await new Promise((resolve) => {
    let settled = false;
    const done = (r) => { if (!settled) { settled = true; resolve(r); } try { if (authWin && !authWin.isDestroyed()) authWin.close(); } catch (e) {} };

    authWin = new BrowserWindow({
      width: 520, height: 720, show: false, resizable: true,
      title: 'Iniciar sesión · VANTS',
      autoHideMenuBar: true, backgroundColor: '#0A0A0C',
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
    });
    authWin.loadURL(url);
    authWin.once('ready-to-show', () => authWin.show());

    // interceptar la vuelta a la web con ?code=...&state=...
    authWin.webContents.on('will-redirect', async (ev, url) => {
      if (!url.startsWith(REDIRECT_URI)) return;
      ev.preventDefault();
      try {
        const u = new URL(url);
        if (u.searchParams.get('state') !== state) return done({ ok: false, error: 'state inválido' });
        const code = u.searchParams.get('code');
        if (!code) return done({ ok: false, error: u.searchParams.get('error') || 'sin code' });
        const r = await fetch('https://' + AUTH0_DOMAIN + '/oauth/token', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            grant_type: 'authorization_code', client_id: AUTH0_CLIENT_ID,
            code_verifier: verifier, code, redirect_uri: REDIRECT_URI
          })
        });
        if (!r.ok) return done({ ok: false, error: 'token: ' + (await httpErrorBody(r)) });
        const t = await r.json();
        done(await establecerSesion(t));
      } catch (e) { done({ ok: false, error: e.message }); }
    });

    authWin.on('closed', () => { authWin = null; if (!settled) { settled = true; resolve({ ok: false, error: 'cancelado' }); } });
  });
}

// Respaldo: abrir la web, dejar que el usuario inicie sesión allí y
// recoger el access_token del localStorage de auth0-spa-js.
async function loginViaWeb() {
  return await new Promise((resolve) => {
    let settled = false, vueltas = 0;
    const done = (r) => { if (!settled) { settled = true; resolve(r); } try { if (w && !w.isDestroyed()) w.close(); } catch (e) {} };
    const w = new BrowserWindow({
      width: 1180, height: 820, show: true, title: 'Inicia sesión en VANTS · luego esta ventana se cerrará sola',
      autoHideMenuBar: true, backgroundColor: '#0A0A0C',
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
    });
    w.loadURL(WEB_BASE + '/');
    const sondeo = setInterval(async () => {
      vueltas++;
      try {
        if (w.isDestroyed()) { clearInterval(sondeo); return done({ ok: false, error: 'cancelado' }); }
        const data = await w.webContents.executeJavaScript(`(function(){
          try{
            var ks=Object.keys(localStorage).filter(function(k){return k.indexOf('@@auth0spajs@@')===0;});
            for (var i=0;i<ks.length;i++){
              var v=JSON.parse(localStorage.getItem(ks[i])||'{}');
              var b=v.body||v;
              if (b && b.access_token) return {access_token:b.access_token,id_token:b.id_token||null,expires_in:Math.round(((b.expiresAt||0)-Date.now())/1000),refresh_token:null};
            }
          }catch(e){}
          return null;
        })()`).catch(() => null);
        if (data && data.access_token && (data.expires_in === undefined || data.expires_in > 30)) {
          clearInterval(sondeo);
          done(await establecerSesion(data));
        }
      } catch (e) {}
      if (vueltas > 600) { clearInterval(sondeo); done({ ok: false, error: 'tiempo agotado' }); }
    }, 1000);
    w.on('closed', () => { clearInterval(sondeo); if (!settled) { settled = true; resolve({ ok: false, error: 'cancelado' }); } });
  });
}

// Rellenar perfil (Auth0 userinfo + player_id de la base) y persistir
async function establecerSesion(t) {
  let perfil = {};
  try {
    const r = await fetch('https://' + AUTH0_DOMAIN + '/userinfo', { headers: { Authorization: 'Bearer ' + t.access_token } });
    if (r.ok) perfil = await r.json();
  } catch (e) {}
  sesion = {
    access_token: t.access_token,
    refresh_token: t.refresh_token || null,
    expires_at: Date.now() + (t.expires_in || 86400) * 1000,
    sub: perfil.sub || null, name: perfil.name || perfil.nickname || 'jugador',
    email: perfil.email || null, picture: perfil.picture || null,
    pid: null
  };
  // resolver player_id
  try {
    const tk = sesion.access_token;
    const filas = await apiFetch('/players?auth0_sub=eq.' + encodeURIComponent(sesion.sub) + '&select=id&limit=1', {}, tk);
    if (Array.isArray(filas) && filas[0]) sesion.pid = filas[0].id;
  } catch (e) { log('player_id:', e.message); }
  guardarSesion();
  reiniciarLatido();
  enviarEstado();
  return { ok: true, sesion: perfilPublico() };
}
function perfilPublico() {
  if (!sesion) return null;
  const { access_token, refresh_token, ...rest } = sesion;
  return rest;
}

// ============================================================
// BIBLIOTECA DE JUEGOS (Steam / Riot / Epic) + PROCESOS
// ============================================================
function leerVDF(texto) {
  // parser VDF mínimo (sin dependencias): devuelve pares ruta->valor del nivel raíz
  const out = {}; const pila = [out]; let cur = out;
  const tokens = texto.replace(/\\"/g, '\u0000').split(/("|\{|\})/);
  let clave = null;
  for (let tk of tokens) {
    if (tk === '"') continue; // manejado abajo
  }
  // enfoque simple por regex para libraryfolders: "path" "…"
  const rutas = []; const re = /"path"\s*"([^"]+)"/g; let m;
  while ((m = re.exec(texto))) rutas.push(m[1].replace(/\\\\/g, '\\'));
  return rutas;
}
function steamApps() {
  const res = [];
  try {
    const bases = ['C:\\Program Files (x86)\\Steam'];
    if (process.env['ProgramFiles(x86)']) bases.push(process.env['ProgramFiles(x86)'] + '\\Steam');
    const base = bases.find(b => fs.existsSync(path.join(b, 'steamapps')) || fs.existsSync(b));
    if (!base) return res;
    const libFile = path.join(base, 'steamapps', 'libraryfolders.vdf');
    let libs = [path.join(base, 'steamapps')];
    if (fs.existsSync(libFile)) {
      for (const p of leerVDF(fs.readFileSync(libFile, 'utf8')))
        libs.push(p.replace(/\\steamapps\\?$/i, '') + '\\steamapps');
    }
    const vistos = new Set();
    for (const lib of libs) {
      if (!fs.existsSync(lib)) continue;
      for (const f of fs.readdirSync(lib)) {
        if (!/^appmanifest_\d+\.acf$/.test(f)) continue;
        const txt = fs.readFileSync(path.join(lib, f), 'utf8');
        const appid = (txt.match(/"appid"\s*"(\d+)"/) || [])[1];
        const name = (txt.match(/"name"\s*"([^"]*)"/) || [])[1];
        if (appid && name && !vistos.has(appid)) {
          vistos.add(appid);
          res.push({ fuente: 'steam', id: appid, nombre: name.replace(/\u0000/g, ''), lanzar: 'steam://rungameid/' + appid });
        }
      }
    }
  } catch (e) { log('steamApps:', e.message); }
  return res;
}
function riotApps() {
  const res = [];
  try {
    const installs = ['C:\\ProgramData\\Riot Games\\RiotClientInstalls.json'];
    let rc = null;
    for (const p of installs) if (fs.existsSync(p)) { rc = JSON.parse(fs.readFileSync(p, 'utf8')); break; }
    const rcPath = rc && (rc.riot_client_services_path || rc.rc_default_path) || 'C:\\Riot Games\\Riot Client\\RiotClientServices.exe';
    const valorantDir = 'C:\\Riot Games\\VALORANT';
    const vivo = fs.existsSync(valorantDir) || fs.existsSync(rcPath);
    if (vivo) {
      res.push({
        fuente: 'riot', id: 'valorant', nombre: 'VALORANT',
        detalle: 'Riot Client', lanzar: null,
        exe: rcPath, args: ['--launch-product=valorant', '--launch-patchline=live']
      });
    }
  } catch (e) { log('riotApps:', e.message); }
  return res;
}
function epicApps() {
  const res = [];
  try {
    const dir = 'C:\\ProgramData\\Epic\\EpicGamesLauncher\\Data\\Manifests';
    if (!fs.existsSync(dir)) return res;
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.item')) continue;
      try {
        const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
        if (j.InstallLocation && j.DisplayName) {
          res.push({
            fuente: 'epic', id: j.AppName || j.MainGameAppName || j.DisplayName, nombre: j.DisplayName,
            detalle: 'Epic Games', lanzar: 'com.epicgames.launcher://apps/' +
              encodeURIComponent(j.AppName || j.MainGameAppName || '') + '?action=launch&silent=true'
          });
        }
      } catch (e) {}
    }
  } catch (e) { log('epicApps:', e.message); }
  return res;
}
function destacadosPrimero(lista) {
  const prio = { 'counter-strike 2': 0, 'counter-strike 2 ': 0, 'valorant': 0 };
  return lista.slice().sort((a, b) => {
    const ka = (a.nombre || '').toLowerCase().startsWith('counter-strike') ? -2 : (a.fuente === 'riot' ? -1 : 0);
    const kb = (b.nombre || '').toLowerCase().startsWith('counter-strike') ? -2 : (b.fuente === 'riot' ? -1 : 0);
    return ka - kb || (a.nombre || '').localeCompare(b.nombre || '');
  });
}
function detectarBiblioteca() {
  const juegos = destacadosPrimero([...riotApps(), ...steamApps(), ...epicApps()]);
  return { juegos, plataforma: process.platform, deteccion: new Date().toISOString() };
}

// -------- procesos en ejecución (¿está jugando?) --------
const PROC_MAP = [
  ['cs2.exe', 'Counter-Strike 2'], ['csgo.exe', 'Counter-Strike 2'],
  ['valorant.exe', 'VALORANT'], ['valorant-win64-shipping.exe', 'VALORANT'],
  ['riotclientservices.exe', 'Riot Client'],
  ['dota2.exe', 'Dota 2'], ['r5apex.exe', 'Apex Legends'],
  ['rocketleague.exe', 'Rocket League'], ['fortniteclient-win64-shipping.exe', 'Fortnite'],
  ['gta5.exe', 'GTA V'], ['javaw.exe', null]
];
function listarProcesos() {
  return new Promise((resolve) => {
    if (IS_WIN) {
      const p = spawn('tasklist', ['/FO', 'CSV', '/NH'], { windowsHide: true });
      let out = '';
      p.stdout.on('data', d => out += d.toString());
      p.on('error', () => resolve([]));
      p.on('close', () => {
        const nombres = [];
        for (const line of out.split(/\r?\n/)) {
          const m = line.match(/^"([^"]+)"/);
          if (m) nombres.push(m[1].toLowerCase());
        }
        resolve(nombres);
      });
    } else if (IS_MAC) {
      const p = spawn('pgrep', ['-l', '.']); let out = '';
      p.stdout.on('data', d => out += d.toString());
      p.on('close', () => resolve(out.split('\n').map(l => l.split(' ')[1] || '').filter(Boolean).map(s => s.toLowerCase())));
      p.on('error', () => resolve([]));
    } else resolve([]);
  });
}
async function detectarJuegoActivo() {
  const procs = await listarProcesos();
  let jugando = null;
  for (const [proc, juego] of PROC_MAP) {
    if (juego && procs.includes(proc)) { jugando = juego; break; }
  }
  const cambiado = jugando !== juegoActual;
  juegoActual = jugando;
  if (cambiado) enviarEstado();
  return jugando;
}

// ============================================================
// PRESENCIA (latido 60 s a /presence)
// ============================================================
async function latir() {
  try {
    if (!sesion || !sesion.pid || estadoPresencia === 'invisible') return;
    const tk = await tokenVigente(); if (!tk) return;
    const estado = juegoActual ? 'jugando' : estadoPresencia;
    const juego = juegoActual || 'valorant';
    await apiFetch('/presence', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({ player_id: sesion.pid, estado, juego })
    }, tk);
  } catch (e) { log('latir:', e.message); }
}
async function apagarPresencia() {
  try {
    if (!sesion || !sesion.pid) return;
    const tk = await tokenVigente(); if (!tk) return;
    await apiFetch('/presence?player_id=eq.' + encodeURIComponent(sesion.pid), { method: 'DELETE' }, tk);
  } catch (e) {}
}
function reiniciarLatido() {
  if (latidoTimer) clearInterval(latidoTimer);
  latir();
  latidoTimer = setInterval(latir, 60000);
}
function reiniciarProcesos() {
  if (procesosTimer) clearInterval(procesosTimer);
  detectarJuegoActivo();
  procesosTimer = setInterval(detectarJuegoActivo, 15000);
}

// ============================================================
// VENTANA PRINCIPAL + IPC
// ============================================================
function enviarEstado() {
  if (win && !win.isDestroyed()) {
    win.webContents.send('hub:estado', {
      sesion: perfilPublico(), juego: juegoActual, presencia: estadoPresencia
    });
  }
  actualizarTray();
}
function crearVentana() {
  win = new BrowserWindow({
    width: 1280, height: 840, minWidth: 1080, minHeight: 700,
    show: false, backgroundColor: '#0A0A0C',
    title: 'VANTS HUB',
    icon: path.join(__dirname, 'build', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false
    }
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.once('ready-to-show', () => win.show());
  win.on('closed', () => { win = null; });
}
function ipcRegistrar() {
  ipcMain.handle('hub:sesion', () => perfilPublico());
  ipcMain.handle('hub:login', async () => {
    const r = await loginConPKCE();
    if (!r.ok) { const w = await loginViaWeb(); return w; }
    return r;
  });
  ipcMain.handle('hub:logout', async () => { await apagarPresencia(); sesion = null; borrarSesion(); enviarEstado(); return { ok: true }; });
  ipcMain.handle('hub:presencia', (e, modo) => { estadoPresencia = (modo === 'invisible') ? 'invisible' : 'online'; enviarEstado(); return estadoPresencia; });
  ipcMain.handle('hub:api', async (e, { ruta, metodo, cuerpo, prefer }) => {
    const tk = await tokenVigente();
    if (!tk) return { __noauth: true };
    try {
      const datos = await apiFetch(ruta, { method: metodo || 'GET', body: cuerpo ? JSON.stringify(cuerpo) : undefined, headers: prefer ? { Prefer: prefer } : {} }, tk);
      return datos;
    } catch (err) { return { __error: err.message }; }
  });
  ipcMain.handle('hub:biblioteca', () => detectarBiblioteca());
  ipcMain.handle('hub:jugar', async (e, juego) => {
    try {
      if (juego.exe && Array.isArray(juego.args)) {       // Riot
        const hijo = spawn(juego.exe, juego.args, { detached: true, stdio: 'ignore', windowsHide: true });
        hijo.unref();
      } else if (juego.lanzar) {                          // steam:// o epic://
        await shell.openExternal(juego.lanzar);
      } else return { ok: false, error: 'sin vía de lanzamiento' };
      return { ok: true };
    } catch (err) { return { ok: false, error: err.message }; }
  });
  ipcMain.handle('hub:abrir', (e, url) => shell.openExternal(url));
  ipcMain.handle('hub:info', () => ({ version: app.getVersion(), plataforma: process.platform, juego: juegoActual }));
}

// ============================================================
// BANDEJA (Tray)
// ============================================================
function actualizarTray() {
  const tip = sesion
    ? ('VANTS Hub · ' + (juegoActual ? 'JUGANDO ' + juegoActual : 'EN LÍNEA'))
    : 'VANTS Hub · sin sesión';
  if (tray) tray.setToolTip(tip);
}
function crearTray() {
  try {
    const img = nativeImage.createFromPath(path.join(__dirname, 'build', 'icon.png')).resize({ width: 16, height: 16 });
    tray = new Tray(img);
    const menu = Menu.buildFromTemplate([
      { label: 'Abrir VANTS HUB', click: () => { if (win) win.show(); else crearVentana(); } },
      { type: 'separator' },
      { label: juegoActual ? 'Jugando: ' + juegoActual : 'Sin juego en ejecución', enabled: false },
      { type: 'separator' },
      { label: 'Salir', click: () => { app.quit(); } }
    ]);
    tray.setContextMenu(menu);
    tray.setToolTip('VANTS Hub');
    tray.on('double-click', () => { if (win) win.show(); });
  } catch (e) { log('tray:', e.message); }
}

// ============================================================
// ARRANQUE
// ============================================================
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); } else {
  app.on('second-instance', () => { if (win) { win.show(); win.focus(); } });
  app.whenReady().then(() => {
    ipcRegistrar();
    crearVentana();
    crearTray();
    sesion = cargarSesion();
    if (sesion) { reiniciarLatido(); }
    reiniciarProcesos();
    log('VANTS HUB listo ·', app.getVersion());
  });
  app.on('window-all-closed', () => { if (!IS_WIN && !IS_MAC) app.quit(); else app.quit(); });
  app.on('before-quit', () => { try { apagarPresencia(); } catch (e) {} });
}
