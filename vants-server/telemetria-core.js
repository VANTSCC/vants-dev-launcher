const KINDS = new Set([
  'JS_ERROR',
  'NETWORK_ERROR',
  'PAGE_VIEW',
  'LOGIN_OK',
  'LOGIN_FAILED',
  'CHECKOUT_RETURN',
  'HUB_ERROR',
  'HUB_CRASH',
  'WORKER_ERROR',
]);
const SENTRY_KINDS = new Set(['JS_ERROR', 'NETWORK_ERROR', 'LOGIN_FAILED', 'HUB_ERROR', 'HUB_CRASH', 'WORKER_ERROR']);

function sanearValor(value, key = '', seen = new WeakSet()) {
  if (typeof value === 'string') return value.slice(0, key.toLowerCase() === 'stack' ? 1000 : 300);
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return value;
  if (!value || typeof value !== 'object' || seen.has(value)) return undefined;
  seen.add(value);
  if (Array.isArray(value)) {
    const result = value.map((item) => sanearValor(item, '', seen));
    seen.delete(value);
    return result;
  }
  const result = {};
  for (const [name, item] of Object.entries(value)) {
    const clean = sanearValor(item, name, seen);
    if (clean !== undefined) result[name.slice(0, 40)] = clean;
  }
  seen.delete(value);
  return result;
}

export function validarLote(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || !Array.isArray(body.events)) {
    return { ok: false, error: 'events debe ser una lista' };
  }
  if (body.events.length < 1 || body.events.length > 20) {
    return { ok: false, error: 'el lote debe contener entre 1 y 20 eventos' };
  }
  const eventos = [];
  let descartados = 0;
  for (const raw of body.events) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) ||
        typeof raw.kind !== 'string' || raw.kind.length > 40 || !KINDS.has(raw.kind)) {
      descartados++;
      continue;
    }
    eventos.push(sanearValor(raw));
  }
  if (!eventos.length) return { ok: false, error: 'no hay eventos válidos', descartados };
  return { ok: true, eventos, descartados };
}

export function sentryEnvelope(dsn, evento, meta = {}) {
  try {
    const parsed = new URL(String(dsn || ''));
    const publicKey = decodeURIComponent(parsed.username || '');
    const projectId = parsed.pathname.split('/').filter(Boolean).pop() || '';
    if (parsed.protocol !== 'https:' || !publicKey || !/^[A-Za-z0-9_-]+$/.test(projectId)) return null;

    const eventId = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
    const kind = String(evento && evento.kind || 'ERROR');
    const d = evento && evento.data && typeof evento.data === 'object' ? sanearValor(evento.data) || {} : {};
    const message = String(evento && evento.message || d.message || (d.endpoint ? `${kind} ${d.status} ${d.endpoint}` : kind)).slice(0, 300);
    const stack = evento && evento.stack || d.stack;
    const origen = kind.startsWith('HUB_') ? 'hub' : kind === 'WORKER_ERROR' ? 'worker' : 'web';
    const event = {
      event_id: eventId,
      timestamp: new Date().toISOString(),
      platform: 'javascript',
      level: 'error',
      message,
      exception: {
        values: [{
          type: kind,
          value: message,
          ...(stack ? { stacktrace: { frames: String(stack).slice(0, 1000).split('\n').map((line) => ({ filename: line.slice(0, 300) })) } } : {}),
        }],
      },
      extra: d,
      tags: {
        origen,
        kind,
        ...((evento && evento.release) || meta.release ? { release: String(evento && evento.release || meta.release).slice(0, 300) } : {}),
        ...(evento && evento.page != null ? { page: String(evento.page).slice(0, 300) } : {}),
        ...(evento && evento.session_id != null ? { session_id: String(evento.session_id).slice(0, 300) } : {}),
      },
      request: { url: String(evento && evento.url || meta.url || '').slice(0, 300) },
    };
    const envelope = [
      JSON.stringify({ event_id: eventId, sent_at: new Date().toISOString(), dsn: String(dsn) }),
      JSON.stringify({ type: 'event' }),
      JSON.stringify(event),
    ].join('\n');
    return {
      url: `https://${parsed.host}/api/${projectId}/envelope/`,
      body: envelope,
      headers: {
        'Content-Type': 'application/x-sentry-envelope',
        'X-Sentry-Auth': `Sentry sentry_version=7, sentry_key=${publicKey}, sentry_client=vants-worker/1.0`,
      },
    };
  } catch {
    return null;
  }
}

export function debeReportarSentry(kind) {
  return SENTRY_KINDS.has(kind);
}
