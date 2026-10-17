# Vants Supervisor Bot v1.0 — guía de despliegue

Implementación MVP (Fase 1 del diseño técnico de 16 láminas) **adaptada a tu infraestructura
real**: Neon + bot Python + GitHub Pages, en lugar de Cloudflare Worker + Fly.io.

## Arquitectura real

```
┌──────────────────────────┐   POST /events    ┌───────────────────────────┐
│ Web (GitHub Pages)       │ ────────────────► │ Neon Function `supervisor`│
│ assets/js/               │  lote cada ~3.5s  │ valida · clasifica ·      │
│ vants-supervisor.js      │  (sendBeacon)     │ deduplica → web_events    │
│ · window.onerror         │                   └────────────┬──────────────┘
│ · fetch interceptor      │                                │ INSERT
│ · pageviews (#/rutas)    │                                ▼
│ · LOGIN_OK / LOGIN_FAILED│                   ┌───────────────────────────┐
│   (portada + PANEL ADMIN)│                   │ Neon · tabla web_events   │
└──────────────────────────┘                   └────────────┬──────────────┘
                                                            │ lee pendientes cada 25s
                                                            ▼
                                             ┌───────────────────────────┐
                                             │ Bot Discord (bot/)        │
                                             │ supervisor.py → embed     │
                                             └────────────┬──────────────┘
                                                          │ DM directo
                                                          ▼
                                             💬 DM 1532612429295521930
```

## Qué captura hoy (correspondencia con el diseño)

| Tipo | Severidad | Origen | Estado |
|---|---|---|---|
| `LOGIN_OK` | info (verde) | Portada y **panel admin** (callback Auth0 + sesión existente) | ✅ |
| `LOGIN_FAILED` | warn (amarillo) | Portada y **panel admin** (error Auth0, callback roto) | ✅ |
| `JS_ERROR` | error (rojo) | `window.onerror` + `unhandledrejection` (con stack y file:line:col) | ✅ |
| `NETWORK_ERROR` | error (rojo) | Interceptor de `fetch` (5xx y rechazos, sin autocapturarse) | ✅ |
| `PAGE_VIEW` | info (verde) | Cargas y cambios de ruta `#/` (base de la Fase 2 "movimientos") | ✅ |
| `SERVICE_DOWN` | critical | Requiere monitor externo (UptimeRobot) → **Fase 2/3, pendiente** | ⏳ |

---

## PASO 1 — Crear la tabla en Neon (2 min)

1. Abre el **dashboard de Neon** → proyecto `square-surf-41242074` → **SQL Editor**.
2. Pega el contenido completo de `docs/supervisor.sql` y pulsa **Run**.
3. Comprueba que aparecen `web_events` en Tables y la fila `supervisor` en `bot_settings`.

> Es idempotente: si lo ejecutas dos veces no duplica nada.

## PASO 2 — Desplegar la función `supervisor` en Neon (5 min)

1. Dashboard de Neon → **Functions** → crea una función nueva (misma rama/raíz que `vantsdata`).
2. Sube/conecta el código de `neon-functions/supervisor/index.ts` (carpeta `neon-functions/supervisor/`).
3. En **Environment variables** de la función:
   - `DATABASE_URL` = la misma cadena de conexión de Neon que usa el resto (con `sslmode=require`).
   - `SUPERVISOR_RATE_PER_MIN` = opcional (por defecto 120 mensajes/min por IP).
4. Copia la **URL pública** de la función (tendrá el formato
   `https://br-sweet-shape-b42xhogj-supervisor.compute.c-6.us-east-2.aws.neon.tech`).
5. Prueba en el navegador: `https://<TU_URL>/` debe responder `{"ok":true,"version":"supervisor-collector-1",...}`.

## PASO 3 — Conectar la web con el collector (1 min)

Abre `assets/js/vants-supervisor.js`,
busca la línea marcada como **CONFIGURACIÓN** (línea 15 aprox.) y pega la URL:

```js
var COLLECTOR = String(window.VANTS_SUPERVISOR_URL || 'https://br-sweet-shape-b42xhogj-supervisor.compute.c-6.us-east-2.aws.neon.tech').replace(/\/+$/, '');
```

Al hacer push, GitHub Pages publica el SDK y la web empieza a enviar eventos.
Mientras la URL esté vacía, el SDK se apaga solo (cero impacto en la web).

## PASO 4 — Bot de Discord: variables y arranque (5 min)

En `bot/.env` (fuera de git, plantilla en `.env.example`), con estos valores:

- `DISCORD_TOKEN` → token de tu bot (Discord Developer Portal)
- `DATABASE_URL` → cadena de conexión de Neon con `sslmode=require`
- `SUPERVISOR_DM_ID` → `1532612429295521930`
- `SUPERVISOR_INTERVAL` → `25`

> Si aún no tienes el bot creado: Discord Developer Portal → New Application → Bot →
> copia el token → OAuth2 → invítalo al servidor con scope `bot` (PASO 01 del diseño).

Arranque local:

```bash
cd bot
pip install -r requirements.txt
python main.py
```

El arranque imprimirá `🛡️ Supervisor de la web activo → DM 1532612429295521930`.
Importante: el DM solo llega si **compartes un servidor con el bot** y tienes los
**DMs abiertos** (Ajustes → Privacidad del servidor → Mensajes directos). Si no,
el evento queda marcado `sin_dm` en la base y no se reenvía.

El supervisor se entrega junto con el bucle de alertas (`start_alerts`), que estaba
implementado pero **nunca se llamaba** en `main.py` — con este cambio ambos quedan activos.

## PASO 5 — Probar con un evento real (2 min)

1. Abre `https://feispla.github.io/Vants/` (recarga con Ctrl+F5).
2. En la consola del navegador (F12) escribe:
   `fetch('https://endpoint-que-no-existe.vants.app/api', {method:'POST'})`
   → genera un `NETWORK_ERROR`.
3. Espera ~30 s: debe llegar el embed rojo a tu DM con footer `event_id · supervisor v1.0`.
4. Prueba también el login de la web: cierra sesión, pulsa **ENTRAR**, completa
   el login de Auth0 → `LOGIN_OK` en tu DM (el panel admin ya no existe).

---

## Seguridad, honestamente

- **Público por diseño (SPA):** la URL del collector y los eventos que envía el navegador.
  El collector valida `Origin` (`feispla.github.io`), exige la cabecera `X-Vants-Supervisor: web`,
  aplica rate-limit por IP, esquema estricto y **solo hace INSERT** en `web_events`.
  No puede leer ni escribir ninguna otra tabla. Riesgo residual: un tercero podría
  inyectar eventos falsos de telemetría (ruido), pero no acceder a datos.
- **Privado (servidor):** `DISCORD_TOKEN` y `DATABASE_URL` viven solo en el bot y en la
  función Neon — nunca en el HTML (regla de oro del repo).
- **Privacidad:** se envía IP, user-agent, URL y usuario si hay sesión. Aviso en la
  política de privacidad recomendado si la web crece.

## Apagar / ajustar

| Qué | Cómo |
|---|---|
| Pausar los DMs | `UPDATE bot_settings SET enabled = false WHERE key = 'supervisor';` (o desde el panel) |
| Pausar la captura | Dejar `COLLECTOR = ''` en `vants-supervisor.js` y hacer push |
| Menos ruido de navegación | `DELETE FROM bot_settings WHERE key='supervisor'; UPDATE web_events SET processed=true WHERE kind='PAGE_VIEW';` |

## KPIs del diseño, medibles hoy con SQL (lámina 14)

```sql
-- Tasa de logins fallidos (objetivo < 1%)
SELECT kind, COUNT(*) FROM web_events WHERE kind LIKE 'LOGIN%' GROUP BY kind;
-- Errores JS por página y tipo
SELECT page, payload->>'message' AS error, COUNT(*) FROM web_events
WHERE kind = 'JS_ERROR' GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 20;
-- Pendientes de entrega (debería ser ~0)
SELECT COUNT(*) FROM web_events WHERE processed = false;
```

## Pendiente (Fases 2 y 3 del diseño)

- Trazabilidad completa de movimientos (scroll depth, clics en CTA) — hoy: rutas `#/`.
- `SERVICE_DOWN` con monitor externo (UptimeRobot 1/min → webhook de Discord).
- Dedupe persistente con KV store + firma HMAC en el collector.
- Dashboard (BigQuery/Metabase del diseño) — sustituible por consultas SQL directas a `web_events`.
- Auto-mantenimiento del propio bot (healthcheck ya existe en `bot/utils/health.py`).
