# API CONTRACTS — VANTS

> Contratos de los endpoints vivos de la plataforma. Todo JSON. Errores con
> forma `{ ok:false, error:{ message } }` donde aplica. Los endpoints del
> Worker exigen `Origin` propio (CORS) y tienen rate limit por IP.

## 1 · Worker principal (vants.vants.workers.dev)

| Método | Ruta | Auth | Respuesta |
|--------|------|------|-----------|
| GET | `/api/teams` | pública | `{ ok, source:"discord", count, teams:[…] }` |
| GET | `/api/gpr` | pública | `{ ok, source:"riot", total, regions:[…] }` (cache 1h) |
| GET | `/api/clips/featured` | pública | `{ ok, clips:[…] }` |
| GET | `/api/valorant/esports` | pública | agenda Valorant (upstream HenrikDev; fallback vlr.gg en la web) |
| GET | `/api/en-vivo` | pública | `{ ok, jugadores:[…] }` — hoy `base_no_disponible` (ver FASE3-REVISION §4) |
| GET | `/api/torneos/bracket?torneo=slug` | pública | bracket + inscritos |
| POST | `/api/torneos/inscribir` | JWT Auth0 | inscripción de equipo |
| POST | `/api/torneos/gestionar` | JWT Auth0 (admin) | bracket_sembrar, resultados, estados |
| POST | `/api/discord/notify` | origen propio | notificaciones del bot |
| POST | `/api/account/email-verify` · `/password-reset` | pública | envío de correo vía Auth0 |

## 2 · Worker FACEIT (vants-faceit-webhook.vants.workers.dev)

| Método | Ruta | Auth | Respuesta |
|--------|------|------|-----------|
| POST | `/api/webhooks/faceit` | header `X-VANTS-FACEIT-SECRET` (aliases: guiones bajos, `Faceit_webhook_secret`) **o** query `?secret=` | 200 `{ ok:true, stored:true }` · 401 sin/valor erróneo · 400 JSON inválido |
| GET/HEAD | `/api/webhooks/faceit` | ninguna | 200 `{ ok:true, ready:true }` (sondeo) |
| GET | `/healthz` | ninguna | 200 `{ ok:true, service, version:2 }` |

Guardado: `INSERT INTO faceit_webhook_events (event_type, payload)` — el
procesador (`faceit-xp.yml` cada 10 min + respaldo `scripts/faceit-xp.mjs`)
llama a `faceit_aplicar_resultado()` con dedupe por `UNIQUE faceit_match_id`.

## 3 · Matchmaking-service (Fase 4 · Node/Fastify · :8081)

Identidad: JWT de Auth0 RS256 verificado por JWKS en el servidor
(`services/matchmaking-service/auth.js`). Sin token → 401. Token de otro
jugador en un ticket → 403.

| Método | Ruta | Auth | Cuerpo / Respuesta |
|--------|------|------|--------------------|
| GET | `/healthz` | ninguna | `{ ok, service, version, uptime, queued }` |
| POST | `/api/v1/matchmaking/queue` | Bearer JWT | body `{ game:"valorant", mode:"duo"\|"team", region:"EU" }` → 201 `{ ok, data:{ ticket, position, ttl_ms } }` · 400 sin `game` |
| GET | `/api/v1/matchmaking/queue/:ticket` | Bearer JWT (dueño) | 200 `{ ok, data:{ ticket, game, mode, region, sub, enqueued_at, position } }` · 404 · 403 |
| DELETE | `/api/v1/matchmaking/queue/:ticket` | Bearer JWT (dueño) | 200 `{ ok, data:{ removed } }` · 404 · 403 |
| GET | `/api/v1/me` | Bearer JWT | 200 `{ ok, data:{ sub } }` |

Fase 4 (pendiente): persistencia de la cola en Neon (tablas del árbol objetivo),
elegibilidad (rango, sanciones, región) y emparejamiento real.

## 4 · API Gateway (Fase 2/4 · Node/Express · :8080)

| Método | Ruta | Auth | Respuesta |
|--------|------|------|-----------|
| GET | `/healthz` | ninguna | `{ ok, service, version, uptime }` |
| GET | `/api/v1/status` | ninguna | `{ ok, data:{ gateway, services } }` |

Rate limit: 120 req/min/IP (ventana fija en memoria). CORS: solo `ALLOW_ORIGIN`.

## 5 · FACEIT Data API (open.faceit.com)

- Host oficial: `https://open.faceit.com/data/v4` (Bearer API key server-side).
- `api.faceit.com/data/v4` responde **500** con estas keys — no usarlo.
- Usos: `scripts/faceit-xp.mjs` (history/matches por jugador vinculado) y
  futuras integraciones de la Fase 4 (resultados verificables).
