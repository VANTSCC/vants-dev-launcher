# PROJECT_STATUS — Plataforma VANTS (estilo Strafe)

> Archivo vivo de estado. Última actualización: 2026-10-20 (noche) · **Auditoría externa completa
> (CI + repo, 212 commits + 10 workflows + suites ejecutadas) con fixes aplicados en la rama
> `audit/fixes-2026-10-20` — ver FASE 17 al pie.** Sesiones previas: T53+b/c/d/e
> (`69dc4d0`→`d539d9f`) y pivote fullstack + MYKD (`8b0e247`→`a1c6d10`, 11 commits que esta
> tabla no cubre — el plan vigente ahora es la FASE 17 de IMPLEMENTATION_PLAN.md).

## Misión

"Analizar, construir y terminar una plataforma de esports inspirada en Strafe"
(`strafe.com/es/tournaments/csgo/upcoming/` como referencia), ejecutada en 16 fases con
modo autónomo continuo, sin presentar datos ficticios como reales y sin copiar marcas.

## Resultado: COMPLETADA + T53 cierra los gaps que quedaban abiertos

| # | Fase | Estado | Evidencia |
|---|------|--------|-----------|
| 1 | Investigación web original | ✅ | `research/` (5 docs con VERIFICADO/INFERIDO/DESCONOCIDO) + capturas `download/qa-strafe3/` |
| 2 | Definición del producto | ✅ | `product/` (REQUIREMENTS, USER_FLOWS F1-F9, ACCEPTANCE AC1-AC41, FEATURE_MATRIX) |
| 3 | Arquitectura técnica | ✅ | `architecture/` (SYSTEM_DESIGN, DATABASE_SCHEMA, API_SPEC, SECURITY_MODEL) |
| 4 | Configuración del proyecto | ✅ | job CI `plataforma` + scripts npm `test`/`test:e2e`/`sync:faceit`/`audit:enlaces` reales |
| 5 | Diseño visual y componentes | ✅ | plataforma.css/js + i18n.js; estados skeleton/empty/error reales |
| 6 | Página de torneos (núcleo) | ✅ | `/es|en/tournaments/:juego/:estado/` con SEO dinámico; tabs anchors URL compartible |
| 7 | Backend, BD y API | ✅✅ | migra 28 pt_* + **migra 29 pt_players (T53)**; API completa con `GET /api/teams/:slug` y `/api/players/:slug` que faltaban |
| 8 | Datos e integraciones | ✅✅ | **T53: `EsportsDataProvider` real** (`scripts/proveedor-datos.mjs`) con adaptadores demo+FACEIT y sync diario CI (`faceit-sync.yml`) — antes solo estaba documentado |
| 9 | Páginas complementarias | ✅✅ | equipos, noticias+ficha, búsqueda, torneo `?slug=` + **T53: ficha de equipo, ficha de jugador, calendario, resultados** que faltaban |
| 10 | SEO e i18n | ✅ | canonical, hreflang es/en/x-default, sitemap 39 urls, i18n es/en |
| 11 | Accesibilidad | ✅ | foco visible, teclado, aria-labels, alt, reduced-motion |
| 12 | Seguridad | ✅ | validación server-side (`validarSlug`), RLS owner, whitelist sin PII (testeada), rate limit |
| 13 | Pruebas automatizadas | ✅✅ | **T53: Playwright real** (tests/e2e, desktop+móvil contra producción) + 90 asserts plataforma + 241 regresión |
| 14 | Despliegue | ✅ | CI verde; producción verificada por curl+navegador; rollback documentado |
| 15 | Documentación y entrega | ✅ | README, TESTING, DEPLOYMENT, TROUBLESHOOTING, API_SPEC actualizada, este archivo |
| 16 | Auditoría final y corrección | ✅ | crawler **723 enlaces/0 rotos** (32 páginas); QA local 10/10; **bucle en producción: 3 bugs reales corregidos** (desenvoltura {items}, Invalid Date, stripSensible destruía fechas a {}) con regresión permanente y capturas del CI con datos vivos |

## Qué cerró exactamente la T53 ("FALTAN FASES")

1. **F7**: endpoints `GET /api/teams/:slug` (ficha+plantilla+partidas) y `GET /api/players/:slug`
   que la directiva exigía y no existían. Migra `29-pt-players.sql` aplicada vía CI.
2. **F8**: la interfaz `EsportsDataProvider` con adaptador FACEIT REAL (API oficial v4,
   sin scraping) + sync programado — antes solo había "documentación de intención".
3. **F9**: las 4 páginas que faltaban de la directiva: ficha de equipo, ficha de jugador,
   calendario y resultados (con pestañas cruzadas y chips DEMO).

## Limitaciones documentadas (sin ocultar)

1. **API server-side del Worker**: el WAF del endpoint de Neon Functions devuelve 403 al
   egreso de Cloudflare Workers (bloqueo por ASN, confirmado con diagnóstico). **Impacto:
   ninguno para los usuarios** — el navegador lee `pt_*` directo del proxy `vantsdata`
   (plan C, patrón de la casa, verificado en producción con navegadores reales en T50/T51).
   La API `/api/…` mantiene el contrato para clientes no bloqueados (y ahora también sirve
   fichas `:slug` para cuando se habilite el egreso). Alternativa futura documentada en
   TROUBLESHOOTING (función propia o regla WAF del dueño en Neon).
2. **Verificación con datos reales en la sandbox**: la IP de esta sandbox está también
   bloqueada por el mismo WAF, por lo que el render con los torneos de Neon no pudo
   capturarse desde aquí (el QA usó fallbacks y mocks honestos). Cualquier navegador
   residencial mostrará los datos; verificado el pipeline completo por unidad + CI + E2E.
3. **FACEIT real depende de `FACEIT_API_KEY` y de que `neon-migrate` aplique 29**: el sync
   es honesto — sin key sale 0 con aviso; con key inválida sale 3 (rojo).

## Commits de la misión

- `343256e` T52: misión F1-F13 completa (research→pruebas) + despliegue
- `4761576` T52b: fix migración 28 (NULL extra) + docs finales + auditoría enlaces
- `13c269c` T52c: hreflang reescrito (sin duplicados)
- `aa8a7f3` T52d: diagnóstico del status del proxy
- `5a05a3b` T52e: UA de navegador al proxy
- `e23ab2a` T52f: plan C (lectura directa del proxy desde el navegador) + ficha `?slug=`
- **T53** (esta sesión): fases que faltaban — migra 29 pt_players, `/api/teams|players/:slug`,
  4 páginas (ficha equipo/jugador, calendario, resultados), `EsportsDataProvider` + adaptador
  FACEIT real + `faceit-sync.yml`, Playwright E2E + job CI, sitemap 39 urls, espejo ×3.

## Cómo continuar (dueño)

1. Abrir https://vants.vants.workers.dev/es/tournaments/valorant/upcoming/ (torneos DEMO
   etiquetados), `/calendario.html`, `/resultados.html`, `/equipos.html` → ficha,
   `/jugador.html?slug=demo-jugador-alex`.
2. Para torneos REALES de FACEIT: ya está todo cableado — con `FACEIT_API_KEY` en secrets,
   ejecutar el workflow **"FACEIT · sync de torneos reales a pt_*"** (o esperar al cron
   diario 05:17 UTC). Torneos/equipos/partidas entrará con `source='faceit'`, sin chip DEMO.
3. Opcional: regla de WAF en Neon para permitir el egreso de Cloudflare y habilitar la API
   server-side completa.


---

## FASE 17 · Consolidación fullstack — estado tras la auditoría nocturna (20-oct)

**Alcance auditado**: 212 commits (13→20-oct), 10 workflows YAML (validados), Worker (1.862
líneas), 29 migraciones, MCP, scraper, Docker ×2, webapp Astro (astro check + build), 8 suites
de tests ejecutadas de verdad, crawler de enlaces, espejo ×3 (diff completo), forense de git.

**Notas por área** (informes completos en la sesión de auditoría):
- CI/CD 6.5→~8.5 tras fixes: 2 triggers de deploy a prod estaban CORRUPTOS (`branches: ain]`)
  y solo corrían a mano; ya corren por push a main con cola `deploy-prod`.
- Seguridad: 0 secretos filtrados (historia incluida). Críticos corregidos: PII en
  `estado-db.json` (emails) y `AUTH0_SPA_CLIENT_ID` inexistente (verificación de email rota).
- Calidad: 8 suites verdes — **347 asserts reales** (plataforma 90, agente 61, mm_fase4 54,
  llm 30, sandbox 60, vantsbot 36, mm_neon 16) + **804 enlaces/0 rotos** + astro check 0
  errores + build byte-idéntico. README/TESTING actualizados con los números reales.
- Espejo ×3: drift real detectado y corregido (`menu-preview.js` en producción pisaba el
  preview de la isla React) + check permanente en CI (`fullstack.yml`).
- Gobierno: D11–D15 registradas; "Content Island" documentado en `docs/CONTENT-ISLANDS.md`;
  pendientes de dueño en la checklist FASE 17 (D14 origen canónico, firma Electron, CSP).
