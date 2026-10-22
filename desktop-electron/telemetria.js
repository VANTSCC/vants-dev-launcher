'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const COLLECTOR = 'https://vants.vants.workers.dev/api/telemetria';
const MAX_LOG_BYTES = 1024 * 1024;
const MAX_BATCH = 20;
const MAX_QUEUE = 100;
const MIN_BACKOFF_MS = 5000;
const MAX_BACKOFF_MS = 5 * 60 * 1000;
const REDACTAR = /token|authorization|cookie|password|secret/i;

function clasificarSalida(reason) {
  if (reason === 'clean-exit') return null;
  if (reason === 'killed') return 'HUB_ERROR';
  if (['crashed', 'oom', 'abnormal-exit', 'launch-failed', 'integrity-failure'].includes(reason)) return 'HUB_CRASH';
  return null;
}

function siguienteBackoff(ms) {
  const actual = Number.isFinite(ms) && ms > 0 ? ms : MIN_BACKOFF_MS;
  return Math.min(actual * 2, MAX_BACKOFF_MS);
}

function reencolarLote(queue, lote, max = MAX_QUEUE) {
  const limite = Number.isFinite(max) ? Math.max(0, Math.floor(max)) : MAX_QUEUE;
  const eventos = lote.concat(queue);
  return limite ? eventos.slice(-limite) : [];
}

function sanear(value, seen = new WeakSet(), key = '') {
  if (typeof value === 'string') return value.slice(0, key.toLowerCase() === 'stack' ? 1000 : 300);
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return value;
  if (!value || typeof value !== 'object' || seen.has(value)) return undefined;
  seen.add(value);
  if (Array.isArray(value)) {
    const clean = value.map((item) => sanear(item, seen));
    seen.delete(value);
    return clean;
  }
  const clean = {};
  for (const [name, item] of Object.entries(value)) {
    if (REDACTAR.test(name)) continue;
    const result = sanear(item, seen, name);
    if (result !== undefined) clean[name.slice(0, 40)] = result;
  }
  seen.delete(value);
  return clean;
}

function rotarSiGrande(filePath, maxBytes = MAX_LOG_BYTES) {
  try {
    if (fs.statSync(filePath).size <= maxBytes) return false;
    const rotated = filePath + '.1';
    try { fs.unlinkSync(rotated); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    fs.renameSync(filePath, rotated);
    return true;
  } catch (error) {
    return false;
  }
}

function iniciar({ app, log } = {}) {
  if (!app) return { report() {}, flush() { return Promise.resolve(); } };
  try {
    const { crashReporter } = require('electron');
    crashReporter.start({ uploadToServer: false });
  } catch (error) {}

  let enabled = false;
  try { enabled = !!(app && (app.isPackaged || process.env.VANTS_TELEMETRIA === '1')); } catch (error) {}
  if (!enabled) return { report() {}, flush() { return Promise.resolve(); } };

  let logPath = '';
  try {
    const dir = path.join(app.getPath('userData'), 'logs');
    fs.mkdirSync(dir, { recursive: true });
    logPath = path.join(dir, 'vants-hub.log');
  } catch (error) {}

  let queue = [];
  let timer = null;
  let sending = false;
  let backoffMs = MIN_BACKOFF_MS;

  function escribir(evento) {
    try {
      if (!logPath) return;
      fs.mkdirSync(path.dirname(logPath), { recursive: true });
      rotarSiGrande(logPath, MAX_LOG_BYTES);
      fs.appendFileSync(logPath, JSON.stringify(evento) + '\n', 'utf8');
    } catch (error) {}
  }

  function programar(delayMs = backoffMs) {
    if (timer || sending || !queue.length) return;
    timer = setTimeout(() => {
      timer = null;
      void enviar();
    }, delayMs);
    if (timer && typeof timer.unref === 'function') timer.unref();
  }

  async function enviar() {
    if (sending || !queue.length) return;
    if (timer) { clearTimeout(timer); timer = null; }
    sending = true;
    const eventos = queue.splice(0, MAX_BATCH);
    let retryDelay = null;
    try {
      const response = await fetch(COLLECTOR, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ events: eventos }),
      });
      if (!response.ok && response.status !== 400 && response.status !== 413) {
        throw new Error('collector_http_' + response.status);
      }
      if (response.ok) backoffMs = MIN_BACKOFF_MS;
    } catch (error) {
      queue = reencolarLote(queue, eventos, MAX_QUEUE);
      retryDelay = backoffMs;
      backoffMs = siguienteBackoff(backoffMs);
    } finally {
      sending = false;
      if (queue.length) programar(retryDelay == null ? backoffMs : retryDelay);
    }
  }

  function report(kind, details = {}) {
    try {
      const clean = sanear(details) || {};
      const evento = sanear(Object.assign({}, clean, {
        kind,
        message: clean.message || kind,
        release: app.getVersion(),
        os: process.platform + ' ' + os.release(),
      }));
      escribir(evento);
      try { if (typeof log === 'function') log('telemetria:', evento.kind, evento.message); } catch (error) {}
      queue = queue.concat(evento).slice(-MAX_QUEUE);
      if (queue.length >= MAX_BATCH && !sending && !timer) void enviar();
      else programar();
      return evento;
    } catch (error) {
      return null;
    }
  }

  function describe(error) {
    if (error instanceof Error) return { message: error.message, stack: error.stack };
    return { message: String(error == null ? 'Error desconocido' : error) };
  }

  try {
    process.on('uncaughtException', (error) => {
      report('HUB_CRASH', describe(error));
      const cierre = enviar();
      Promise.race([cierre, new Promise((resolve) => setTimeout(resolve, 1200))])
        .finally(() => process.exit(1));
    });
    process.on('unhandledRejection', (reason) => report('HUB_ERROR', describe(reason)));
    app.on('render-process-gone', (event, webContents, details = {}) => {
      const kind = clasificarSalida(details.reason);
      if (!kind) return;
      report(kind, {
        message: 'renderer process gone',
        reason: details.reason,
        exitCode: details.exitCode,
        webContentsId: webContents && webContents.id,
      });
    });
    app.on('child-process-gone', (event, details = {}) => {
      const kind = clasificarSalida(details.reason);
      if (!kind) return;
      report(kind, {
        message: 'child process gone',
        reason: details.reason,
        exitCode: details.exitCode,
        serviceName: details.serviceName,
        type: details.type,
      });
    });
    app.on('web-contents-created', (event, webContents) => {
      try {
        webContents.on('unresponsive', () => report('HUB_CRASH', {
          message: 'web contents unresponsive',
          reason: 'unresponsive',
          webContentsId: webContents.id,
        }));
      } catch (error) {}
    });
  } catch (error) {}

  return { report, flush: enviar };
}

module.exports = { iniciar, sanear, rotarSiGrande, clasificarSalida, siguienteBackoff, reencolarLote };
