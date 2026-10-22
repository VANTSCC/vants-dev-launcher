// ============================================================
// VANTS · main.js — proceso principal de Electron
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
const { detectarJuego } = require('./renderer/juegos.js'); // catálogo + detección por proceso (lógica pura, testeada)
const { iniciar: iniciarTelemetria } = require('./telemetria.js');

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
let juegoActual = null;      // nombre del juego en ejecución (para pantalla)
let juegoSlug = null;        // slug canónico del mismo juego (lo que se guarda en presence.juego)
let estadoPresencia = 'online'; // online | jugando | invisible

// ============================================================
// CAPTURA DE TRÁFICO (modo diagnóstico) — HAR 1.2 + proxy
// ------------------------------------------------------------
// · `--captura` arranca la captura al abrir el HUB.
// · `--proxy-server=host:puerto` (o `--proxy=`) enruta TODO el
//   tráfico del HUB por un proxy externo (mitmproxy, Fiddler,
//   Charles) antes de que arranque Chromium.
// · La captura cubre las DOS capas de red del HUB:
//   1) fetch() del proceso principal (Auth0, Neon, presencia)
//      → instrumentado con fetchMedido().
//   2) tráfico del renderer y ventanas de login (imágenes,
//      páginas Auth0) → CDP webContents.debugger (Network).
// · Todo se exporta a un .har estándar abrible en Chrome
//   DevTools, Charles, Fiddler o har-analyzer.
// · Por defecto se REDACTAN tokens y cookies en el archivo.
//   `--captura-sin-redaccion` los conserva (solo en tu máquina).
// ============================================================
function cliValor(...nombres) {
  for (const n of nombres) {
    const i = process.argv.findIndex(a => a === '--' + n);
    if (i >= 0) return process.argv[i + 1] || '';
    const pref = '--' + n + '=';
    const conIgual = process.argv.find(a => a.startsWith(pref));
    if (conIgual) return conIgual.slice(pref.length);
  }
  return null;
}
const CLI = {
  captura: process.argv.includes('--captura') || process.argv.includes('--capture'),
  sinRedaccion: process.argv.includes('--captura-sin-redaccion'),
  proxy: cliValor('proxy-server', 'proxy'),
  proxyBypass: cliValor('proxy-bypass', 'proxy-bypass-list')
};
// Los switches de Chromium van ANTES de app.whenReady()
if (CLI.proxy) app.commandLine.appendSwitch('proxy-server', CLI.proxy);
if (CLI.proxyBypass) app.commandLine.appendSwitch('proxy-bypass-list', CLI.proxyBypass);

const CAPTURA_DIR = () => path.join(app.getPath('userData'), 'captures');
const CAPTURA_MAX_ENTRADAS = 5000;

const captura = {
  activa: false,
  desde: null,
  redactar: !CLI.sinRedaccion,
  entradas: [],          // entradas HAR 1.2 completas
  pendientes: new Map(), // webContents.id -> Map(requestId -> entrada en curso)
  truncada: false,
  ultimoArchivo: null
};

// Redacción de cabeceras y cuerpos sensibles
const H_SENSIBLES = /^(authorization|cookie|set-cookie|proxy-authorization)$/i;
function harHeaders(h) {
  const out = [];
  for (const [k, v] of Object.entries(h || {})) {
    out.push({ name: k, value: (captura.redactar && H_SENSIBLES.test(k)) ? '[REDACTADO]' : String(v) });
  }
  return out;
}
const RE_TOKEN = /("(?:refresh_token|access_token|id_token|code_verifier|code|client_secret)"\s*:\s*")[^"]*(")/g;
function harBody(txt) {
  if (typeof txt !== 'string') return txt;
  return captura.redactar ? txt.replace(RE_TOKEN, '$1[REDACTADO]$2') : txt;
}
function harQueryString(url) {
  try { return [...new URL(url).searchParams].map(([name, value]) => ({ name, value })); }
  catch (e) { return []; }
}
function pushEntrada(ent) {
  if (captura.entradas.length >= CAPTURA_MAX_ENTRADAS) { captura.truncada = true; return; }
  captura.entradas.push(ent);
}
function entradaBase(url, metodo, t0, tipo, origen) {
  return {
    startedDateTime: new Date(t0).toISOString(),
    time: 0,
    _resourceType: tipo || 'Other',
    _origen: origen, // 'main' (proceso principal) | 'renderer'
    request: {
      method: metodo, url, httpVersion: 'http/1.1',
      headers: [], queryString: harQueryString(url), cookies: [],
      headersSize: -1, bodySize: -1
    },
    response: {
      status: 0, statusText: '', httpVersion: 'http/1.1',
      headers: [], cookies: [],
      content: { size: 0, mimeType: '', text: null },
      redirectURL: '', headersSize: -1, bodySize: -1
    },
    cache: {}, timings: { send: 0, wait: 0, receive: 0 }
  };
}

// ---------- capa 1: fetch() del proceso principal ----------
async function fetchMedido(url, opts = {}) {
  const t0 = Date.now();
  const metodo = (opts.method || 'GET').toUpperCase();
  try {
    const r = await fetch(url, opts);
    if (captura.activa) {
      try {
        let cuerpo = null, ct = r.headers.get('content-type') || '';
        if (ct.includes('json') || ct.includes('text')) {
          cuerpo = harBody((await r.clone().text()).slice(0, 262144));
        }
        const ent = entradaBase(url, metodo, t0, 'Fetch', 'main');
        const hh = {};
        if (opts.headers && typeof opts.headers === 'object') {
          for (const [k, v] of Object.entries(opts.headers)) hh[String(k).toLowerCase()] = v;
        }
        ent.request.headers = harHeaders(hh);
        if (opts.body) {
          const b = harBody(String(opts.body).slice(0, 262144));
          ent.request.bodySize = Buffer.byteLength(b);
          ent.request.postData = { mimeType: opts.headers && opts.headers['Content-Type'] || 'application/json', text: b };
        }
        ent.response.status = r.status;
        ent.response.statusText = r.statusText || '';
        ent.response.headers = harHeaders(Object.fromEntries(r.headers.entries()));
        ent.response.content = { size: cuerpo ? Buffer.byteLength(cuerpo) : 0, mimeType: ct, text: cuerpo };
        ent.time = Date.now() - t0;
        ent.timings.wait = ent.time;
        pushEntrada(ent);
      } catch (e) { log('captura main:', e.message); }
    }
    return r;
  } catch (err) {
    if (captura.activa) {
      const ent = entradaBase(url, metodo, t0, 'Fetch', 'main');
      ent.response.status = 0;
      ent.response.content = { size: 0, mimeType: '', text: 'FALLO DE RED: ' + err.message };
      ent.time = Date.now() - t0;
      ent.timings.wait = ent.time;
      ent._error = err.message;
      pushEntrada(ent);
    }
    throw err;
  }
}

// ---------- capa 2: renderer y ventanas de login (CDP) ----------
function onCdpMensaje(wcId, method, params) {
  try {
    const pend = captura.pendientes.get(wcId);
    if (!pend) return;
    if (method === 'Network.requestWillBeSent') {
      // si hubo redirect, cierra la entrada anterior con su respuesta
      const prev = pend.get(params.requestId);
      if (prev && params.redirectResponse) {
        prev.response.status = params.redirectResponse.status;
        prev.response.statusText = params.redirectResponse.statusText || '';
        prev.response.headers = harHeaders(params.redirectResponse.headers);
        prev.time = Date.now() - new Date(prev.startedDateTime).getTime();
        prev.timings.wait = prev.time;
        pushEntrada(prev);
      }
      const ent = entradaBase(params.request.url, params.request.method,
        Date.now(), params.type || 'Other', 'renderer');
      ent.request.headers = harHeaders(params.request.headers);
      if (params.request.postData) {
        const b = harBody(params.request.postData.slice(0, 262144));
        ent.request.bodySize = Buffer.byteLength(b);
        ent.request.postData = { mimeType: 'application/json', text: b };
      }
      pend.set(params.requestId, ent);
    } else if (method === 'Network.responseReceived') {
      const ent = pend.get(params.requestId);
      if (!ent) return;
      const res = params.response || {};
      ent.response.status = res.status || 0;
      ent.response.statusText = res.statusText || '';
      ent.response.headers = harHeaders(res.headers);
      if (res.protocol) ent.response.httpVersion = res.protocol;
      ent.response.content.mimeType = res.mimeType || '';
    } else if (method === 'Network.loadingFinished') {
      const ent = pend.get(params.requestId);
      if (!ent) return;
      pend.delete(params.requestId);
      ent.time = Date.now() - new Date(ent.startedDateTime).getTime();
      ent.timings.wait = ent.time;
      // cuerpo de respuesta (solo texto, tope 256 KB) para leer la API
      try {
        const wc = require('electron').BrowserWindow.getAllWindows()
          .find(w => !w.isDestroyed() && w.webContents.id === wcId);
        if (wc && (ent.response.content.mimeType.includes('json') || ent.response.content.mimeType.includes('text'))) {
          wc.webContents.debugger.sendCommand('Network.getResponseBody', { requestId: params.requestId })
            .then((c) => {
              let txt = c && c.body ? c.body : null;
              if (txt && c.base64Encoded) { try { txt = Buffer.from(txt, 'base64').toString('utf8'); } catch (e) { txt = null; } }
              if (txt) {
                txt = harBody(txt.slice(0, 262144));
                ent.response.content.text = txt;
                ent.response.content.size = Buffer.byteLength(txt);
              }
            }).catch(() => {});
        }
      } catch (e) {}
      ent.response.bodySize = params.encodedDataLength || -1;
      pushEntrada(ent);
    } else if (method === 'Network.loadingFailed') {
      const ent = pend.get(params.requestId);
      if (!ent) return;
      pend.delete(params.requestId);
      ent.time = Date.now() - new Date(ent.startedDateTime).getTime();
      ent._error = params.errorText || 'fallo';
      ent.response.status = 0;
      ent.response.content.text = 'FALLO DE RED: ' + (params.errorText || 'cancelado');
      pushEntrada(ent);
    }
  } catch (e) { log('captura cdp:', e.message); }
}

function capturaAdjuntar(bw) {
  if (!captura.activa || !bw || bw.isDestroyed()) return;
  try {
    const wc = bw.webContents;
    const dbg = wc.debugger;
    try { dbg.attach('1.3'); } catch (e) { /* ya asociado */ }
    dbg.sendCommand('Network.enable', { maxPostDataSize: 1048576 }).catch(() => {});
    dbg.removeAllListeners('message');
    dbg.on('message', (ev, method, params) => onCdpMensaje(wc.id, method, params));
    dbg.on('detach', (ev, razon) => log('captura: debugger desasociado (' + razon + ')'));
    captura.pendientes.set(wc.id, new Map());
    log('captura: escuchando ventana', wc.id);
  } catch (e) { log('captura adjuntar:', e.message); }
}

function capturaDesasociar() {
  for (const w of require('electron').BrowserWindow.getAllWindows()) {
    try { if (!w.isDestroyed()) { w.webContents.debugger.removeAllListeners('message'); w.webContents.debugger.detach(); } }
    catch (e) {}
  }
  captura.pendientes.clear();
}

let capturaAutoTimer = null;

function capturaEscribir(nombre) {
  try {
    fs.mkdirSync(CAPTURA_DIR(), { recursive: true });
    const archivo = path.join(CAPTURA_DIR(), nombre);
    fs.writeFileSync(archivo, JSON.stringify(capturaHar()));
    return archivo;
  } catch (e) { log('captura guardar:', e.message); return null; }
}

function capturaIniciar(origen) {
  if (captura.activa) return false;
  captura.activa = true;
  captura.desde = new Date().toISOString();
  captura.entradas = [];
  captura.truncada = false;
  captura.ultimoArchivo = null;
  for (const w of require('electron').BrowserWindow.getAllWindows()) capturaAdjuntar(w);
  // autoguardado cada 30 s: si el proceso muere, la captura no se pierde
  if (capturaAutoTimer) clearInterval(capturaAutoTimer);
  capturaAutoTimer = setInterval(() => {
    if (captura.activa && captura.entradas.length) {
      const f = capturaEscribir('captura-en-curso.har');
      if (f) captura.ultimoArchivo = f;
    }
  }, 30000);
  log('captura: INICIADA (' + (origen || 'manual') + ') · redacción de tokens:', captura.redactar ? 'activada' : 'desactivada');
  enviarCapturaEstado();
  return true;
}

function capturaHar() {
  return {
    log: {
      version: '1.2',
      creator: { name: 'VANTS', version: app.getVersion() },
      pages: [{ startedDateTime: captura.desde, id: 'vants-hub', title: 'VANTS · captura de tráfico' }],
      entries: captura.entradas,
      comment: captura.truncada
        ? 'Captura TRUNCADA: se alcanzó el tope de ' + CAPTURA_MAX_ENTRADAS + ' entradas.'
        : 'Generada por VANTS' + (captura.redactar ? ' · tokens y cookies redactados' : ' · SIN redacción')
    }
  };
}

function capturaDetener() {
  if (!captura.activa) return null;
  captura.activa = false;
  capturaDesasociar();
  if (capturaAutoTimer) { clearInterval(capturaAutoTimer); capturaAutoTimer = null; }
  const sello = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const archivo = capturaEscribir('captura-' + sello + '.har');
  captura.ultimoArchivo = archivo;
  log('captura: DETENIDA ·', captura.entradas.length, 'entradas →', archivo);
  enviarCapturaEstado();
  return archivo;
}

function enviarCapturaEstado() {
  if (win && !win.isDestroyed()) {
    win.webContents.send('hub:captura-estado', {
      activa: captura.activa, entradas: captura.entradas.length,
      ultimoArchivo: captura.ultimoArchivo, redactar: captura.redactar
    });
  }
}

// ============================================================
// AUTO-ACTUALIZACIÓN (electron-updater + GitHub Releases)
// ------------------------------------------------------------
// Fase 5 · El HUB se mantiene solo: al arrancar (y cada 6 h)
// consulta el último Release del repo oficial; si hay versión
// nueva la DESCARGA en silencio en segundo plano y la instala
// al cerrar la app (autoInstallOnAppQuit) — el usuario ya no
// descarga el instalador a mano. El renderer solo recibe
// eventos (hub:update) para mostrar el aviso; puede pedir
// "Reiniciar y actualizar" con hub:actualizar-instalar.
// ============================================================
let autoUpdater = null;
function iniciarAutoActualizacion() {
  if (!app.isPackaged) { log('auto-update: omitido en dev'); return; }
  try { autoUpdater = require('electron-updater').autoUpdater; }
  catch (e) { log('auto-update no disponible:', e.message); return; }

  autoUpdater.autoDownload = true;           // descarga en segundo plano
  autoUpdater.autoInstallOnAppQuit = true;   // instala al cerrar: cero fricción
  autoUpdater.allowPrerelease = false;       // solo releases estables
  try { autoUpdater.logger = { info: log, warn: log, error: (...a) => log('upd:', ...a) }; } catch (e) {}

  const aviso = (tipo, datos) => {
    log('auto-update:', tipo, datos || '');
    if (win && !win.isDestroyed()) win.webContents.send('hub:update', Object.assign({ tipo }, datos || {}));
  };
  autoUpdater.on('checking-for-update', () => aviso('chequeando'));
  autoUpdater.on('update-available', (i) => aviso('disponible', { version: i && i.version }));
  autoUpdater.on('update-not-available', () => aviso('sin-novedad'));
  autoUpdater.on('download-progress', (p) => aviso('progreso', {
    pct: Math.round(p.percent || 0),
    mb: ((p.transferred || 0) / 1048576).toFixed(1),
    total: ((p.total || 0) / 1048576).toFixed(1)
  }));
  autoUpdater.on('update-downloaded', (i) => aviso('lista', { version: i && i.version }));
  autoUpdater.on('error', (e) => aviso('error', { message: (e && e.message) || 'fallo del actualizador' }));

  const chequear = () => { try { autoUpdater.checkForUpdates().catch((e) => log('check:', e.message)); } catch (e) { log('check:', e.message); } };
  setTimeout(chequear, 8000);                     // primer chequeo al arrancar
  setInterval(chequear, 6 * 60 * 60 * 1000);      // y cada 6 horas
}

const SESION_FILE = () => path.join(app.getPath('userData'), 'vants-session.bin');

// ============================================================
// UTILIDADES
// ============================================================
function log(...a) { try { console.log('[vants-hub]', ...a); } catch (e) {} }
const telemetria = iniciarTelemetria({ app, log });
function b64url(buf) { return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function sha256(s) { return crypto.createHash('sha256').update(s).digest(); }
function httpErrorBody(r) { return r.text().then(t => t.slice(0, 300)).catch(() => ''); }

async function apiFetch(pathname, opts = {}, token) {
  const headers = Object.assign({ Accept: 'application/json' }, opts.headers || {});
  if (token) headers['Authorization'] = 'Bearer ' + token;
  if (opts.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  const r = await fetchMedido(API + pathname, { method: opts.method || 'GET', headers, body: opts.body });
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
    const r = await fetchMedido('https://' + AUTH0_DOMAIN + '/oauth/token', {
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
      icon: path.join(__dirname, 'build', 'icon.png'),
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
    });
    authWin.loadURL(url);
    capturaAdjuntar(authWin);
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
        const r = await fetchMedido('https://' + AUTH0_DOMAIN + '/oauth/token', {
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
      icon: path.join(__dirname, 'build', 'icon.png'),
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
    });
    w.loadURL(WEB_BASE + '/');
    capturaAdjuntar(w);
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
    const r = await fetchMedido('https://' + AUTH0_DOMAIN + '/userinfo', { headers: { Authorization: 'Bearer ' + t.access_token } });
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
  procsCache = { lista: procs, cuando: Date.now() };   // shared with the ExitLag layer
  const j = detectarJuego(procs);               // solo procesos del JUEGO: el Riot Client abierto no es "jugando"
  const jugando = j ? j.nombre : null;
  const cambiado = jugando !== juegoActual;
  juegoActual = jugando;
  juegoSlug = j ? j.slug : null;
  // ExitLag auto-stop: game process is gone -> deactivate the profile
  if (!jugando && exitlag.sesion && (exitlag.cfg ? exitlag.cfg.autoStop !== false : true)) {
    exitlagDesactivar('game-closed');
  }
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
    const juego = juegoSlug || null;            // slug del juego en ejecución; null si solo está en línea
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
// EXITLAG INTEGRATION LAYER (config-driven adapter)
// ------------------------------------------------------------
// OFF by default — activated when a config file exists at:
//   %APPDATA%\VANTS\exitlag.config.json
// ExitLag fills in: executable path, activation/deactivation
// method and per-game profiles. The HUB only orchestrates the
// TIMING (it never touches game processes or game traffic):
//   launch game via official store path -> activate profile ->
//   watch process (existing 15 s scan, zero extra timers) ->
//   deactivate when the game process is gone (autoStop).
// ============================================================
const EXITLAG_CFG_FILE = () => path.join(app.getPath('userData'), 'exitlag.config.json');
const EXITLAG_PATHS = [
  'C:\\Program Files\\ExitLag\\ExitLag.exe',
  'C:\\Program Files (x86)\\ExitLag\\ExitLag.exe',
  (process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'ExitLag', 'ExitLag.exe') : null)
].filter(Boolean);

const exitlag = { cfg: null, cfgFuente: null, sesion: null }; // sesion: {juego, key, pid, desde}
let procsCache = { lista: [], cuando: 0 };                    // shared with the 15 s process scan

function exitlagCargarConfig() {
  exitlag.cfg = null; exitlag.cfgFuente = null;
  try {
    if (fs.existsSync(EXITLAG_CFG_FILE())) {
      const j = JSON.parse(fs.readFileSync(EXITLAG_CFG_FILE(), 'utf8'));
      if (j && typeof j === 'object') { exitlag.cfg = j; exitlag.cfgFuente = 'userData'; }
    }
  } catch (e) { log('exitlag config:', e.message); }
  if (!exitlag.cfg) {
    // safe default: everything off until ExitLag ships its config
    exitlag.cfg = { enabled: false, executable: EXITLAG_PATHS[0] || null,
      activateArgs: [], deactivate: null, killByName: null, autoStop: true, profiles: {} };
    exitlag.cfgFuente = 'default';
  }
  return exitlag.cfg;
}

function exitlagExeInstalado() {
  if (exitlag.cfg && exitlag.cfg.executable && fs.existsSync(exitlag.cfg.executable)) return exitlag.cfg.executable;
  for (const p of EXITLAG_PATHS) if (fs.existsSync(p)) return p;
  return null;
}

function exitlagEstado() {
  const exe = exitlagExeInstalado();
  const fresh = (Date.now() - procsCache.cuando) < 25000;
  return {
    habilitado: !!(exitlag.cfg && exitlag.cfg.enabled),
    instalado: !!exe,
    ejecutable: exe,
    corriendo: fresh ? procsCache.lista.includes('exitlag.exe') : null,
    activo: exitlag.sesion ? { juego: exitlag.sesion.juego, desde: exitlag.sesion.desde } : null,
    configPath: exitlag.cfgFuente === 'userData' ? EXITLAG_CFG_FILE() : null,
    perfiles: exitlag.cfg && exitlag.cfg.profiles ? Object.keys(exitlag.cfg.profiles) : []
  };
}

// resolve which profile key applies to a game object
// (matches juego.id, juego.nombre, lowercase name, '*' wildcard, 'cs2' alias)
function exitlagKeyDeJuego(juego) {
  if (!juego) return null;
  const perfiles = (exitlag.cfg && exitlag.cfg.profiles) || {};
  const claves = [juego.id, juego.nombre, juego.nombre && String(juego.nombre).toLowerCase()].filter(Boolean);
  for (const c of claves) if (perfiles[c]) return c;
  const cs = claves.find(c => String(c).toLowerCase().includes('counter-strike'));
  if (cs && perfiles['cs2']) return 'cs2';
  return perfiles['*'] ? '*' : null;
}

async function exitlagActivar(juego, key) {
  try {
    const cfg = exitlag.cfg || exitlagCargarConfig();
    if (!cfg.enabled || exitlag.sesion) return { ok: false, reason: 'disabled-or-already-active' };
    const exe = exitlagExeInstalado();
    if (!exe) return { ok: false, reason: 'not-installed' };
    const k = key || exitlagKeyDeJuego(juego);
    if (!k) return { ok: false, reason: 'no-profile' };
    const perfil = cfg.profiles[k] || {};
    const args = (perfil.args || cfg.activateArgs || []).map(a => String(a)
      .replace(/\{game\}/g, k).replace(/\{profile\}/g, perfil.profileId || k));
    const hijo = spawn(exe, args, { detached: true, stdio: 'ignore', windowsHide: true });
    hijo.unref();
    exitlag.sesion = { juego: (juego && juego.nombre) || k, key: k, pid: hijo.pid || null, desde: new Date().toISOString() };
    log('exitlag: perfil activado →', k);
    enviarEstado();
    return { ok: true, perfil: k };
  } catch (e) { log('exitlag activar:', e.message); return { ok: false, reason: e.message }; }
}

async function exitlagDesactivar(motivo) {
  try {
    if (!exitlag.sesion) return { ok: false, reason: 'inactive' };
    const cfg = exitlag.cfg || {};
    const d = cfg.deactivate;
    const exe = exitlagExeInstalado();
    if (d && d.mode === 'args' && exe) {
      spawn(exe, (d.args || []).map(String), { detached: true, stdio: 'ignore', windowsHide: true }).unref();
    } else if (d && d.mode === 'killByName' && cfg.killByName && IS_WIN) {
      spawn('taskkill', ['/IM', String(cfg.killByName), '/F'], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
    } else if (exitlag.sesion.pid && IS_WIN) {
      spawn('taskkill', ['/PID', String(exitlag.sesion.pid), '/F', '/T'], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
    }
    log('exitlag: desactivado (' + (motivo || 'manual') + ')');
    exitlag.sesion = null;
    enviarEstado();
    return { ok: true };
  } catch (e) { log('exitlag desactivar:', e.message); return { ok: false, reason: e.message }; }
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
    title: 'VANTS',
    icon: path.join(__dirname, 'build', 'icon.png'),
    frame: false,            // barra de título propia (estilo FACEIT)
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false
    }
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  capturaAdjuntar(win);
  win.once('ready-to-show', () => win.show());
  win.on('closed', () => { win = null; });
}
function ipcRegistrar() {
  ipcMain.on('hub:error', (event, details) => telemetria.report('HUB_ERROR', details));
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
      let via = null;
      if (juego.exe && Array.isArray(juego.args)) {       // Riot
        const hijo = spawn(juego.exe, juego.args, { detached: true, stdio: 'ignore', windowsHide: true });
        hijo.unref(); via = 'riot-client';
      } else if (juego.lanzar) {                          // steam:// o epic://
        await shell.openExternal(juego.lanzar); via = juego.lanzar.split(':')[0] + '-protocol';
      } else return { ok: false, error: 'sin vía de lanzamiento' };
      // ExitLag: activate the configured profile right after a successful launch
      const exitlagRes = await exitlagActivar(juego);
      return { ok: true, via, exitlag: exitlagRes };
    } catch (err) { return { ok: false, error: err.message }; }
  });
  ipcMain.handle('hub:abrir', (e, url) => shell.openExternal(url));
  ipcMain.handle('hub:info', () => ({ version: app.getVersion(), plataforma: process.platform, juego: juegoActual }));
  ipcMain.handle('hub:actualizar-instalar', () => {
    try {
      if (!autoUpdater) return { ok: false, error: 'sin actualizador' };
      autoUpdater.quitAndInstall(true, true); // instala en silencio y reabre
      return { ok: true };
    } catch (err) { return { ok: false, error: err.message }; }
  });
  ipcMain.handle('hub:ventana', (e, acc) => {
    try {
      if (!win || win.isDestroyed()) return { ok: false };
      if (acc === 'min') win.minimize();
      else if (acc === 'max') { win.isMaximized() ? win.unmaximize() : win.maximize(); }
      else if (acc === 'close') win.close();
      return { ok: true };
    } catch (err) { return { ok: false, error: err.message }; }
  });
  ipcMain.handle('hub:captura', (e, acc) => {
    try {
      if (acc === 'iniciar') return { ok: capturaIniciar('renderer') };
      if (acc === 'detener') return { ok: true, archivo: capturaDetener() };
      if (acc === 'carpeta') { fs.mkdirSync(CAPTURA_DIR(), { recursive: true }); shell.openPath(CAPTURA_DIR()); return { ok: true }; }
      return { activa: captura.activa, entradas: captura.entradas.length, ultimoArchivo: captura.ultimoArchivo, redactar: captura.redactar, proxy: CLI.proxy };
    } catch (err) { return { ok: false, error: err.message }; }
  });
  ipcMain.handle('hub:exitlag', async (e, acc, extra) => {
    try {
      if (acc === 'activar') return await exitlagActivar(null, null);
      // 'activar-juego' — cadena ready-check → ExitLag → juego (mm.js).
      // extra = {id,nombre} (o string con el slug). OFF por defecto:
      // sin exitlag.config.json enabled responde {ok:false, reason:…} y
      // el lanzamiento sigue derecho. Nunca toca procesos del juego.
      if (acc === 'activar-juego') {
        const j = typeof extra === 'string' ? { id: extra, nombre: extra } : (extra || null);
        return await exitlagActivar(j, null);
      }
      if (acc === 'desactivar') return await exitlagDesactivar('renderer');
      if (acc === 'recargar') { exitlagCargarConfig(); return { ok: true, estado: exitlagEstado() }; }
      if (acc === 'abrir-config') { shell.showItemInFolder(EXITLAG_CFG_FILE()); return { ok: true }; }
      return exitlagEstado();
    } catch (err) { return { ok: false, error: err.message }; }
  });
}

// ============================================================
// BANDEJA (Tray)
// ============================================================
function actualizarTray() {
  const tip = sesion
    ? ('VANTS · ' + (juegoActual ? 'JUGANDO ' + juegoActual : 'EN LÍNEA'))
    : 'VANTS · sin sesión';
  if (tray) tray.setToolTip(tip);
}
function crearTray() {
  try {
    const img = nativeImage.createFromPath(path.join(__dirname, 'renderer', 'tray.png'));
    tray = new Tray(img);
    const menu = Menu.buildFromTemplate([
      { label: 'Abrir VANTS', click: () => { if (win) win.show(); else crearVentana(); } },
      { type: 'separator' },
      { label: juegoActual ? 'Jugando: ' + juegoActual : 'Sin juego en ejecución', enabled: false },
      { type: 'separator' },
      { label: captura.activa ? '■ Detener captura de tráfico' : '● Capturar tráfico (HAR)',
        click: () => { if (captura.activa) capturaDetener(); else capturaIniciar('bandeja'); } },
      { label: 'Abrir carpeta de capturas', click: () => { try { fs.mkdirSync(CAPTURA_DIR(), { recursive: true }); } catch (e) {} shell.openPath(CAPTURA_DIR()); } },
      { type: 'separator' },
      { label: 'Salir', click: () => { app.quit(); } }
    ]);
    tray.setContextMenu(menu);
    tray.setToolTip('VANTS');
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
    iniciarAutoActualizacion();
    sesion = cargarSesion();
    if (sesion) { reiniciarLatido(); }
    reiniciarProcesos();
    exitlagCargarConfig();
    if (CLI.captura) capturaIniciar('--captura');
    log('VANTS listo ·', app.getVersion(),
        CLI.proxy ? '· proxy ' + CLI.proxy : '',
        '· exitlag:', exitlagEstado().habilitado ? 'ON' : 'off');
  });
  app.on('window-all-closed', () => { if (!IS_WIN && !IS_MAC) app.quit(); else app.quit(); });
  app.on('before-quit', () => { try { apagarPresencia(); } catch (e) {} try { if (captura.activa) capturaDetener(); } catch (e) {} });
  // cierres por señal (Ctrl+C, kill, gestores de servicio): guardar antes de salir
  const cierreLimpio = () => { try { if (captura.activa) capturaDetener(); } catch (e) {} app.quit(); };
  process.on('SIGINT', cierreLimpio);
  process.on('SIGTERM', cierreLimpio);
}
