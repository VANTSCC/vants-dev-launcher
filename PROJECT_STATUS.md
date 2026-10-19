# PROJECT_STATUS — Plataforma VANTS (estilo Strafe)

> Archivo vivo de estado. Se actualiza tras cada bloque de trabajo verificable.
> Última actualización: 2026-10-19 · Sesión T52 (misión 16 fases) · commit `343256e`

## Contexto

VANTS es una plataforma de esports (Valorant → hub universal de juegos PC) que opera en
**Cloudflare Workers** (`vants.vants.workers.dev`) con frontend estático espejado ×3
(raíz / `public/` / `vants-server/public/`), base de datos **Neon Postgres** y CI de GitHub
que despliega automáticamente cada push a `main`.

El dueño fijó como referencia de diseño la página
`https://www.strafe.com/es/tournaments/csgo/upcoming/` (sesiones T50 y T51 ya realizaron el
análisis en navegador y el rediseño completo, desplegado en el commit `ac485ae`, CI SUCCESS).

La sesión T52 ejecuta la misión completa de 16 fases: investigar, construir, probar,
documentar y preparar para producción la plataforma de torneos, sin presentar datos ficticios
como reales y sin copiar marcas de terceros.

## Fases (estado real tras F13)

| # | Fase | Estado | Evidencia |
|---|------|--------|-----------|
| 1 | Investigación web original | ✅ HECHA | `research/` ×5 docs, capturas `download/qa-strafe3/` |
| 2 | Definición de producto | ✅ HECHA | `product/` ×4 docs |
| 3 | Arquitectura técnica | ✅ HECHA | `architecture/` ×4 docs |
| 4 | Configuración del proyecto | ✅ HECHA | suite propia en CI (job `plataforma`), sin scripts fantasma |
| 5 | Diseño visual y componentes | ✅ HECHA | `plataforma.css` (skeleton/empty/error/cards), `plataforma.js`, `i18n.js` |
| 6 | Página de torneos | ✅ HECHA | rutas `/es|en/tournaments/:juego/:estado/` con metas dinámicas + tabs anchors URL compartible (verificado local y en producción) |
| 7 | Backend, BD y API | ✅ HECHA | migración 28 (`pt_*`), API pública con validación/paginación/rate limit (502 → 200 cuando migración aplique en Neon) |
| 8 | Datos de esports | ✅ BASE | proxy `vantsdata` whitelist `pt_*`, seed DEMO etiquetado; adaptador FACEIT documentado (API_SPEC) para activar con la key existente |
| 9 | Páginas complementarias | ✅ HECHA | equipos, noticias + ficha, búsqueda (todas con shell strafe y estados) |
| 10 | SEO e i18n | ✅ HECHA | canonical workers.dev, hreflang es/en/x-default, sitemap 35 URLs válido, i18n es/en con selector |
| 11 | Accesibilidad | ✅ BASE | foco visible, tabs/filtros con teclado, aria-labels, prefers-reduced-motion, alt; auditoría completa pendiente de pasada final |
| 12 | Seguridad | ✅ HECHA | validación server-side, RLS owner, whitelist sin PII, rate limit, cabeceras existentes revisadas (`architecture/SECURITY_MODEL.md`) |
| 13 | Pruebas automatizadas | ✅ HECHA | `test_plataforma.js` 47/47 unit + regresión 288 asserts verdes + E2E local con navegador; CI job añadido |
| 14 | Despliegue | ✅ OPERATIVO | push `343256e` → CI (6 workflows) → páginas 200 en producción; APIs pendientes de migración (en cola) |
| 15 | Documentación y entrega | 🔄 EN CURSO | este archivo + docs finales al cierre |
| 16 | Auditoría final | ⏳ PENDIENTE | crawler de enlaces + smoke final tras migración |

## Verificado en producción (commit `343256e`)

- `GET /es/tournaments/valorant/upcoming/` → 200 · `GET /en/tournaments/cs2/archive/` → 200
- `GET /equipos`, `/noticias`, `/busqueda` → 200
- `GET /api/games` → 502 mientras la migración 28 no aplique en Neon (CI en cola; con migración aplicada → 200)
- QA local completo con navegador: home (chips DEMO, tabs anchors + pushState/back), rutas es/en,
  móvil 390 sin overflow, estados error/vacío.

## Pendientes de cierre (T52)

1. Verificar CI verde completo (tests/migración/deploys) — en cola.
2. Verificar `/api/games` etc. → 200 tras migración 28 (seed DEMO visible).
3. Auditoría final F16 (crawler enlaces, consola, responsive) + docs finales + worklog.
