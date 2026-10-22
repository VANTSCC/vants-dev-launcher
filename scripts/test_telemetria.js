#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  sanear,
  rotarSiGrande,
  clasificarSalida,
  siguienteBackoff,
  reencolarLote,
} = require('../desktop-electron/telemetria.js');

let OK = 0;
function t(name, fn) {
  fn();
  OK++;
  console.log('  ✓ ' + name);
}

async function tAsync(name, fn) {
  await fn();
  OK++;
  console.log('  ✓ ' + name);
}

async function main() {
  const { validarLote, sentryEnvelope, debeReportarSentry } = await import('../vants-server/telemetria-core.js');
  const evento = {
    event_id: 'evt_123',
    kind: 'JS_ERROR',
    page: 'arena',
    session_id: 's_test',
    url: 'https://vants.vants.workers.dev/',
    data: { message: 'falló' },
  };

  console.log('\n— validarLote —');
  t('acepta un lote válido', () => {
    const result = validarLote({ events: [evento] });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.eventos[0].kind, 'JS_ERROR');
    assert.strictEqual(result.descartados, 0);
  });
  t('rechaza un lote vacío', () => {
    assert.strictEqual(validarLote({ events: [] }).ok, false);
  });
  t('rechaza más de 20 eventos', () => {
    assert.strictEqual(validarLote({ events: Array(21).fill(evento) }).ok, false);
  });
  t('acepta eventos válidos y descarta kinds desconocidos', () => {
    const result = validarLote({ events: [evento, { kind: 'UNKNOWN' }] });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.eventos.length, 1);
    assert.strictEqual(result.descartados, 1);
  });
  t('rechaza un lote sin eventos válidos', () => {
    const result = validarLote({ events: [{ kind: 'UNKNOWN' }] });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.descartados, 1);
  });
  t('acepta CHECKOUT_RETURN sin reportarlo a Sentry', () => {
    const result = validarLote({ events: [{ kind: 'CHECKOUT_RETURN' }] });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(debeReportarSentry(result.eventos[0].kind), false);
  });
  t('trunca strings generales a 300 y stack a 1000 caracteres', () => {
    const result = validarLote({ events: [{ kind: 'JS_ERROR', message: 'm'.repeat(350), stack: 's'.repeat(1200) }] });
    assert.strictEqual(result.eventos[0].message.length, 300);
    assert.strictEqual(result.eventos[0].stack.length, 1000);
  });
  t('elimina claves PII y limpia query/hash de URL anidadas', () => {
    const result = validarLote({ events: [{
      kind: 'JS_ERROR',
      email: 'privado',
      user: 'privado',
      userId: 'privado',
      usuario: 'privado',
      nombre: 'privado',
      name: 'privado',
      nick: 'privado',
      sub: 'privado',
      access_token: 'privado',
      password: 'privado',
      cookie: 'privado',
      authorization: 'privado',
      secret: 'privado',
      phone: 'privado',
      telefono: 'privado',
      filename: 'renderer.js',
      serviceName: 'renderer',
      url: 'https://vants.vants.workers.dev/page?token=privado#fragmento',
      referrer: 'https://search.example/?email=privado#fragmento',
      data: {
        correo: 'privado',
        nested: {
          username: 'privado',
          filename: 'nested.js',
          url: 'https://example.test/path?token=privado#fragmento',
          referrer: 'https://example.test/from?user=privado#fragmento',
          endpoint: '/api/ping?token=privado#fragmento',
          callback: 'https://example.test/callback?code=privado#fragmento',
          redirect: 'https://example.test/?redirect=privado#fragmento',
          redirect_uri: 'https://example.test/callback?code=privado#fragmento',
          returnTo: '/arena?from=privado#vista',
        },
      },
    }] });
    const clean = result.eventos[0];
    for (const key of ['email', 'user', 'userId', 'usuario', 'nombre', 'name', 'nick', 'sub', 'access_token', 'password', 'cookie', 'authorization', 'secret', 'phone', 'telefono']) {
      assert.strictEqual(Object.hasOwn(clean, key), false, key);
    }
    assert.strictEqual(clean.filename, 'renderer.js');
    assert.strictEqual(clean.serviceName, 'renderer');
    assert.strictEqual(clean.url, 'https://vants.vants.workers.dev/page');
    assert.strictEqual(clean.referrer, 'https://search.example/');
    assert.strictEqual(Object.hasOwn(clean.data, 'correo'), false);
    assert.strictEqual(Object.hasOwn(clean.data.nested, 'username'), false);
    assert.strictEqual(Object.hasOwn(clean.data.nested, 'filename'), false);
    assert.strictEqual(clean.data.nested.url, 'https://example.test/path');
    assert.strictEqual(clean.data.nested.referrer, 'https://example.test/from');
    assert.strictEqual(clean.data.nested.endpoint, '/api/ping');
    assert.strictEqual(clean.data.nested.callback, 'https://example.test/callback');
    assert.strictEqual(clean.data.nested.redirect, 'https://example.test/');
    assert.strictEqual(clean.data.nested.redirect_uri, 'https://example.test/callback');
    assert.strictEqual(clean.data.nested.returnTo, '/arena');
  });

  console.log('\n— sentryEnvelope —');
  t('interpreta DSN, construye URL, auth y envelope de 3 líneas', () => {
    const result = sentryEnvelope('https://public123@o123.ingest.sentry.io/456', evento, { url: evento.url });
    assert.strictEqual(result.url, 'https://o123.ingest.sentry.io/api/456/envelope/');
    assert.strictEqual(result.headers['X-Sentry-Auth'], 'Sentry sentry_version=7, sentry_key=public123, sentry_client=vants-worker/1.0');
    const lines = result.body.split('\n');
    assert.strictEqual(lines.length, 3);
    assert.strictEqual(JSON.parse(lines[1]).type, 'event');
    const sentryEvent = JSON.parse(lines[2]);
    assert.strictEqual(sentryEvent.tags.origen, 'web');
    assert.strictEqual(sentryEvent.message, evento.data.message);
    assert.strictEqual(sentryEvent.extra.message, evento.data.message);
    assert.strictEqual(sentryEvent.tags.page, evento.page);
    assert.strictEqual(sentryEvent.tags.session_id, evento.session_id);
  });
  t('mapea stack y datos anidados de JS_ERROR al envelope', () => {
    const webError = Object.assign({}, evento, {
      data: { message: 'ReferenceError: x is not defined', stack: 'ReferenceError\n at app.js:10', file: 'app.js' },
    });
    const result = sentryEnvelope('https://public123@o123.ingest.sentry.io/456', webError);
    const sentryEvent = JSON.parse(result.body.split('\n')[2]);
    assert.strictEqual(sentryEvent.message, webError.data.message);
    assert.strictEqual(sentryEvent.exception.values[0].stacktrace.frames.length, 2);
    assert.deepStrictEqual(sentryEvent.extra, webError.data);
  });
  t('mantiene mensaje y stack top-level del launcher', () => {
    const launcherError = { kind: 'HUB_CRASH', message: 'launcher crashed', stack: 'Error\n at main.js:10' };
    const result = sentryEnvelope('https://public123@o123.ingest.sentry.io/456', launcherError);
    const sentryEvent = JSON.parse(result.body.split('\n')[2]);
    assert.strictEqual(sentryEvent.message, launcherError.message);
    assert.strictEqual(sentryEvent.exception.values[0].stacktrace.frames.length, 2);
    assert.strictEqual(sentryEvent.tags.origen, 'hub');
  });
  t('sanitiza PII y query/hash antes de construir el envelope Sentry', () => {
    const result = sentryEnvelope('https://public123@o123.ingest.sentry.io/456', {
      kind: 'JS_ERROR',
      url: 'https://vants.test/page?token=privado#fragmento',
      data: { email: 'privado', endpoint: '/api/ping?token=privado#fragmento' },
    });
    const sentryEvent = JSON.parse(result.body.split('\n')[2]);
    assert.strictEqual(sentryEvent.request.url, 'https://vants.test/page');
    assert.strictEqual(Object.hasOwn(sentryEvent.extra, 'email'), false);
    assert.strictEqual(sentryEvent.extra.endpoint, '/api/ping');
  });
  t('usa el mensaje data-only de NETWORK_ERROR', () => {
    const networkError = { kind: 'NETWORK_ERROR', data: { message: 'request timed out' } };
    const result = sentryEnvelope('https://public123@o123.ingest.sentry.io/456', networkError);
    assert.strictEqual(JSON.parse(result.body.split('\n')[2]).message, networkError.data.message);
  });
  t('devuelve null para DSN inválido', () => {
    assert.strictEqual(sentryEnvelope('not-a-dsn', evento), null);
  });

  console.log('\n— debeReportarSentry —');
  t('reporta solo los kinds de error definidos', () => {
    for (const kind of ['JS_ERROR', 'NETWORK_ERROR', 'LOGIN_FAILED', 'HUB_ERROR', 'HUB_CRASH', 'WORKER_ERROR']) {
      assert.strictEqual(debeReportarSentry(kind), true, kind);
    }
    for (const kind of ['PAGE_VIEW', 'LOGIN_OK', 'CHECKOUT_RETURN', 'UNKNOWN']) assert.strictEqual(debeReportarSentry(kind), false, kind);
  });

  console.log('\n— telemetria del launcher —');
  t('sanear elimina campos sensibles y trunca strings', () => {
    const clean = sanear({
      access_token: 'privado',
      nested: { Authorization: 'privado', cookieJar: 'privado', password: 'privado', client_secret: 'privado', keep: 'x'.repeat(350) },
      stack: 's'.repeat(1200),
      message: 'm'.repeat(350),
    });
    assert.deepStrictEqual(clean.nested, { keep: 'x'.repeat(300) });
    assert.strictEqual(clean.stack.length, 1000);
    assert.strictEqual(clean.message.length, 300);
  });
  t('rotarSiGrande mueve el log a .1 al superar el límite', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vants-telemetria-'));
    const file = path.join(dir, 'vants-hub.log');
    try {
      fs.writeFileSync(file, '12345');
      assert.strictEqual(rotarSiGrande(file, 4), true);
      assert.strictEqual(fs.readFileSync(file + '.1', 'utf8'), '12345');
      fs.writeFileSync(file, '1234');
      assert.strictEqual(rotarSiGrande(file, 4), false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
  t('clasifica salidas Electron de forma segura', () => {
    assert.strictEqual(clasificarSalida('clean-exit'), null);
    assert.strictEqual(clasificarSalida('killed'), 'HUB_ERROR');
    for (const reason of ['crashed', 'oom', 'abnormal-exit', 'launch-failed', 'integrity-failure']) {
      assert.strictEqual(clasificarSalida(reason), 'HUB_CRASH', reason);
    }
    assert.strictEqual(clasificarSalida('unknown'), null);
  });
  t('duplica el backoff y lo limita a cinco minutos', () => {
    assert.strictEqual(siguienteBackoff(5000), 10000);
    assert.strictEqual(siguienteBackoff(160000), 300000);
    assert.strictEqual(siguienteBackoff(300000), 300000);
    assert.strictEqual(siguienteBackoff(0), 10000);
  });
  t('reencola fallos al frente y conserva como máximo los más recientes', () => {
    assert.deepStrictEqual(reencolarLote(['nuevo'], ['reintento']), ['reintento', 'nuevo']);
    const capped = reencolarLote(Array.from({ length: 99 }, (_, i) => `nuevo-${i}`), ['viejo-1', 'viejo-2']);
    assert.strictEqual(capped.length, 100);
    assert.strictEqual(capped[0], 'viejo-2');
    assert.strictEqual(capped[capped.length - 1], 'nuevo-98');
  });

  console.log('\n— Worker telemetry endpoint —');
  const worker = (await import('../vants-server/worker.js')).default;
  const response = await worker.fetch(new Request('https://vants.vants.workers.dev/api/telemetria', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ events: [evento, { kind: 'UNKNOWN' }] }),
  }), {}, { waitUntil() {} });
  const responseBody = await response.json();
  assert.strictEqual(response.status, 200);
  assert.deepStrictEqual(responseBody, { ok: true, recibidos: 1, descartados: 1 });
  OK++;
  console.log('  ✓ responde con recibidos y descartados');

  await tAsync('limita a 30 solicitudes por minuto antes de leer el cuerpo', async () => {
    const ip = '203.0.113.20';
    for (let i = 0; i < 30; i++) {
      const limited = await worker.fetch(new Request('https://vants.vants.workers.dev/api/telemetria', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip },
        body: '{',
      }), {}, { waitUntil() {} });
      assert.strictEqual(limited.status, 400);
    }
    const limited = await worker.fetch(new Request('https://vants.vants.workers.dev/api/telemetria', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip },
      body: '{',
    }), {}, { waitUntil() {} });
    assert.strictEqual(limited.status, 429);
  });

  await tAsync('mantiene el límite de 60 eventos por minuto después de validar', async () => {
    const originalLog = console.log;
    console.log = () => {};
    try {
      const ip = '203.0.113.21';
      const events = Array.from({ length: 20 }, () => ({ kind: 'PAGE_VIEW' }));
      for (let i = 0; i < 3; i++) {
        const accepted = await worker.fetch(new Request('https://vants.vants.workers.dev/api/telemetria', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip },
          body: JSON.stringify({ events }),
        }), {}, { waitUntil() {} });
        assert.strictEqual(accepted.status, 200);
      }
      const limited = await worker.fetch(new Request('https://vants.vants.workers.dev/api/telemetria', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip },
        body: JSON.stringify({ events }),
      }), {}, { waitUntil() {} });
      assert.strictEqual(limited.status, 429);
    } finally {
      console.log = originalLog;
    }
  });

  await tAsync('reenvía solo kinds web y registra errores del supervisor', async () => {
    const originalFetch = globalThis.fetch;
    const originalLog = console.log;
    const originalError = console.error;
    const calls = [];
    const logs = [];
    const errors = [];
    globalThis.fetch = async (target, options) => {
      calls.push({ target, options });
      return new Response('', { status: 503 });
    };
    console.log = (line) => logs.push(line);
    console.error = (line) => errors.push(line);
    try {
      const pending = [];
      const response = await worker.fetch(new Request('https://vants.vants.workers.dev/api/telemetria', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.22' },
        body: JSON.stringify({ events: [
          { kind: 'PAGE_VIEW', url: 'https://vants.test/page?email=privado#fragmento', data: { email: 'privado' } },
          { kind: 'HUB_ERROR', message: 'hub error' },
        ] }),
      }), { SUPERVISOR_URL: 'https://supervisor.test/' }, { waitUntil: (promise) => pending.push(promise) });
      assert.strictEqual(response.status, 200);
      await Promise.all(pending);
      assert.strictEqual(calls.length, 1);
      assert.strictEqual(calls[0].target, 'https://supervisor.test/events');
      const forwarded = JSON.parse(calls[0].options.body);
      assert.deepStrictEqual(forwarded.events.map((item) => item.kind), ['PAGE_VIEW']);
      assert.strictEqual(forwarded.events[0].url, 'https://vants.test/page');
      assert.strictEqual(JSON.stringify(forwarded).includes('privado'), false);
      assert.strictEqual(JSON.stringify(logs).includes('privado'), false);
      assert(errors.some((line) => {
        try {
          const record = JSON.parse(line);
          return record.tipo === 'supervisor_forward_error' && record.status === 503;
        } catch {
          return false;
        }
      }));

      const noWebPending = [];
      const noWebResponse = await worker.fetch(new Request('https://vants.vants.workers.dev/api/telemetria', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.23' },
        body: JSON.stringify({ events: [{ kind: 'HUB_ERROR', message: 'hub only' }] }),
      }), { SUPERVISOR_URL: 'https://supervisor.test' }, { waitUntil: (promise) => noWebPending.push(promise) });
      assert.strictEqual(noWebResponse.status, 200);
      await Promise.all(noWebPending);
      assert.strictEqual(noWebPending.length, 0);
      assert.strictEqual(calls.length, 1);

      globalThis.fetch = async () => { throw new Error('fetch failed'); };
      const rejectedPending = [];
      await worker.fetch(new Request('https://vants.vants.workers.dev/api/telemetria', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.24' },
        body: JSON.stringify({ events: [{ kind: 'LOGIN_OK' }] }),
      }), { SUPERVISOR_URL: 'https://supervisor.test' }, { waitUntil: (promise) => rejectedPending.push(promise) });
      await Promise.all(rejectedPending);
      assert(errors.some((line) => {
        try {
          const record = JSON.parse(line);
          return record.tipo === 'supervisor_forward_error' && record.status === 'fetch_error';
        } catch {
          return false;
        }
      }));
    } finally {
      globalThis.fetch = originalFetch;
      console.log = originalLog;
      console.error = originalError;
    }
  });

  console.log(`\n✅ ${OK} comprobaciones de telemetría aprobadas`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
