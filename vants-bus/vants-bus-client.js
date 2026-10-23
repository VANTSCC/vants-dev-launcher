/* ============================================================
 * VANTS-BUS · Cliente JavaScript universal
 * Funciona en: Cloudflare Workers, Node ≥ 18, Electron (main),
 * y navegadores (contexto seguro). Sin dependencias externas.
 *
 * Uso rápido:
 *   import { VantsBus, EVENTS } from './vants-bus-client.js';
 *   const bus = new VantsBus({ busUrl: 'https://vants-bus.<tu-subdomain>.workers.dev',
 *                              projectId: 'vants-launcher', secret: SECRETO });
 *   await bus.publish(EVENTS.GAME_SESSION_STARTED, { game: 'valorant' });
 *   bus.startPolling({ onEvent: ev => console.log('llegó', ev) });
 *
 * IMPORTANTE: el secreto solo vive del lado servidor (Workers /
 * proceso main de Electron / backend). NUNCA lo expongas en el
 * bundle del navegador.
 * ============================================================ */

const ENC = new TextEncoder();

async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey(
    'raw', ENC.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, ENC.encode(message));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/* Contrato compartido — mantener sincronizado con events-types.json
 * y con clients/python/vants_bus_client.py */
export const EVENTS = {
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

export class VantsBus {
  constructor({ busUrl, projectId, secret, fetchImpl } = {}) {
    if (!busUrl)    throw new Error('VantsBus: falta busUrl');
    if (!projectId) throw new Error('VantsBus: falta projectId');
    if (!secret)    throw new Error('VantsBus: falta secret');

    this.busUrl = String(busUrl).replace(/\/+$/, '');
    this.projectId = projectId;
    this.secret = secret;
    this._fetch = fetchImpl || globalThis.fetch;
    if (!this._fetch) throw new Error('VantsBus: fetch no disponible (¿Node < 18?)');
  }

  /* Firma: X-VANTS-Signature = hex(hmac_sha256(SECRET, `${ts}.${rawBody}`)).
   * En GET, rawBody es '' → se firma `${ts}.` (con el punto final). */
  async _headers(rawBody) {
    const ts = Math.floor(Date.now() / 1000).toString();
    const sig = await hmacHex(this.secret, ts + '.' + rawBody);
    return {
      'Content-Type': 'application/json',
      'X-VANTS-Project': this.projectId,
      'X-VANTS-Timestamp': ts,
      'X-VANTS-Signature': sig,
    };
  }

  async _request(path, { method = 'GET', body = '', query = {} } = {}) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
    }
    const q = qs.toString();
    const url = this.busUrl + path + (q ? '?' + q : '');

    const res = await this._fetch(url, {
      method,
      headers: await this._headers(body),
      body: method === 'GET' ? undefined : body,
    });

    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* respuesta no JSON */ }

    if (!res.ok) {
      const err = new Error(`VantsBus ${res.status}: ${(json && json.error) || text.slice(0, 200)}`);
      err.status = res.status;
      throw err;
    }
    return json;
  }

  /* ---- publicar ---- */
  async publish(type, data = {}) {
    return this._request('/events', { method: 'POST', body: JSON.stringify({ type, data }) });
  }

  async publishBatch(events) {
    // events: [{ type, data }, ...]
    return this._request('/events', { method: 'POST', body: JSON.stringify({ events }) });
  }

  /* ---- consumir ---- */
  async fetchEvents({ since, types, sources, limit, wait } = {}) {
    return this._request('/events', {
      query: {
        since,
        types: Array.isArray(types) ? types.join(',') : types,
        sources: Array.isArray(sources) ? sources.join(',') : sources,
        limit,
        wait,
      },
    });
  }

  /* Bucle de consumo con cursor propio. Devuelve { stop() }.
   *   onEvent(ev)   → se llama por cada evento nuevo
   *   onError(err)  → fallos de red/servidor (con backoff exponencial)
   *   signal        → AbortSignal para cortar desde fuera
   *   waitSeconds>0 → long-poll (respuesta casi en tiempo real,
   *                   ideal para el launcher) */
  startPolling({ types, sources, intervalMs = 30000, since = '', onEvent, onError, signal, waitSeconds = 0 } = {}) {
    let cursor = since;
    let stopped = false;
    const self = this;

    (async () => {
      let backoff = Math.max(1000, intervalMs);
      while (!stopped) {
        try {
          const res = await self.fetchEvents({
            since: cursor, types, sources, limit: 100, wait: waitSeconds,
          });
          for (const ev of (res.events || [])) {
            cursor = ev.id;
            if (onEvent) {
              try { onEvent(ev); }
              catch (e) { if (onError) onError(e); }
            }
          }
          if (res.cursor) cursor = res.cursor;
          backoff = Math.max(1000, intervalMs);
        } catch (err) {
          if (onError) onError(err);
          backoff = Math.min(backoff * 2, 300000); // backoff hasta 5 min
        }
        await new Promise(r => setTimeout(r, waitSeconds > 0 ? 500 : backoff));
        if (signal && signal.aborted) stopped = true;
      }
    })();

    return { stop: () => { stopped = true; } };
  }
}

export default VantsBus;
