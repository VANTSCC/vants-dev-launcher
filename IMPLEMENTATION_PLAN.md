# IMPLEMENTATION_PLAN — Plataforma de torneos VANTS (misión 16 fases)

> Plan vivo. Cada fase se marca con estado real y evidencia. Nada se da por hecho sin prueba.

## Reglas de ejecución

- Trabajar en incrementos verificables: implementar → comprobar → corregir → avanzar.
- Espejo ×3 obligatorio para cualquier archivo de frontend (raíz / `public/` / `vants-server/public/`).
- Convenciones API de la casa: JSON siempre; éxito `{ok:true,data}`; error `{ok:false,error:{message}}`.
- Datos de demostración SIEMPRE etiquetados (`is_demo = true` y texto "DEMO" visible).
- Sin marcas/imágenes de terceros. Identidad visual propia (VANTS).
- Push a `main` = despliegue automático a producción (CI existente) — se usa para verificar.

## Fases

### FASE 1 · Investigación de la web original — ✅ COMPLETADA (T52)
- Navegador real sobre la URL de referencia (escritorio + móvil), capturas, estilos computados,
  red, SEO, modelo de datos público.
- Evidencia: `research/REFERENCE_ANALYSIS.md`, `PAGE_STRUCTURE.md`, `NETWORK_FINDINGS.md`,
  `SEO_FINDINGS.md`, `REFERENCE_SCREENSHOTS.md` + `/home/z/my-project/download/qa-strafe3/`.

### FASE 2 · Definición del producto — ✅ COMPLETADA (T52, commits 343256e)
- `product/REQUIREMENTS.md` (usuarios, historias, prioridades MoSCoW).
- `product/USER_FLOWS.md` (flujos críticos).
- `product/ACCEPTANCE_CRITERIA.md` (criterios comprobables).
- `product/FEATURE_MATRIX.md` (obligatorio/importante/opcional × estado real).

### FASE 3 · Arquitectura técnica — ✅ COMPLETADA (T52)
- `architecture/SYSTEM_DESIGN.md` — frontend estático + Worker + Neon (adaptación documentada).
- `architecture/DATABASE_SCHEMA.md` — entidades games/tournaments/teams/players/matches/articles.
- `architecture/API_SPEC.md` — contratos REST del Worker.
- `architecture/SECURITY_MODEL.md` — cabeceras, rate limit, validación, secretos.

### FASE 4 · Configuración del proyecto — ✅ COMPLETADA (T52)
- Repo existente (Node + Worker + CI). Añadir SOLO scripts verificables:
  `npm test` (suite plataforma) en `package.json` raíz; mantener suites existentes.
- `.env.example` actualizado si se añaden variables.

### FASE 5 · Diseño visual y componentes — ✅ COMPLETADA (T52; reskin MYKD posterior registrado en D2/D12)
- Base ya existente: `strafe.css` v2 + `strafe-shell.js` (T51).
- Completar: filtros por juego/región (pills), paginación, skeleton de carga, empty state,
  error state, cards de artículo/equipo, caja de búsqueda — como funciones/fragmentos
  reutilizables en `assets/js/plataforma.js` (nuevo, independiente de arena.js).

### FASE 6 · Página de torneos (núcleo) — ✅ COMPLETADA (T52 + T53)
- Rutas estilo referencia adaptadas: `/es/tournaments/:juego/:estado/` (upcoming/ongoing/archive)
  servidas por el Worker (sin archivos duplicados; 1 página + query params).
- Estado y filtros en URL (`?estado=&juego=&region=&pag=`), enlaces accesibles, estados
  carga/vacío/error, sin inventar datos.

### FASE 7 · Backend, base de datos y API — ✅ COMPLETADA (T52 + T53 cierra los :slug)
- Migración 28 (`db/migrations/28-plataforma-torneos.sql`): games, torneos, teams, matches,
  articles + índices + seed DEMO etiquetado.
- **T53**: migración 29 (`29-pt-players.sql`) — pt_players con plantillas demo de 20 jugadores.
- Endpoints Worker: `GET /api/games`, `GET /api/tournaments` (filtros+paginación),
  `GET /api/tournaments/:slug`, `GET /api/matches`, `GET /api/teams` + **`/api/teams/:slug`
  (T53: ficha+plantilla+partidas)**, `GET /api/players` + **`/api/players/:slug` (T53,
  lee pt_players sin PII)**, `GET /api/articles`, `GET /api/search`. Validación de
  parámetros, anti-N+1 (Promise.all en fichas), índices, errores `{ok:false}` sin internals.

### FASE 8 · Datos de esports e integraciones — ✅ COMPLETADA (T53: código real, no solo doc)
- **`scripts/proveedor-datos.mjs` (T53)**: interfaz `EsportsDataProvider` documentada en el
  propio módulo + adaptador `demo` (fixtures etiquetadas) + adaptador `faceit`
  (Data API v4 oficial con FACEIT_API_KEY — SIN scraping). Mapeos puros testeados
  (estados, juegos, epoch→ISO, facciones→equipos).
- **`scripts/sincronizar-faceit.mjs` (T53)**: UPSERT idempotente pt_* con is_demo=false;
  salidas honestas (sin key→0, sin DATABASE_URL→2, errores→3).
- **`.github/workflows/faceit-sync.yml` (T53)**: cron diario 05:17 UTC + manual.
- Documentar qué es real y qué demo. Sin scraping de terceros.

### FASE 9 · Páginas complementarias — ✅ COMPLETADA (T52 + T53 cierra las 4 que faltaban)
- `equipos.html` (nuevo), `noticias.html` + ficha de artículo, `busqueda.html`,
  ficha de torneo reforzada (torneo.html ya existe), calendario (partidos.html ya existe).
- **T53**: `equipo-ficha.html` (?slug= con plantilla+partidas), `jugador.html` (?slug=),
  `calendario.html` (upcoming + live primero), `resultados.html` (finished) — con pestañas
  cruzadas, nav "Calendario" y enlaces equipos→ficha→jugador→equipo.
- Todos los estados: carga/vacío/error/contenido.

### FASE 10 · SEO e internacionalización — ✅ COMPLETADA (T52)
- Metas únicas por página + canonical + OG. `sitemap.xml` regenerado con rutas nuevas.
- hreflang es/en + `x-default`; capa i18n (`assets/js/i18n.js`, diccionario es/en, ?lang= o
  ruta /en/ por cabecera Worker). Fechas/horas por locale.
- 404 correcta (ya existe, mantener).

### FASE 11 · Accesibilidad — ✅ COMPLETADA (T52)
- Semántica, foco visible, navegación por teclado en tabs/filtros/búsqueda, aria-labels,
  contraste (acento sobre fondo oscuro = alto; hoy el rojo #ff0d2e de MYKD), `prefers-reduced-motion`.
- Auditoría con navegador + correcciones. Sin declarar WCAG completo.

### FASE 12 · Seguridad — ✅ COMPLETADA (T52 + endurecimiento del 20-oct, D15)
- Validación server-side en endpoints nuevos, rate limit de lectura, cabeceras (revisar las
  existentes del Worker), sin secretos en repo, CORS mínimo, revisión de dependencias.

### FASE 13 · Pruebas automatizadas — ✅ COMPLETADA (T52 + T53 añade Playwright real)
- `scripts/test_plataforma.js`: unit (clasificación de estado, filtros, orden, paginación,
  fechas, validación de query, fichas, filaMatch XSS, proveedores demo/FACEIT) +
  integración (SQL contra Neon si hay red; skip suave si no). 90 asserts verdes.
- **T53: `tests/e2e/plataforma.spec.js` + `playwright.config.js`** — Playwright real
  (desktop 1280 + móvil 390) contra producción: rutas, fichas, calendario, búsqueda,
  i18n, overflow móvil y estados honestos. Job `e2e` en tests.yml.
- E2E con navegador contra producción tras desplegar (rutas críticas).

### FASE 14 · Despliegue — ✅ COMPLETADA (T52, en producción)
- Push a `main` → CI "Cloudflare · deploy del Worker" → verificar en producción con curl+UA
  y navegador: rutas nuevas, API, cabeceras. Rollback: revert commit + push (documentado).

### FASE 15 · Documentación y entrega final — ✅ COMPLETADA (T52/T53 + puesta al día del 20-oct)
- README actualizado, `docs/TESTING.md`, `docs/DEPLOYMENT.md`, `docs/TROUBLESHOOTING.md`,
  PROJECT_STATUS.md final + informe final en la conversación.

### FASE 16 · Auditoría final y corrección autónoma — ✅ COMPLETADA (T53, con bucle de corrección real)
- Crawler de enlaces internos (local y en vivo), botones sin acción, rutas, datos demo
  etiquetados, duplicados, consola, responsive 375/768/1440, metadatos, doc↔código.
- Bucle de corrección por severidad hasta criterios de finalización.

## Dependencias y riesgos

| Riesgo | Mitigación |
|---|---|
| Neon DATABASE_URL no disponible en local | Tests unitarios locales; integración en CI (ya tiene el secret) |
| API FACEIT cuota/límites | Adaptador con caché y fallback demo etiquetado |
| Espejo ×3 divergente | Script de verificación de espejo antes de cada push |
| CI rate limit de API GitHub | Verificación en vivo del workers.dev (método T50/T51) |
| Datos reales inexistentes (torneos propios) | Seed demo etiquetado; FACEIT como fuente real documentada |

## FASE 17 · Consolidación fullstack (post-plan original) — EN CURSO
Añadida en la revisión de gobierno del 20-oct: el plan original se cerró en T53 pero el HEAD siguió
avanzando (pivote fullstack, reskin MYKD, hotfixes). Esta fase ordena lo que quedó suelto:

- [x] Trigger `branches: [main]` en los 4 workflows que deployan (2 corruptos → nunca corrían)
- [x] Concurrency compartida `deploy-prod` (migraciones + funciones + Worker en cola)
- [x] faceit-xp con timeout + connect-timeout (144 runs/día bajo control)
- [x] SHA-pinning de actions + permissions mínimos
- [x] `estado-db.json` sin PII (email fuera; rol `owner` como identificador)
- [x] Ticket de verificación Auth0 arreglado (`AUTH0_SPA_CLIENT_ID` = secret opcional)
- [x] `/api/teams` = pt_teams (plataforma); legado en `/api/teams-live`
- [x] Espejo ×3 sincronizado + `build-webapp.mjs --check` en CI
- [x] Guarda anti-bucle fail-safe + agent-service fail-closed
- [x] Huérfanos autogenerados fuera de main; `.gitignore` actualizado
- [ ] Decidir origen canónico único (D14) y activar dominio propio
- [ ] Emitir `/api/discord/notify` desde `inscribir` (eliminar el endpoint browser-facing)
- [ ] CSP sin `unsafe-inline` (refactor de scripts inline)
- [ ] Firma de código del HUB Windows (requiere certificado — coste del dueño)
- [ ] Activar Dependabot (`.github/dependabot.yml` nunca existió)
