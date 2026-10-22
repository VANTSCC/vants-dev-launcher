#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { sanear, rotarSiGrande } = require('../desktop-electron/telemetria.js');

let OK = 0;
function t(name, fn) {
  fn();
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
  });
  t('rechaza un lote vacío', () => {
    assert.strictEqual(validarLote({ events: [] }).ok, false);
  });
  t('rechaza más de 20 eventos', () => {
    assert.strictEqual(validarLote({ events: Array(21).fill(evento) }).ok, false);
  });
  t('rechaza kinds desconocidos', () => {
    assert.strictEqual(validarLote({ events: [{ kind: 'UNKNOWN' }] }).ok, false);
  });
  t('trunca strings generales a 300 y stack a 1000 caracteres', () => {
    const result = validarLote({ events: [{ kind: 'JS_ERROR', message: 'm'.repeat(350), stack: 's'.repeat(1200) }] });
    assert.strictEqual(result.eventos[0].message.length, 300);
    assert.strictEqual(result.eventos[0].stack.length, 1000);
  });

  console.log('\n— sentryEnvelope —');
  t('interpreta DSN, construye URL, auth y envelope de 3 líneas', () => {
    const result = sentryEnvelope('https://public123@o123.ingest.sentry.io/456', evento, { url: evento.url });
    assert.strictEqual(result.url, 'https://o123.ingest.sentry.io/api/456/envelope/');
    assert.strictEqual(result.headers['X-Sentry-Auth'], 'Sentry sentry_version=7, sentry_key=public123, sentry_client=vants-worker/1.0');
    const lines = result.body.split('\n');
    assert.strictEqual(lines.length, 3);
    assert.strictEqual(JSON.parse(lines[1]).type, 'event');
    assert.strictEqual(JSON.parse(lines[2]).tags.origen, 'web');
  });
  t('devuelve null para DSN inválido', () => {
    assert.strictEqual(sentryEnvelope('not-a-dsn', evento), null);
  });

  console.log('\n— debeReportarSentry —');
  t('reporta solo los kinds de error definidos', () => {
    for (const kind of ['JS_ERROR', 'NETWORK_ERROR', 'LOGIN_FAILED', 'HUB_ERROR', 'HUB_CRASH', 'WORKER_ERROR']) {
      assert.strictEqual(debeReportarSentry(kind), true, kind);
    }
    for (const kind of ['PAGE_VIEW', 'LOGIN_OK', 'UNKNOWN']) assert.strictEqual(debeReportarSentry(kind), false, kind);
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

  console.log(`\n✅ ${OK} comprobaciones de telemetría aprobadas`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
