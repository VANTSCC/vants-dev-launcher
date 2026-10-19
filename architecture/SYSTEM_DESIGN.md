# SYSTEM_DESIGN — Arquitectura de la plataforma de torneos VANTS

## 1. Visión general (stack real, decisión D1)

```
                    ┌──────────────────────────────────────────────┐
 Navegador ───────▶ │  Cloudflare Worker  (vants.vants.workers.dev)│
 Googlebot          │  · bot-protection + rate limit por buckets   │
                    │  · cabeceras de seguridad                     │
                    │  · rutas limpias /es/tournaments/:juego/:e/  │──▶ ASSETS (public/)
                    │  · API pública JSON /api/games|tournaments|… │
                    └──────────────┬───────────────────────────────┘
                                   │ REST (PostgREST-style) con token
                                   ▼
                    ┌──────────────────────────────────────────────┐
                    │  Neon Data API  (ep-autumn-scene-…neon.tech) │
                    │  RLS por policies · vistas públicas v_*      │
                    │  Postgres: games, tournaments, teams,        │
                    │  players, matches, articles, …               │
                    └──────────────────────────────────────────────┘
                                   ▲
                    ┌──────────────┴───────────────────────────────┐
                    │  CI GitHub Actions (push a main):            │
                    │  tests node → deploy Worker → neon-migrate   │
                    └──────────────────────────────────────────────┘
```

- **Frontend**: HTML/CSS/JS vanilla espejado ×3 (raíz / `public/` / `vants-server/public/`).
  Sistema de diseño `strafe.css` + shell `strafe-shell.js` (T51). Sin framework ni build.
- **Backend**: el Worker ya maneja TODAS las peticiones (`run_worker_first`), aplica seguridad
  y sirve assets; las APIs nuevas siguen el mismo patrón que las existentes (rate limit por
  bucket, CORS de origen propio, JSON `{ok,data}`).
- **Datos**: Neon Postgres vía su Data API REST (patrón ya usado por `/api/torneos/bracket`,
  `/api/en-vivo`, etc.). RLS es la puerta; las vistas públicas exponen solo lo necesario.
- **CI/CD**: push a `main` → tests → deploy Worker → migraciones (idempotentes).

## 2. Frontend (páginas y componentes)

| Página | Ruta limpia | Fuente de datos |
|---|---|---|
| Listado de torneos (núcleo) | `/es/tournaments/:juego/:estado/` (+ `/en/…`) | `/api/tournaments` |
| Ficha de torneo | `/torneo?slug=…` (ya existe) | `/api/tournaments/:slug` |
| Partidas/calendario | `/partidos` (existe) | `/api/matches` (nueva) |
| Equipos | `/equipos` (nueva) | `/api/teams` |
| Jugadores | `/jugadores` (existe) | `/api/players` (nueva sobre `players`) |
| Noticias | `/noticias` + `/noticia?id=` (nuevas) | `/api/articles` |
| Búsqueda | `/busqueda?q=` (nueva) | `/api/search` |

Componentes reutilizables (JS vanilla, `assets/js/plataforma.js`): filas de torneo, tabs de
estado (anchors reales), filtros pill, skeleton, empty/error state, paginación, tarjeta de
artículo, chip DEMO. Todos con datos por props (parámetros) y sin acoplarse a páginas concretas.

## 3. Backend (Worker)

- **Nuevas rutas API** (misma estructura que las existentes):
  `GET /api/games`, `GET /api/tournaments`, `GET /api/tournaments/:slug`, `GET /api/matches`,
  `GET /api/teams`, `GET /api/players`, `GET /api/articles`, `GET /api/search`.
- **Caché**: `Cache-Control: public, max-age=60` en listados públicos (misma estrategia que las
  APIs existentes); los Deep Links HTML van sin caché para metas correctas.
- **Validación**: whitelist de parámetros (`estado ∈ {upcoming,ongoing,archive}`, juego contra
  catálogo `games.slug`, `pag ≥ 1`, `q` entre 2 y 64 chars) → 400 en inválidos.
- **Errores**: nunca exponen internals; log en `console` del Worker (observabilidad habilitada).

## 4. Modelo de datos (detalle en DATABASE_SCHEMA.md)

Entidades nuevas: `games`, `tournaments`, `teams`, `matches`, `articles`.
Reutilizadas: `players` (ya existe, con auth0_sub/role/rating), `tournament_teams`
(inscripciones reales = participantes), `tournament_matches` (brackets), `presence`,
`seasons`. `TournamentParticipant` del modelo de la misión = `tournament_teams` existente
(NO se duplica).

## 5. Estrategia de datos (F8, decisión D4)

- Interfaz `EsportsDataProvider` en el Worker (`services` no aplica en Worker; se implementa
  como módulo del propio worker.js con contrato claro):
  - `demoProvider`: lee de `tournaments/matches/…` con `is_demo = true` (seed de la migración).
  - `faceitProvider`: consultas a la Data API v3 de FACEIT (key en secret `FACEIT_API_KEY`)
    para torneos/championships reales; con caché 60 s y degradación controlada.
- La tabla `tournaments` guarda el origen (`source = 'vants' | 'faceit' | 'demo'`) y el
  `external_id` para deduplicar (UNIQUE(source, external_id)).

## 6. Sistema de errores y observabilidad

- Frontend: `LoadingSkeleton` → contenido | `EmptyState` | `ErrorState(reintentar)`.
- Backend: `{ok:false,error:{message}}` legible; rate limit → 429; invalid → 400; not found → 404.
- Logs: `[observability] enabled = true` del Worker (peticiones/errores en dashboard).

## 7. Estrategia de pruebas

- **Unit** (`scripts/test_plataforma.js`): clasificación de estado, orden, filtros, paginación,
  formateo de fechas por locale, validación de query, render de filas (sin DOM real, con
  strings/DOM ligero).
- **Integración**: las funciones de SQL se ejercitan contra Neon en CI si existe
  `DATABASE_URL` (mismo patrón que `test_mm_neon.js`); si no, se omiten con aviso claro.
- **E2E en vivo**: navegador real contra producción tras cada push (flujo F1-F9).

## 8. SEO (F10) y despliegue (F14)

- Metas únicas por página (title/description/canonical/OG), hreflang es/en/x-default en la
  plataforma, sitemap XML regenerado, 404 real.
- Deploy: push a main → CI → verificación en vivo (curl+UA y navegador) según D7. Rollback:
  `git revert <sha> && git push` (documentado en docs/DEPLOYMENT.md).
