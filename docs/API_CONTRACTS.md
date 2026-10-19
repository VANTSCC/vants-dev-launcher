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

**Persistencia (migración 21)**: cola y partidas en Neon (`mm_tickets`,
`mm_matches`, `mm_match_players`). Sin `DATABASE_URL` postgres:// el servicio
arranca en modo memoria (degradado). Unicidad: **un ticket activo por
(sub, game)** — índice único parcial; reencolar devuelve el ticket vivo
(200 `reutilizado:true`) conservando su modo/región originales. Elegibilidad:
el sub debe existir en `players` (403 si no). Emparejamiento atómico
(`mm_intentar_emparejar`, SKIP LOCKED): tamaños duo=2 (1v1), team=10 (5v5);
el match nace `propuesto` al completarse el grupo. TTL del ticket: 10 min.
Errores de BD → 503 JSON limpio; `/healthz` nunca 500 (reporta `db:error`).

| Método | Ruta | Auth | Cuerpo / Respuesta |
|--------|------|------|--------------------|
| GET | `/healthz` | ninguna | `{ ok, service, version, store:"pg"\|"memoria", db:"ok"\|"error", queued }` |
| POST | `/api/v1/matchmaking/queue` | Bearer JWT | body `{ game:"valorant", mode:"duo"\|"team", region:"EU" }` → 201 `{ ok, data:{ ticket, reutilizado, game, mode, region, position, ttl_ms, expires_at, match_id } }` · 200 si reutiliza · 400 sin `game`/`mode` inválido · 403 no elegible |
| GET | `/api/v1/matchmaking/queue/:ticket` | Bearer JWT (dueño) | 200 `{ ok, data:{ ticket, game, mode, region, sub, status, enqueued_at, expires_at, match_id, position } }` · 404 · 403 |
| DELETE | `/api/v1/matchmaking/queue/:ticket` | Bearer JWT (dueño) | 200 `{ ok, data:{ removed } }` · 404 · 403 |
| GET | `/api/v1/matchmaking/matches/:id` | Bearer JWT (participante) | 200 `{ ok, data:{ match:{ id, game, mode, region, status, score_a, score_b, report_sub }, players:[{ sub, team }] } }` · 404 · 403 |
| POST | `/api/v1/matchmaking/matches/:id/result` | Bearer JWT (participante) | body `{ score_a, score_b }` (enteros ≥0, no ambos 0) → 200 `{ ok, data:{ match_id, status:"reportado", score_a, score_b } }` · 400 score inválido · 409 ya reportado · 403/404 |
| GET | `/api/v1/me` | Bearer JWT | 200 `{ ok, data:{ sub } }` |

Fase 4 (próximo paso): verificación del resultado (contraste FACEIT/capitán
segundo) y aplicación de RR con `rr_before`/`rr_after` en `mm_match_players`.

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
