# VANTS-BUS · Consumidor REAL del launcher (ACTIVADO)

Bus de eventos central: `https://vants-bus.vants.workers.dev`

Estado: **consumidor activo en el proceso main** — cableado en
`desktop-electron/main.js` (aditivo: si no hay configuración, el
launcher arranca exactamente igual que siempre). Verificado en vivo
contra el bus real con stub de Electron (notificación + reenvío al
renderer + cursor persistido).

## Componentes

| Archivo | Qué es |
|---|---|
| `vants-bus-client.js` | Cliente universal (ESM) para uso avanzado. |
| `snippet-electron.js` | Ejemplo didáctico. |
| `../desktop-electron/vants-bus-consumer.js` | **El consumidor real** (CommonJS, autónomo, incluido en `build.files`). |

## Qué hace el consumidor real

- **Long-poll 20 s** → toasts casi en tiempo real sin WebSocket.
- Tipos que escucha: `tournament.inscriptions_opened`,
  `match.finished`, `match.scheduled`, `match.canceled`,
  `clip.highlights_ready`, `post.generated`, `alert.detected`.
- **Notificación nativa del SO** + reenvío a TODAS las ventanas por
  el canal IPC `vants:bus-evento` (el renderer lo recibe con
  `window.vantsHub.onBusEvento(ev)` — ya expuesto en `preload.js`).
- **Cursor persistente** en `userData/vants-bus-cursor.json`: al
  reiniciar continúa donde quedó, sin duplicados. Primera ejecución
  NO reproduce el historial: empieza "desde ahora".
- IPC adicional: `vants:bus-estado` (diagnóstico) y
  `vants:bus-publicar` (por si el renderer quiere publicar).
- Helper `publicar(type, data)` en el proceso main para publicar
  (p. ej. `game.session_started` cuando el launcher abra un juego).

## Activación (config)

El consumidor se enciende SOLO con configuración (la primera que
exista gana):

1. Variables de entorno al arrancar el launcher:
   `VANTS_BUS_URL` + `VANTS_BUS_SECRET` (secreto de `vants-launcher`).
2. O un archivo `vants-bus.config.json`:
   - junto a `main.js`, o
   - en `%APPDATA%/vants-hub/vants-bus.config.json`:
     ```json
     { "busUrl": "https://vants-bus.vants.workers.dev", "secret": "<secreto de vants-launcher>" }
     ```

El secreto NO va en el repo: se distribuye con `safeStorage` o se
coloca a mano en la máquina del jugador.

## Nota Cloudflare

El módulo envía `User-Agent` propio: CF Bot Fight Mode bloquea
clientes con UA genérico (403 error 1010).
