# VANTS-BUS · Cliente para Vants-launcher (Electron)

Bus de eventos central: `https://vants-bus.vants.workers.dev`

El launcher consume el bus con **long-poll** (casi tiempo real, sin CDN ni
WebSocket todavía) y reacciona a lo que pasa en el ecosistema:

- `match.finished` → toast "Ganó X vs Y" en vivo
- `match.scheduled` / `match.canceled` → actualiza la agenda del overlay
- `clip.published` → notificación de nuevo clip
- `alert.detected` → avisos de los agentes

## Uso (proceso principal de Electron)

```js
const { VantsBus, EVENTS } = require('../vants-bus/vants-bus-client.js');
// o, si el repo usa ESM: import { VantsBus, EVENTS } from '../vants-bus/vants-bus-client.js';

const bus = new VantsBus({
  busUrl: process.env.VANTS_BUS_URL || 'https://vants-bus.vants.workers.dev',
  projectId: 'vants-launcher',
  secret: process.env.VANTS_BUS_SECRET, // NO hardcodear: env o store seguro del usuario
});

const stop = bus.startPolling({
  onEvent: (e) => {
    if (e.type === EVENTS.MATCH_FINISHED) {
      new Notification({ title: 'Resultado VANTS', body: `${e.data.a} ${e.data.sa} — ${e.data.sb} ${e.data.b}` }).show();
    }
  },
  onError: (err) => console.warn('bus:', err.message),
  waitSeconds: 25, // long-poll
});
// stop() para cancelar al cerrar la app
```

## Secret del proyecto

`VANTS_BUS_SECRET` = secreto HMAC de `vants-launcher` (generado y guardado
en el archivo local de secretos; no se sube a GitHub). En producción
empaquetado, distribuir con `safeStorage` de Electron o pedirlo al arrancar.

`snippet-electron.js` tiene un módulo completo de toasts + agenda listo para
cargar en el proceso principal.
