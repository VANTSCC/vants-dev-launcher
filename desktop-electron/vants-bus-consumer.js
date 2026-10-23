/* ============================================================
 * VANTS HUB · Consumidor del VANTS-BUS (proceso main)
 * ============================================================
 * Escucha el bus de eventos y reacciona a lo que publican
 * playvants-web, flask-agents y faceit-webhook:
 *   - Notificación nativa del SO para lo importante
 *   - Reenvío a TODAS las ventanas: canal 'vants:bus-evento'
 *     (el renderer lo escucha con window.vantsHub.onBusEvento)
 *
 * Configuración (la primera que exista gana):
 *   1) Variables de entorno  VANTS_BUS_URL + VANTS_BUS_SECRET
 *   2) vants-bus.config.json junto a main.js  {"busUrl":"...","secret":"..."}
 *   3) vants-bus.config.json en userData del launcher
 *      (%APPDATA%/vants-hub/vants-bus.config.json)
 *
 * Sin configuración el módulo NO hace nada (cero red, cero errores):
 * el launcher sigue funcionando igual que siempre.
 *
 * Cursor persistente en userData/vants-bus-cursor.json: tras
 * reiniciar el launcher continúa donde quedó, sin duplicados.
 * ============================================================ */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/* Contrato compartido — mantener sincronizado con events-types.json */
const EVENTS = {
  TOURNAMENT_OPENED:    'tournament.inscriptions_opened',
  INSCRIPTION_CREATED:  'inscription.created',
  MATCH_FINISHED:       'match.finished',
  MATCH_SCHEDULED:      'match.scheduled',
  MATCH_CANCELED:       'match.canceled',
  CLIP_PUBLISHED:       'clip.published',
  GAME_SESSION_STARTED: 'game.session_started',
  GAME_SESSION_ENDED:   'game.session_ended',
  ANTICHEAT_PASSED:     'anticheat.passed',
  HIGHLIGHTS_READY:     'clip.highlights_ready',
  POST_GENERATED:       'post.generated',
  ALERT_DETECTED:       'alert.detected',
};

/* Lo que le importa al jugador en el launcher */
const TIPOS_LAUNCHER = [
  EVENTS.TOURNAMENT_OPENED,
  EVENTS.MATCH_FINISHED,
  EVENTS.MATCH_SCHEDULED,
  EVENTS.MATCH_CANCELED,
  EVENTS.HIGHLIGHTS_READY,
  EVENTS.POST_GENERATED,
  EVENTS.ALERT_DETECTED,
];

const ESTADO = {
  corriendo: false,
  configOrigen: null,   // 'env' | 'local' | 'userData'
  ultimoEvento: null,
  procesados: 0,
  errores: 0,
};

let _bus = null;        // { busUrl, projectId, secret }
let _detener = null;    // función stop()
let _electron = null;   // { app, BrowserWindow, Notification, ipcMain }

/* ---------- config ---------- */

function _candidatosConfig() {
  const rutas = [];
  if (_electron && _electron.app && _electron.app.getPath) {
    try { rutas.push(path.join(_electron.app.getPath('userData'), 'vants-bus.config.json')); } catch (e) {}
  }
  rutas.push(path.join(__dirname, 'vants-bus.config.json'));
  return rutas;
}

function _cargarConfig() {
  if (process.env.VANTS_BUS_URL && process.env.VANTS_BUS_SECRET) {
    return { busUrl: process.env.VANTS_BUS_URL, secret: process.env.VANTS_BUS_SECRET, origen: 'env' };
  }
  for (const ruta of _candidatosConfig()) {
    try {
      const cfg = JSON.parse(fs.readFileSync(ruta, 'utf8'));
      if (cfg && cfg.busUrl && cfg.secret) {
        return { busUrl: cfg.busUrl, secret: cfg.secret, origen: ruta };
      }
    } catch (e) { /* no existe o no es JSON válido → siguiente */ }
  }
  return null;
}

/* ---------- cursor persistente ---------- */

function _rutaCursor() {
  if (_electron && _electron.app && _electron.app.getPath) {
    try { return path.join(_electron.app.getPath('userData'), 'vants-bus-cursor.json'); } catch (e) {}
  }
  return path.join(__dirname, 'vants-bus-cursor.json');
}

function _cargarCursor() {
  try { return (JSON.parse(fs.readFileSync(_rutaCursor(), 'utf8')) || {}).cursor || ''; }
  catch (e) { return ''; }
}

function _guardarCursor(cursor) {
  try {
    fs.mkdirSync(path.dirname(_rutaCursor()), { recursive: true });
    fs.writeFileSync(_rutaCursor(), JSON.stringify({ cursor, ts: Date.now() }));
  }
  catch (e) { /* si no se puede guardar, seguimos en memoria */ }
}

/* ---------- API del bus (HMAC idéntico al cliente universal) ----------
 * Firma: X-VANTS-Signature = hex(hmac_sha256(SECRET, `${ts}.${body}`))
 * En GET el body es '' → se firma `${ts}.` (con el punto final).       */

function _firmar(secret, mensaje) {
  return crypto.createHmac('sha256', secret).update(mensaje).digest('hex');
}

function _cabeceras(body) {
  const ts = Math.floor(Date.now() / 1000).toString();
  return {
    'Content-Type': 'application/json',
    'User-Agent': 'vants-launcher/2.4 (vants-bus-consumer)', // CF bloquea UA raro
    'X-VANTS-Project': 'vants-launcher',
    'X-VANTS-Timestamp': ts,
    'X-VANTS-Signature': _firmar(_bus.secret, ts + '.' + body),
  };
}

async function _request(pathname, { method = 'GET', body = '', query = {} } = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
  }
  const q = qs.toString();
  const url = _bus.busUrl.replace(/\/+$/, '') + pathname + (q ? '?' + q : '');

  const res = await fetch(url, {
    method,
    headers: _cabeceras(body),
    body: method === 'GET' ? undefined : body,
  });
  const texto = await res.text();
  let json = null;
  try { json = JSON.parse(texto); } catch (e) { /* respuesta no JSON */ }
  if (!res.ok) {
    const err = new Error(`vants-bus ${res.status}: ${(json && json.error) || texto.slice(0, 160)}`);
    err.status = res.status;
    throw err;
  }
  return json;
}

/* ---------- pública: publicar desde el launcher ---------- */

async function publicar(type, data = {}) {
  if (!_bus) throw new Error('vants-bus sin configurar');
  const body = JSON.stringify({ type, data });
  return _request('/events', { method: 'POST', body });
}

/* ---------- notificación + reenvío a renderers ---------- */

function _titulo(ev) {
  const d = ev.data || {};
  switch (ev.type) {
    case EVENTS.TOURNAMENT_OPENED: return '🏆 Inscripciones abiertas';
    case EVENTS.MATCH_FINISHED:    return '✅ Resultado verificado';
    case EVENTS.MATCH_SCHEDULED:   return '📅 Partido programado';
    case EVENTS.MATCH_CANCELED:    return '⚠️ Partido cancelado';
    case EVENTS.HIGHLIGHTS_READY:  return '🎬 Nuevo highlight';
    case EVENTS.POST_GENERATED:    return '📰 Nueva publicación';
    case EVENTS.ALERT_DETECTED:    return '🚨 Alerta VANTS';
    default:                       return 'VANTS GAMES';
  }
}

function _cuerpo(ev) {
  const d = ev.data || {};
  if (ev.type === EVENTS.TOURNAMENT_OPENED) return d.tournamentName || d.nombre || 'Nuevo torneo disponible';
  if (ev.type === EVENTS.MATCH_FINISHED) {
    return (d.a && d.b) ? `${d.a} ${d.sa ?? ''} - ${d.sb ?? ''} ${d.b}` : 'Tu partido ya tiene resultado';
  }
  if (ev.type === EVENTS.MATCH_SCHEDULED) {
    return (d.a && d.b) ? `${d.a} vs ${d.b}${d.cuando ? ' · ' + d.cuando : ''}` : 'Nuevo partido en el calendario';
  }
  if (ev.type === EVENTS.ALERT_DETECTED) return d.message || 'Revisa la plataforma';
  return d.title || d.texto || d.text || 'Mira las novedades en playvants';
}

function _difundir(ev) {
  if (!_electron || !_electron.BrowserWindow) return;
  try {
    for (const w of _electron.BrowserWindow.getAllWindows()) {
      if (!w.isDestroyed()) w.webContents.send('vants:bus-evento', ev);
    }
  } catch (e) { /* las ventanas pueden estar cerrándose */ }
}

function _notificar(ev) {
  _difundir(ev);
  if (_electron && _electron.Notification && !_electron.Notification.isSupported()) return;
  try {
    new _electron.Notification({
      title: _titulo(ev),
      body: _cuerpo(ev),
      silent: ev.type === EVENTS.MATCH_SCHEDULED,
    }).on('click', () => {
      const w = _electron.BrowserWindow.getAllWindows()[0];
      if (w && !w.isDestroyed()) { w.show(); w.focus(); }
    }).show();
  } catch (e) { /* notificar no debe romper nunca el bucle */ }
}

/* Cursor "ahora": en la PRIMERA ejecución (sin cursor guardado) NO se
 * reproduce todo el historial del bus; se consume solo lo nuevo. Genera
 * un id evt_ ULID-like con el timestamp actual (mismo alfabeto base32
 * que usa el bus), compatible con la paginación `id > cursor`. */
const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
function _ulidAhora() {
  let t = BigInt(Date.now());
  let tsStr = '';
  for (let i = 0; i < 10; i++) { tsStr = B32[Number(t % 32n)] + tsStr; t /= 32n; }
  return 'evt_' + tsStr + '0'.repeat(16);
}

/* ---------- bucle de consumo (long-poll) ---------- */

function _bucle(intervaloMs) {
  let cursor = _cargarCursor();
  if (!cursor) cursor = _ulidAhora(); // primera vez → desde ahora, sin historial
  let parado = false;
  let backoff = 5000;

  (async () => {
    while (!parado) {
      try {
        const res = await _request('/events', {
          query: { since: cursor || '', types: TIPOS_LAUNCHER.join(','), limit: 100, wait: 20 },
        });
        for (const ev of (res.events || [])) {
          cursor = ev.id;
          _guardarCursor(cursor);
          try {
            _notificar(ev);
            ESTADO.procesados++;
            ESTADO.ultimoEvento = { id: ev.id, type: ev.type, source: ev.source, ts: ev.ts };
          } catch (e) { ESTADO.errores++; }
        }
        if (res.cursor) { cursor = res.cursor; _guardarCursor(cursor); }
        backoff = 5000;
      } catch (err) {
        ESTADO.errores++;
        backoff = Math.min(backoff * 2, 300000);
      }
      await new Promise(r => setTimeout(r, backoff));
      if (parado) break;
    }
  })();

  return { stop: () => { parado = true; } };
}

/* ---------- arranque ---------- */

function iniciar(opts = {}) {
  if (ESTADO.corriendo) return { ok: true, yaCorria: true, estado: ESTADO };
  _electron = opts.electron || (() => { try { return require('electron'); } catch (e) { return null; } })();

  const cfg = _cargarConfig();
  if (!cfg) {
    return { ok: false, razon: 'sin config (VANTS_BUS_URL/VANTS_BUS_SECRET o vants-bus.config.json)' };
  }
  _bus = { busUrl: cfg.busUrl, secret: cfg.secret };
  ESTADO.configOrigen = cfg.origen;

  // IPC para el renderer: estado del bus + publicar (si algún día lo usa)
  if (_electron && _electron.ipcMain) {
    try {
      _electron.ipcMain.handle('vants:bus-estado', () => ({ ...ESTADO, configOrigen: _bus ? _bus.busUrl : null }));
      _electron.ipcMain.handle('vants:bus-publicar', (_ev2, type, data) => publicar(type, data));
    } catch (e) { /* si ya estaba registrado, seguir */ }
  }

  _detener = _bucle(opts.intervaloMs || 5000);
  ESTADO.corriendo = true;
  return { ok: true, estado: ESTADO };
}

function detener() { if (_detener) _detener.stop(); ESTADO.corriendo = false; }
function estado() { return { ...ESTADO }; }

module.exports = { iniciar, detener, estado, publicar, EVENTS, TIPOS_LAUNCHER };
