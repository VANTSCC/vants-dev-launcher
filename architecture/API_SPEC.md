# API_SPEC — Contratos de la API pública de torneos

Base: `https://vants.vants.workers.dev` · Autenticación: ninguna para lectura pública.
Formato: JSON siempre. Éxito `{ok:true, data:…}`. Error `{ok:false, error:{message}}` (400/404/429/500).
Caché: `Cache-Control: public, max-age=60` en GET de listados. Rate limit: bucket de lectura
general (existentes LIMIT_*; 429 al exceder).

Convención de parámetros validados server-side (400 si inválido):
`estado ∈ upcoming|ongoing|archive|finished` (según recurso) · `juego` = slug de `games`
· `pag ≥ 1` · `porPagina ≤ 50` · `region` texto 2-8 · `q` 2-64 chars.

## GET /api/games
```json
{ "ok": true, "data": [ { "slug": "valorant", "nombre": "VALORANT", "corto": "VALORANT",
  "logo_url": null, "color": "#FF4655", "activo": true } ] }
```
Solo juegos `activo=true`, ordenados por `orden`.

## GET /api/tournaments?estado=upcoming&juego=valorant&region=EU&pag=1&porPagina=12
- `estado` default `upcoming`; `juego`/`region` opcionales; `pag` default 1; `porPagina` default 12 (máx 50).
- Orden: `upcoming/ongoing` → `starts_at ASC`; `archive/finished` → `starts_at DESC`.
- Respuesta:
```json
{ "ok": true, "data": { "pag": 1, "porPagina": 12, "total": 4, "items": [ {
  "slug": "demo-copa-comunidad-s4", "nombre": "DEMO · Copa Comunidad S4",
  "game": { "slug": "valorant", "nombre": "VALORANT" },
  "estado": "upcoming", "major": false, "region": "LATAM",
  "prize": { "value": 50000, "currency": "USD" },
  "starts_at": "2026-11-08T18:00:00Z", "ends_at": "2026-11-12T23:00:00Z",
  "logo_url": null, "equipos": 6, "is_demo": true, "source": "demo" } ] } }
```

## GET /api/tournaments/:slug
- 200 con la ficha completa (incluye `formato`, `reglas`, `max_teams`, `fee`,
  `participantes` desde `tournament_teams` confirmados).
- 404 `{ok:false,error:{message:"Torneo no encontrado"}}` si slug inexistente.

## GET /api/matches?estado=live&juego=valorant&pag=1
- `estado ∈ live|upcoming|finished` (default `upcoming`).
- Orden: `live` → `empieza_at DESC`; `upcoming` → ASC; `finished` → DESC.
- Items: `{ slug?, game, equipos:{a,b}, score:{a,b}|null, estado, empieza_at, best_of, is_demo }`.

## GET /api/teams?juego=valorant&pag=1
- Items: `{ slug, nombre, tag, game, region, logo_url, is_demo }`.

## GET /api/teams/:slug (T53 · F7/F9)
- Ficha completa: equipo + `plantilla[]` (pt_players por team_slug) + `partidas[]`
  (pt_matches donde el equipo es local o visitante, dedupe por external_id, ordenadas
  por fecha desc).
- Contrato: `{ slug, nombre, tag, game:{slug,nombre}, region, logo_url, source, is_demo,
  plantilla:[{slug,nombre,game,team_slug,rol,pais,source,is_demo}], partidas:[contrato match] }`.
- 404 `{ok:false}` si el slug no existe; 400 si el slug no es válido (`validarSlug`).

## GET /api/players?pag=1
- Sobre `players` existente (solo columnas públicas sin PII):
  `{ id, nombre/display, game?, rating, tipo, role }` — SIN email ni auth0_sub.

## GET /api/players/:slug (T53 · F7/F9)
- Ficha de jugador de PLATAFORMA (tabla `pt_players`, migra 29): `{ slug, nombre, game,
  team_slug, rol, pais, bio, source, is_demo, equipo:{...}|null }`.
- NUNCA expone email/auth/contacto (proyección `jugadorPublicoPt`, testeada).
- La lista `/api/players` (sin :slug) sigue leyendo perfiles VANTS — contratos distintos
  a propósito: pt_players = catálogo público de la plataforma; players = cuentas reales.

## GET /api/articles?pag=1&juego=…
- `estado='published'` únicamente; orden `publicado_at DESC`.
- Items: `{ slug, titulo, resumen, autor, game, publicado_at, is_demo }`.

## GET /api/articles/:slug
- 200 ficha completa (`cuerpo` incluido) / 404 consistente.

## GET /api/search?q=copa
- `q` requerido (2-64). Búsqueda `ILIKE %q%` (y tsvector cuando aplique) sobre
  `tournaments.nombre`, `teams.nombre`, `articles.titulo` (+`players` público).
```json
{ "ok": true, "data": { "q": "copa", "torneos": [ { "slug": "…", "nombre": "…" } ],
  "equipos": [], "jugadores": [], "articulos": [] } }
```

## GET /api/discord/events (existente, sin cambios)
- POST con firma Ed25519 del Developer Portal; sin firma → 401 (verificado en producción).

## Códigos

| Caso | HTTP | Cuerpo |
|---|---|---|
| Éxito | 200 | `{ok:true,data}` |
| Parámetro inválido | 400 | `{ok:false,error:{message:"…"}}` |
| Recurso no encontrado | 404 | `{ok:false,error:{message:"…"}}` |
| Rate limit | 429 | texto corto (patrón existente) |
| Error interno | 500 | `{ok:false,error:{message:"Error interno"}}` (sin internals) |

## Limitación operativa conocida (documentada, T52)

El WAF del endpoint de Neon Functions (`*.compute.c-6.us-east-2.aws.neon.tech`) devuelve 403
al egreso de Cloudflare Workers (bloqueo por ASN — verificado con diagnóstico en producción:
el mismo endpoint responde JSON correcto desde navegadores residenciales). Por eso:

- La LECTURA pública del frontend se hace DIRECTO del proxy `vantsdata` desde el navegador
  (patrón de la casa, CORS abierto, `plataforma.js` traduce los endpoints a queries `pt_*`).
- Esta API del Worker sigue siendo el contrato server-side (validación completa, paginación,
  proyecciones sin PII) y funciona para cualquier cliente cuyo egreso no esté en la lista de
  bloqueo del WAF de Neon. La UI usa `/api/…` solo como fallback.

## No-objetivos

- Sin escrituras públicas nuevas (inscripción/gestión siguen en `/api/torneos/inscribir` y
  `/api/torneos/gestionar` con sesión Auth0 existente).
- Sin webhooks nuevos (FACEIT ya tiene su pipeline `faceit_webhook_events`).
