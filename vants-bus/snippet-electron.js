/* ============================================================
 * INTEGRACIÓN · Vants-launcher (Electron · proceso main)
 *
 * 1) Copia clients/js/vants-bus-client.js a tu repo, p.ej. en
 *    src/main/vants-bus-client.js
 *
 * 2) Guarda la config fuera del bundle (electron-store / .env):
 *      VANTS_BUS_URL=https://vants-bus.<sub>.workers.dev
 *      VANTS_BUS_SECRET=<secreto de vants-launcher>
 *
 * 3) Publica cuando pase algo interesante en el launcher y consume
 *    con long-poll (waitSeconds=20) para tener toasts casi en vivo.
 *
 * Requisito: Node ≥ 18 (Electron ≥ 23) por fetch + WebCrypto globales.
 * ============================================================ */

import { VantsBus, EVENTS } from './vants-bus-client.js';
import { Notification } from 'electron';

const bus = new VantsBus({
  busUrl: process.env.VANTS_BUS_URL,
  projectId: 'vants-launcher',
  secret: process.env.VANTS_BUS_SECRET,
});

/* --- PUBLICAR: el usuario inicia una partida desde el launcher --- */
export async function onGameLaunched({ game, userId, matchId }) {
  await bus.publish(EVENTS.GAME_SESSION_STARTED, { game, userId, matchId });
  // → la web marca al usuario como EN DIRECTO
  // → flask-agents registra la sesión
}

export async function onAnticheatPassed({ game, version }) {
  await bus.publish(EVENTS.ANTICHEAT_PASSED, { game, version });
}

/* --- CONSUMIR: reacciones a lo que publican web/agents/faceit --- */
export function startBusListeners() {
  return bus.startPolling({
    // Solo lo que le interesa al jugador en el launcher
    types: [
      EVENTS.TOURNAMENT_OPENED,
      EVENTS.HIGHLIGHTS_READY,
      EVENTS.MATCH_FINISHED,
    ],
    intervalMs: 30000,
    waitSeconds: 20,          // long-poll: toasts casi en tiempo real
    onEvent: (ev) => {
      const titles = {
        [EVENTS.TOURNAMENT_OPENED]: '🏆 Inscripciones abiertas',
        [EVENTS.HIGHLIGHTS_READY]:  '🎬 Nuevo highlight',
        [EVENTS.MATCH_FINISHED]:    '✅ Resultado verificado',
      };
      new Notification({
        title: titles[ev.type] || 'VANTS GAMES',
        body: summarize(ev),
      }).show();
    },
    onError: (err) => console.warn('[vants-bus] reintento:', err.message),
  });
}

function summarize(ev) {
  const d = ev.data || {};
  if (ev.type === EVENTS.TOURNAMENT_OPENED) return d.tournamentName || 'Nuevo torneo disponible';
  if (ev.type === EVENTS.MATCH_FINISHED) {
    return d.a && d.b ? `${d.a} ${d.sa ?? ''} - ${d.sb ?? ''} ${d.b}` : 'Tu partido ya tiene resultado';
  }
  return d.title || 'Mira las novedades en playvants';
}
