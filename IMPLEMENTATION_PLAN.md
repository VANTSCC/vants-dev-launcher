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

### FASE 2 · Definición del producto — EN CURSO
- `product/REQUIREMENTS.md` (usuarios, historias, prioridades MoSCoW).
- `product/USER_FLOWS.md` (flujos críticos).
- `product/ACCEPTANCE_CRITERIA.md` (criterios comprobables).
- `product/FEATURE_MATRIX.md` (obligatorio/importante/opcional × estado real).

### FASE 3 · Arquitectura técnica
- `architecture/SYSTEM_DESIGN.md` — frontend estático + Worker + Neon (adaptación documentada).
- `architecture/DATABASE_SCHEMA.md` — entidades games/tournaments/teams/players/matches/articles.
- `architecture/API_SPEC.md` — contratos REST del Worker.
- `architecture/SECURITY_MODEL.md` — cabeceras, rate limit, validación, secretos.

### FASE 4 · Configuración del proyecto
- Repo existente (Node + Worker + CI). Añadir SOLO scripts verificables:
  `npm test` (suite plataforma) en `package.json` raíz; mantener suites existentes.
- `.env.example` actualizado si se añaden variables.

### FASE 5 · Diseño visual y componentes
- Base ya existente: `strafe.css` v2 + `strafe-shell.js` (T51).
- Completar: filtros por juego/región (pills), paginación, skeleton de carga, empty state,
  error state, cards de artículo/equipo, caja de búsqueda — como funciones/fragmentos
  reutilizables en `assets/js/plataforma.js` (nuevo, independiente de arena.js).

### FASE 6 · Página de torneos (núcleo)
- Rutas estilo referencia adaptadas: `/es/tournaments/:juego/:estado/` (upcoming/ongoing/archive)
  servidas por el Worker (sin archivos duplicados; 1 página + query params).
- Estado y filtros en URL (`?estado=&juego=&region=&pag=`), enlaces accesibles, estados
  carga/vacío/error, sin inventar datos.

### FASE 7 · Backend, base de datos y API
- Migración 28 (`db/migrations/28-plataforma-torneos.sql`): games, tournaments, teams, players
  (reutiliza si ya existe), matches, articles + índices + seed DEMO etiquetado.
- Endpoints Worker: `GET /api/games`, `GET /api/tournaments` (filtros+paginación),
  `GET /api/tournaments/:slug`, `GET /api/matches`, `GET /api/teams`, `GET /api/players`,
  `GET /api/articles`, `GET /api/search`. Validación de parámetros, anti-N+1 (JOINs),
  índices, errores `{ok:false}` sin filtrar internals.

### FASE 8 · Datos de esports e integraciones
- Interfaz `EsportsDataProvider` (contrato JS) + adaptador `demo` (fixtures etiquetadas) +
  adaptador `faceit` (usa FACEIT_API_KEY existente) para torneos/championships reales.
- Documentar qué es real y qué demo. Sin scraping de terceros.

### FASE 9 · Páginas complementarias
- `equipos.html` (nuevo), `noticias.html` + ficha de artículo, `busqueda.html`,
  ficha de torneo reforzada (torneo.html ya existe), calendario (partidos.html ya existe).
- Todos los estados: carga/vacío/error/contenido.

### FASE 10 · SEO e internacionalización
- Metas únicas por página + canonical + OG. `sitemap.xml` regenerado con rutas nuevas.
- hreflang es/en + `x-default`; capa i18n (`assets/js/i18n.js`, diccionario es/en, ?lang= o
  ruta /en/ por cabecera Worker). Fechas/horas por locale.
- 404 correcta (ya existe, mantener).

### FASE 11 · Accesibilidad
- Semántica, foco visible, navegación por teclado en tabs/filtros/búsqueda, aria-labels,
  contraste (lima #D2DC59 sobre #0E0E10 = alto), `prefers-reduced-motion`.
- Auditoría con navegador + correcciones. Sin declarar WCAG completo.

### FASE 12 · Seguridad
- Validación server-side en endpoints nuevos, rate limit de lectura, cabeceras (revisar las
  existentes del Worker), sin secretos en repo, CORS mínimo, revisión de dependencias.

### FASE 13 · Pruebas automatizadas
- `scripts/test_plataforma.js`: unit (clasificación de estado, filtros, orden, paginación,
  formateo de fechas, validación de query) + integración (SQL contra Neon si hay
  DATABASE_URL; skip suave si no). CI ya ejecuta suites node.
- E2E con navegador contra producción tras desplegar (rutas críticas).

### FASE 14 · Despliegue
- Push a `main` → CI "Cloudflare · deploy del Worker" → verificar en producción con curl+UA
  y navegador: rutas nuevas, API, cabeceras. Rollback: revert commit + push (documentado).

### FASE 15 · Documentación y entrega final
- README actualizado, `docs/TESTING.md`, `docs/DEPLOYMENT.md`, `docs/TROUBLESHOOTING.md`,
  PROJECT_STATUS.md final + informe final en la conversación.

### FASE 16 · Auditoría final y corrección autónoma
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
