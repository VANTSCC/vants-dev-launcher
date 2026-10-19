# Fase 3 — Revisión de backend y datos (2026-10-19)

> Alcance: **revisar** autenticación, permisos, esquemas de Neon, rankings y
> torneos (docs/ARCHITECTURE.md §7). Nada del backend fue modificado: solo
> medir, probar y documentar. Los cambios de esta tarea son: poller FACEIT al
> host correcto y matchmaking-service con JWT Auth0 (Fase 4, servicios Node).

## 1 · Verificación en producción (vants.vants.workers.dev)

| Endpoint | Estado | Comprobado |
|----------|--------|------------|
| `GET /api/teams` | ✅ 200 | 1 equipo (VANTS/VTS) desde el canal de Discord |
| `GET /api/gpr` | ✅ 200 | 48 equipos, fuente Riot, calculado 2026-10-09 |
| `GET /api/clips/featured` | ✅ 200 | clips destacados con dueño correcto |
| `GET /api/torneos/bracket` | ✅ 400 esperado | exige `?torneo=slug`; no hay torneos activos |
| `GET /api/valorant/esports` | ⚠️ 500 upstream | ver §3 |
| `GET /api/en-vivo` | ⚠️ base_no_disponible | ver §4 |
| FACEIT webhook (worker aparte) | ✅ v2 | 401 sin secreto · 200 con secreto/alias/query · GET 200 |

**Auth0**: el flujo PKCE SPA (vants.eu.auth0.com, cliente `oaOmNizh…`) sigue
funcionando; el chip de nav con nombre/foto reales (commit 350d245 del dueño)
consume la sesión sin errores en QA con navegador. El matchmaking-service
nuevo valida JWT RS256 por JWKS (6/6 tests de firma/expiración/iss/kid OK).

## 2 · Estado de la base (Neon, estado-db.json automático)

47 tablas. Datos relevantes:

- `players` → **1** (solo el dueño, tras las directivas de borrado de duplicados).
- `faceit_matches` → **30** partidas FACEIT ya procesadas (pipeline XP vivo).
- `faceit_webhook_events` → **4** eventos recibidos por el webhook.
- `ranked_matches`/`ranked_history`/`series_ranked` → 0 (ranked interno sin partidas aún).
- `tournaments`/`tournament_*` → 0 (sin torneos activos; endpoints listos).
- `audit_logs` → 25 (auditoría operando).

La migración `faceit_aplicar_resultado()` con dedupe por `UNIQUE faceit_match_id`
(migraciones 08/10) está en producción y acumula partidas — la base de la Fase 4.

## 3 · Hallazgo: /api/valorant/esports devuelve 500

La respuesta es literal del upstream `api.henrikdev.xyz/valorant/v1/esports/schedule`
(`errors[code:9] "Not able to fetch needed resource to build response"`): el
Worker la reenvía con su mapeo 401→500 para no exponer la clave. **No es un bug
del Worker.** La web tiene fallback a su agenda verificada de vlr.gg, así que la
experiencia no se rompe. Acción sugerida: monitorizar; si persiste días, revisar
el plan/permisos de la clave de HenrikDev (esports suele requerir plan de pago).

## 4 · Hallazgo: /api/en-vivo devuelve base_no_disponible

Dos causas encadenadas:

1. La vista `v_en_vivo` **no existe** en Neon (el estado automático no la lista y
   ninguna migración la crea).
2. `neonGet()` consulta la Neon Data API **sin token** para lecturas públicas;
   esa API exige JWT siempre (lo confirma auth0-config.js: sin sesión el
   frontend pasa por el proxy público `vantsdata`).

Propuesta (a ejecutar cuando el dueño apruebe, no rompe nada existente):

- Migración 20: crear `v_en_vivo` sobre `presence` + `players` (columnas mínimas
  que el frontend ya consume: jugador, estado, actualizado).
- Secret `NEON_SERVICE_TOKEN` (JWT de servicio de Neon) o acceso directo con
  `DATABASE_URL` en el Worker, y `neonGet` lo usa solo para lecturas públicas.

## 5 · Seguridad revisada

- Secretos fuera de código: HENRIKDEV_API_KEY, FACEIT_WEBHOOK_SECRET,
  DATABASE_URL (worker FACEIT), FACEIT_API_KEY (GH secret) — correcto.
- CORS cerrado en todos los endpoints API del Worker (SITE_ORIGINS).
- Rate limiting por IP en /api/* (esports con límite estricto).
- Anti-bot/UA scanner activo en el Worker (probado: UA vacío/HTTP tools → bloqueo).
- Corrección aplicada esta tarea: `scripts/faceit-xp.mjs` ahora usa el host
  oficial `open.faceit.com` (api.faceit.com/data/v4 responde 500 con API keys
  server-side; verificado con la clave del dueño — "Token was not recognised"
  era una clave distinta a la real `…5b80`).
