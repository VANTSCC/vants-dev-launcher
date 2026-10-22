# DECISIONS — Registro de decisiones técnicas

Formato: D# · Decisión · Motivo · Consecuencias · Fecha.

## D1 · No reescribir a Next.js: mantener Worker + frontend estático + Neon
- **Decisión**: la plataforma de torneos se construye sobre el stack existente
  (Cloudflare Worker con `ASSETS`, HTML/CSS/JS vanilla espejado ×3, Neon Postgres, CI GitHub).
- **Motivo**: el entorno ya está en producción con CI verde y la directiva de la misión exige
  "mantener compatibilidad con el entorno existente y evitar reescrituras innecesarias". Un
  cambio a Next.js sería una reescritura total sin beneficio funcional para el dueño.
- **Consecuencias**: la referencia usa Next.js SSG; VANTS replica el COMPORTAMIENTO (rutas por
  juego/estado, datos por JSON, metas por página) con el Worker. Renuncia: no hay RSC/ISR.
- Fecha: 2026-10-19.

## D2 · El diseño replica patrones, no identidad de terceros (identidad propia: MYKD)
- **Decisión**: se replican patrones de UX de la referencia (doble nav, tabla densa, tabs de
  estado, tokens oscuros + acento) con marca propia de VANTS (logo vmark, tipografía propia).
  La identidad vigente es **MYKD**: rojo #ff0d2e sobre oscuro, menús con submenú y reskin
  rojo/negro del skin (`33fafc2`), con intro 3D propia (IntroJett). El lima #D2DC59 de T51
  quedó retirado del skin (persiste solo en assets históricos). Sin logos, imágenes ni
  textos de terceros.
- **Motivo**: requisito explícito de la misión (no copiar marcas/contenido de terceros). La
  identidad propia evolucionó en 36 h (T51 lima → arena básica → MYKD rojo/negro, aprobada
  en producción); el acento actual queda registrado también en D12.
- **Consecuencias**: ninguna restricción legal conocida; identidad consistente con el skin
  actual. Todo cambio futuro de identidad se registra aquí (o en una D nueva) para no
  perder la traza.
- Fecha: 2026-10-19 (formaliza lo hecho en T51); actualizada 2026-10-20 (identidad MYKD vigente).
- Actualización (2026-10-20, `cd7f9f1`): la intro 3D propia (IntroJett) y su dock (`heroDock`)
  quedaron FUERA del home; el componente permanece en `webapp/src/components/IntroJett.vue`
  sin montar. La identidad MYKD (rojo #ff0d2e sobre oscuro) no cambia.

## D3 · Rutas de torneos estilo referencia servidas por el Worker
- **Decisión**: `/es/tournaments/:juego/:estado/` (y `/en/…`) se sirven desde el Worker
  (mismo HTML de listado + render por query), con redirects limpios de `.html`.
- **Motivo**: replicar la convención de URLs de la referencia sin duplicar archivos en el
  espejo ×3; el Worker ya controla todas las peticiones (`run_worker_first: true`).
- **Consecuencias**: una sola página fuente (`torneos` / index) con parámetros; sitemap
  apuntando a las rutas limpias.
- Fecha: 2026-10-19.

## D4 · Datos: demo etiquetado + FACEIT como fuente real opcional
- **Decisión**: migración 28 con seed DEMO (`is_demo = true`, visible en UI como "DEMO").
  Interfaz `EsportsDataProvider` con adaptadores `demo` y `faceit` (FACEIT_API_KEY ya existe).
- **Motivo**: prohibido presentar datos inventados como reales; FACEIT es la integración ya
  autorizada por el dueño (key en secrets y plan pago suscrito).
- **Consecuencias**: mientras no haya torneos propios reales, la UI marca "DEMO"; el adaptador
  FACEIT alimenta partidos/torneos reales cuando se active.
- Fecha: 2026-10-19.

## D5 · i18n es/en con diccionario JS + rutas con prefijo
- **Decisión**: `assets/js/i18n.js` con diccionarios es/en, locale por `?lang=` persistido en
  localStorage, y prefijos de ruta `/es/`/`/en/` para las páginas de torneos (hreflang).
- **Motivo**: la misión exige i18n preparada; el prefijo de ruta replica la referencia y permite
  hreflang correcto sin regenerar páginas por idioma.
- **Consecuencias**: las páginas heredadas (arena) siguen en ES; el EN completo aplica primero
  a la plataforma de torneos (núcleo de la misión).
- Fecha: 2026-10-19.

## D6 · Sin redes de analítica/publicidad de terceros
- **Decisión**: no se incorporan GA/Ads/NitroPay/reCAPTCHA (presentes en la referencia).
- **Motivo**: privacidad, coste 0 y simplicidad; el dueño no las pidió.
- **Consecuencias**: sin medición de audiencia externa; logs del Worker bastan.
- Fecha: 2026-10-19.

## D7 · Verificación de despliegue "en vivo" en vez de API de Actions cuando haya rate limit
- **Decisión**: la prueba real del despliegue es `curl`/navegador contra
  `https://vants.vants.workers.dev` (contenido nuevo + códigos HTTP), no el dashboard.
- **Motivo**: la API de GitHub ya dio rate limit por IP compartida (T50); la web viva es la
  evidencia definitiva del deploy.
- **Consecuencias**: cada fase que termine en push incluye smoke en producción.
- Fecha: 2026-10-19 (formaliza método T50/T51).

## D8 · Fichas de equipo/jugador por query `?slug=` sobre páginas propias (patrón de la casa)
- **Decisión**: las fichas nuevas (T53) viven en páginas estáticas + `?slug=` leído por
  `plataforma.js` (`/equipo-ficha.html?slug=…`, `/jugador.html?slug=…`), igual que
  `/torneo?slug=` y `/noticia?slug=`. Las tarjetas de `equipos.html` y la búsqueda enlazan
  a las fichas; el nav añade "Calendario" (`calendario.html`) con pestañas cruzadas a
  `resultados.html`.
- **Motivo**: el Worker ya usa este patrón para fichas (plan C verificado en producción),
  y las rutas limpias `/es/teams/:slug` exigirían más HTMLRewriter sin beneficio real
  (los datos se leen client-side del proxy; el SEO de fichas dinámicas queda genérico
  en ambos casos).
- **Consecuencias**: cero rutas nuevas de Worker para fichas; `equipo.html` (VANTS DE 5)
  queda intacto y separado de las fichas de plataforma.
- Fecha: 2026-10-20.

## D9 · Datos REALES de FACEIT vía Data API v4 oficial + sync programado (sin scraping)
- **Decisión**: `scripts/proveedor-datos.mjs` define la interfaz `EsportsDataProvider`
  con dos adaptadores: `demo` (fixtures etiquetadas is_demo=true, para desarrollo/QA) y
  `faceit` (Data API v4 `open.faceit.com` con FACEIT_API_KEY, is_demo=false). El job
  `.github/workflows/faceit-sync.yml` (diario 05:17 UTC + manual) ejecuta
  `scripts/sincronizar-faceit.mjs` que hace UPSERT idempotente en pt_*
  (ON CONFLICT source+external_id). Jugadores FACEIT: `[]` honesto (v4 no expone
  rosters de championships sin scopes de organizador — NO se inventan plantillas).
- **Motivo**: F8 exigía fuente real; la API oficial es legal, estable y la key ya vive
  en secrets. Cualquier error HTTP LANZA y el sync sale 3 (rojo) — nunca éxito falso.
- **Consecuencias**: los torneos FACEIT aparecen junto a los DEMO (claramente separados
  por chips); el catálogo pt_* se mantiene fresco sin intervención manual.
- Fecha: 2026-10-20.

## D10 · pt_players como catálogo público SEPARADO de la tabla `players` real
- **Decisión**: migra 29 crea `pt_players` (slug, rol, país, team_slug soft-ref) SOLO con
  perfil competitivo público. La tabla `players` (cuentas/auth del dueño) sigue siendo la
  fuente de `/api/players` (lista) y NO se expone con PII.
- **Motivo**: la ficha de jugador estilo strafe necesita catálogo público con slug; las
  cuentas reales tienen PII y ciclo de vida distinto. Dos tablas, dos contratos, cero
  riesgo de fuga.
- **Consecuencias**: `/api/players/:slug` lee pt_players; `/api/players` (lista) lee
  players con whitelist. Documentado en API_SPEC.
- Fecha: 2026-10-20.

## Decisiones heredadas (resumen de sesiones previas)
- Electron (NUNCA Tauri) para el HUB/launcher, con electron-updater (Fase 5 del plan VANTS).
- Borrado (no ocultado) de perfiles duplicados; única identidad del dueño conservada.
- Backend = autoridad competitiva; secretos solo en backend; Neon Functions para servicios
  gratis (sin Railway/Render).
- Historial de RR en Neon (migración 27, T46) — motivo/partida/temporada/fecha.
- Matchmaking en Neon Functions (T47), cerebro agéntico GLM (T43), auto-diagnóstico IA (T48).

## D11 · Pivote fullstack (19-oct): capa compilada + servicios + MCP COMPLEMENTANDO al Worker
- **Decisión**: el monolito estático se amplía a stack fullstack real (`8b0e247`):
  (1) **webapp Astro 7** (`webapp/`) que compila la home con islas React (`Explore.tsx`,
  `client:load`) y Vue + Three.js (`Emblema3D.vue`, `IntroJett.vue`, `client:only="vue"`);
  (2) **servicios contenedorizados** con Docker multi-stage (`node:24-alpine`, `USER node`):
  `services/api-gateway` (Express :8080) y matchmaking-service (Fastify :8081), orquestados
  con `docker-compose.yml`; (3) **server MCP stdio** (`mcp/server.mjs`) con 4 tools de solo
  lectura; (4) **Neon Postgres** cuyas migraciones idempotentes aplica el CI
  (`neon-migrate.yml`, en orden por nombre de archivo). El resto del sitio sigue estático
  servido por el Worker y los bundles `_astro/` se commitean en el espejo ×3.
- **Motivo**: animaciones 3D reales con Vue (motor de Three) y tooling real (Docker, MCP,
  scraper Python) sin reescribir la plataforma — "fin de los stickers". Supersede PARCIAL de
  D1: no hay reescritura del backend ni de las páginas existentes; se AÑADE una capa de
  presentación compilada y servicios satélite.
- **Consecuencias**: los bundles compilados son fuente de verdad (reproducibles byte a byte,
  verificados en CI); `scripts/build-webapp.mjs` sincroniza el espejo ×3 y `--check` lo vigila
  desde `fullstack.yml`; `astro check` gatea el tipado. El Worker sigue siendo el único
  servidor de producción; el patrón de islas está documentado en `docs/content-island.md`.
- Fecha: 2026-10-19 (hecho), 2026-10-20 (documentado).
- Actualización (2026-10-20, `cd7f9f1`): IntroJett.vue dejó de ser isla montada (fuera de
  `index.astro` y `Hero.astro`); las islas vivas de la home son `Explore.tsx` y `Emblema3D.vue`
  (ver tabla vigente en `docs/content-island.md`).

## D12 · Identidad visual MYKD: rojo/negro reemplaza al lima
- **Decisión**: paleta roja (#ff0d2e) sobre oscuro + menús estilo MYKD; el lima #D2DC59 de
  D2/T51 queda retirado del skin (persiste solo en assets históricos).
- **Motivo**: tercera iteración de identidad en 36 h (T52 → strafe → MYKD); el dueño la
  aprobó en producción. Supersede D2 en cuanto al acento de color (lo demás: patrones,
  no marcas de terceros — sigue vigente).
- **Consecuencias**: los skins futuros deben registrar la decisión aquí para no perder
  la traza (ya hubo dos caducidades de identidad sin registro en su día).
- Fecha: 2026-10-20.

## D13 · Numeración de migraciones CONGELADA (sin renombres retroactivos)
- **Decisión**: NO se renombran migraciones ya aplicadas (doble "05", "11" faltante con
  "13" autotitulado "11"). Los números nuevos siguen la secuencia (30+).
- **Motivo**: neon-migrate aplica por orden lexicográfico y las migras ya corrieron en
  prod; renombrar puede reordenar ejecuciones y romper la idempotencia percibida. El SQL
  suelto en `docs/*.sql` es histórico: no lo aplica el CI.
- **Consecuencias**: la numeración queda "con huecos" a sabiendas; cualquier migración
  nueva debe declarar dependencias en su cabecera.
- Fecha: 2026-10-20 (revisión de gobierno).

## D14 · Origen canónico PENDIENTE de decidir (workers.dev vs dominio propio)
- **Decisión**: PENDIENTE. Hoy conviven canonical `feispla.github.io/Vants` (SEO) con
  deploy principal `vants.vants.workers.dev` (Worker + CI + Electron) y arranque de
  Android en GitHub Pages.
- **Motivo**: elegir un origen único afecta SEO y firmas — decisión del dueño. Los
  dominios vants.gg / vantsgg.com están preparados pero sin activar.
- **Consecuencias**: mientras tanto, señales SEO divididas (riesgo bajo con poco tráfico,
  alto al crecer). Recomendación registrada: unificar a workers.dev ahora y 301 al
  dominio propio cuando se active.
- Fecha: 2026-10-20 (marcada como abierta a propósito).

## D15 · Endurecimiento de CI, seguridad y API (2026-10-20)
- **Decisión**: aplicar el plan de endurecimiento de la revisión de gobierno: `branches: [main]` en los 4
  triggers que deployan (cloudflare-deploy, fullstack, neon-migrate, neon-deploy-functions
  — dos estaban corruptos como `branches: ain]` y NUNCA corrían por push), concurrency
  compartida `deploy-prod`, timeout en faceit-xp (144 runs/día), SHA-pinning de actions,
  permissions mínimos, `estado-db.sql` SIN emails (rol `owner` en vez de email), ticket de
  verificación Auth0 sin la constante inexistente `AUTH0_SPA_CLIENT_ID` (ahora es secret
  opcional), `/api/teams` para pt_teams y legado movido a `/api/teams-live`, guarda
  anti-bucle del agente fail-safe, agent-service fail-closed (AGENT_TOKEN o
  AGENT_ALLOW_OPEN=1), sanitización de `/api/discord/notify` (anti markdown-injection),
  robots.txt + backoff en el scraper, healthcheck de matchmaking, huérfanos fuera de main.
- **Motivo**: riesgos 🔴/🟡 detectados en la revisión integral del 20-oct (CI/CD, seguridad,
  calidad y consistencia doc↔código).
- **Consecuencias**: riesgo residual documentado: `/api/discord/notify` sigue siendo
  browser-facing (origen falseable) — mitigado con sanitización + rate limit; el fix
  definitivo es emitir la notificación server-side desde `/api/torneos/inscribir`.
- Fecha: 2026-10-20.

## D16 · MI CUENTA abre la ficha de jugador (el dashboard deja de ser la cara de MI CUENTA)
- **Decisión**: el botón MI CUENTA lleva SIEMPRE al flujo de perfil: sin ficha →
  `vantsAbrirMiPerfil` ("MI PERFIL · PRIMERA VEZ" → ficha de jugador); con ficha →
  `openPlayerProfile(mio)`. El dashboard "MI CUENTA · DASHBOARD" queda como respaldo
  inalcanzable desde la UI (solo alcanzable llamando `abrirMiCuenta()` por consola).
- **Motivo**: petición del dueño — "a los NUEVOS que le salga el perfil de antes, no este":
  el arranque caía al dashboard cuando `VANTS_ME.player`/`VANTS_PLAYERS` aún no tenían la
  ficha (exactamente el caso de los usuarios nuevos).
- **Consecuencias**: `abrirMiCuenta` delega PRIMERO a `vantsAbrirMiPerfil` (try/catch +
  return) y el fallback del click de `#miCuentaBtn` llama al perfil; sin bucles (el perfil
  nunca llama a `abrirMiCuenta`). Cache bumped arena.js v=30→v=31 y arena-live.js v=32→v=33
  en 25/24 html ×3 + `webapp/src/layouts/Base.astro` (`fc99429`; v=32/v=33 de arena.js en la
  revisión posterior).
- Fecha: 2026-10-21 (`fc99429`).

## D17 · Sin tarjeta de SALA DE JUGADORES en los submenús (preview de nav)
- **Decisión**: el hover del tab SALA (y cualquier link a `jugadores.html`) NO
  despliega la tarjeta de vista previa. El entry `jugadores` sale de `DATA` en
  `assets/js/menu-preview.js` ×3; `showNavPv` corta con `if (!DATA[key])` y el
  modo clásico de EXPLORAR no bindea el hover de filas sin tarjeta. La página
  `jugadores.html`, el tab SALA y su submenú (Sala de jugadores / Equipos /
  Equipo VANTS DE 5) siguen existiendo: solo la tarjeta del preview se retira.
- **Motivo**: petición del dueño — "los submenús no tenían eso porque lo había
  quitado y lo colocaste de nuevo". La tarjeta (/// IDENTIDADES · SALA DE
  JUGADORES · ABRIR SECCIÓN) quedó fuera y fue re-introducida por el feature
  de previews; se restaura el estado del dueño.
- **Qué la invalidaría**: que el dueño pida volver a mostrar la tarjeta de
  IDENTIDADES en el preview del nav (re-agregar el entry en `DATA` y bump de
  cache), o que se rediseñe el preview para que el tab SALA muestre otra cosa.
- **Consecuencias**: cache bumped `menu-preview.js?v=6 → v=7` en 75 html ×3 +
  `webapp/src/layouts/Base.astro`; rebuild de webapp y espejos verificados
  (76 archivos ×3). El resto de las tarjetas del preview no cambia.
- Fecha: 2026-10-21.

## D18 · Sin tarjetas de LLAVES ni DESCARGAR en las vistas previas
- **Decisión**: el hover del tab LLAVES y del tab DESCARGAR en el nav (y de sus
  filas en la sección EXPLORAR) NO despliega tarjeta de vista previa. En
  `assets/js/menu-preview.js` ×3 los entries `llaves` y `descargar` salen de
  `DATA` → `showNavPv` corta con `if (!DATA[key])`. En la isla React
  (`webapp/src/components/Explore.tsx`) las categorías `llaves` y `descargar`
  llevan `noPreview: true` y el `onMouseEnter` de las filas lo respeta: el
  panel conserva la última categoría válida. Fila/tab siguen navegables con
  clic (llaves.html, descargar.html no cambian).
- **Motivo**: petición del dueño — LLAVES ya vive en el submenú de torneo.html
  (tarjeta redundante) y la tarjeta de DESCARGAR del EXPLORAR se pidió fuera
  ("lo de la otra imagen también quítalo").
- **Qué la invalidaría**: que el dueño pida volver a mostrar esas tarjetas
  (re-agregar los entries en `DATA` / quitar los `noPreview: true` y bump de
  cache), o que se rediseñe el preview.
- **Consecuencias**: cache bumped `menu-preview.js?v=7 → v=8` en 33 html ×3 +
  `webapp/src/layouts/Base.astro`; rebuild de webapp y espejos verificados
  (77 archivos ×3, incluye el CSS de Tailwind de la isla). QA Playwright hover
  real 9/9: LLAVES/DESCARGAR sin tarjeta
  en nav e isla; TIENDA/CLIPS/RANKING/TORNEOS intactas. El resto no cambia.
- Fecha: 2026-10-21.

## D19 · La isla EXPLORAR compila su Tailwind y el canonical vive en la fuente
- **Decisión**: (1) `webapp/src/layouts/Base.astro` importa `../styles/tw.css`
  (Tailwind v4 utilities SIN preflight — arena.css sigue siendo dueño del
  sistema base). Sin ese import, las clases de `components/Explore.tsx` no se
  compilan a ningún CSS y el panel de preview sale sin estilos (texto pegado al
  borde, <ul> con estilos de navegador). (2) El canonical/og:url de la home
  vive en `Base.astro` apuntando a `https://vants.vants.workers.dev/` — nunca
  se corrige solo en el index.html compilado: el próximo build lo pisa.
- **Motivo**: la captura del dueño mostró la tarjeta de preview sin estilos
  (causa raíz: tw.css existía pero nadie lo importaba); y el rebuild verificó
  que el fix de canonical del agente 9-f era solo sobre artefacto y se
  revertía con cada build.
- **Qué la invalidaría**: que el dueño decida canonical distinto (cambiar la
  URL en Base.astro), o que la isla deje de usar Tailwind (entonces quitar el
  import y tw.css).
- **Consecuencias**: build emite `_astro/index.*.css` (~7 KB, utilities only,
  0 preflight) linkeado desde la home; espejo ×3 = 77 archivos; el panel usa
  `p-5` (padding del aside, sustituye al `.pv-body` del modo clásico).
- Fecha: 2026-10-21.

## D20 · La sección EXPLORAR sale por completo de la portada
- **Decisión**: la sección `/// EXPLORAR · CATEGORÍAS DE LA ARENA` (título,
  grid de categorías y panel de preview) sale ENTERA de la portada. Aclaración
  del dueño: cuando marcó la imagen con la tarjeta DESCARGAR rota, pedía
  quitar la sección EXPLORAR completa, no solo esa tarjeta. Se retiran: la
  isla React (`webapp/src/components/Explore.tsx` — archivo eliminado), su
  montaje en `index.astro`, el modo clásico y el CSS `.hc-*` de
  `assets/js/menu-preview.js` (que queda SOLO para el preview del nav) y el
  flag `data-explore` del `<html>` en `Base.astro`. **El import de
  `styles/tw.css` SE MANTIENE**: lo sigue necesitando el wrapper del emblema
  3D (`Emblema3D.vue`, clases h-[230px] etc.) — D19 queda vigente en esa parte.
- **Motivo**: petición explícita del dueño ("Te dije quita /// EXPLORAR
  Categorías de la arena").
- **Qué la invalidaría**: que el dueño pida volver a tener la sección (recuperar
  Explore.tsx del historial git y re-montarla en index.astro).
- **Consecuencias**: el spec e2e pierde sus asertos de isla (home-fullstack.
  spec.js reescrito: #explorar/#hcPreview ahora esperan count=0); cache bumps
  `menu-preview.js v=8→v=9`, `arena.js v=33→v=34`, `arena-live.js v=34→v=35`
  en todos los HTML ×3 + Base.astro; espejo ×3 = 75 archivos. El preview del
  nav (TIENDA, CLIPS, etc.) NO cambia; D17/D18 siguen aplicando a los tabs.
- Fecha: 2026-10-21.

## D21 · Sin emblema de rango en los banners de perfil
- **Decisión**: el banner del perfil NO muestra el emblema de rango. Fuera en
  las 3 superficies: `pc-banner` de las tarjetas de jugador (arena.js),
  `bannerPublicoHTML` (ficha pública, arena.js) y `pfBannerHTML` (perfil real,
  arena-live.js). El rango sigue apareciendo donde corresponde: `pc-rank` del
  card, sección RANGO de la ficha (`rangoPublicoHTML` / `pf-rank` en
  arena-live.js) y el grid RANGOS (`renderRanks`).
- **Motivo**: petición del dueño — "quita que aparezca el rango en banner
  porque ya está en rango" (el hexágono del banner duplicaba la info).
- **Qué la invalidaría**: que el dueño pida volver a ver el emblema sobre el
  banner (re-agregar el `rankSVG(...,'remblem')` en los 3 builders + bump de
  cache de arena/arena-live).
- **Consecuencias**: bumps `arena.js v=33→v=34` y `arena-live.js v=34→v=35`
  (compartidos con D20); spec e2e actualizado a `arena.js?v=34`. El CSS
  `.remblem` queda (lo usa renderRanks).
- Fecha: 2026-10-21.

## D22 · E2E de plataforma resiliente al borde + Calendario como submenú
- **Decisión**: (1) el test "EN archive" acepta shell o título reescrito
  (mismo criterio que el test ES — el borde de workers.dev no se purga por
  API y la entrada envenenada sobrevive al max-age=60 del rewriter); (2) el
  test del nav verifica Calendario DENTRO del submenú de PARTIDOS: foco en el
  trigger (.sf-dd-top) → aria-expanded="true" → item visible → click navega a
  calendario.html (enlace vivo de verdad).
- **Motivo**: la suite "VANTS · pruebas automáticas" está en rojo desde el
  20/oct 03:56 (commit 8b0e247), ANTES del PR #85: (a) el test EN exigía el
  título reescrito mientras el borde servía el shell cacheado en TODAS las
  corridas (19 h de rojo); (b) Calendario dejó de ser top-level con el shell
  strafe (submenús, 69dc4d0) y el aserto toBeVisible sobre un role="menuitem"
  de dropdown cerrado fallaba siempre (desktop y móvil).
- **Qué la invalidaría**: que el borde acepte purga o que el worker fuerce
  revalidación (→ volver a exigir el título reescrito); que Calendario vuelva
  a ser top-level (→ revertir al aserto directo de visibilidad).
- **Consecuencias**: solo tests/e2e/plataforma.spec.js (2 tests); ninguna
  pieza de producción cambia. Nota honesta: desde el sandbox no se pudo
  confirmar el título reescrito en vivo (workers.dev responde 403 "Bloqueado"
  al egress del sandbox) — la próxima corrida de CI es la prueba real; el test
  acepta ambos títulos así que pasa en ambos mundos.
- Fecha: 2026-10-21.

## D23 · Los menús de strafe salen: un solo header VANTS en todo el sitio
- **Contexto**: el sitio tenía 2 skins por diseño (20/oct, fda68a5): la portada
  arena rojo/negro y el shell strafe (barra de juegos + tabs + breadcrumb) en
  las 27 páginas interiores. Al dueño se le ofreció alinearlos (sesión 14) y
  pidió: «quita el menús de strafe».
- **Decisión**: fuera el shell strafe de TODAS las interiores. `strafe-shell.js`
  se borra (×3 árboles) y ninguna página lo carga. Las páginas muestran el
  header arena con el menú MYKD de `menu-data.ts` (SALA/PARTIDOS/RANKING/
  TORNEOS con submenús + LLAVES/TIENDA/DESCARGAR/CLIPS/NOTICIAS): el MISMO menú
  que la portada, con previews de men-preview incluidos. Las 13 páginas que no
  tenían header propio (plataforma, legales, clips) lo reciben en el markup.
  Móvil: la franja .nav-links pasa de display:none a scrollable horizontal (el
  shell era la única navegación móvil de las interiores).
- **Motivo**: dos menús distintos confunden («veo dos pantallas», sesión 14) y
  el dueño eligió el arena. Un solo menú = un solo lugar que mantener
  (menu-data.ts como fuente; las interiores replican su estructura).
- **Qué NO cambia**: strafe.css, body.sf y el reskin quedan (estilizan el
  CONTENIDO interior: tabs de torneos, filas, legales); las rutas
  /es|en/tournaments/:juego/:estado y sus hooks del rewriter quedan (los .sf-tab
  del contenido siguen en el markup); 404.html e index no tocados (no tenían
  shell). El selector de idioma ES/EN del shell desaparece: i18n sigue via
  body[data-lang] y ?lang=.
- **Qué la invalidaría**: que el dueño vuelva a pedir el shell strafe
  (git revert + restaurar el tag script); que menu-data.ts deje de ser la
  fuente del menú (→ regenerar los headers interiores de nuevo).
- **Consecuencias**: 29 HTML ×3 árboles + arena.css v11 (dropdowns MYKD global
  + franja móvil) + strafe-shell.js borrado + E2E resiliente (acepta shell
  viejo en el borde hasta el deploy). QA local desktop/móvil del header,
  submenús, previews y overflow.
- Fecha: 2026-10-21.

## D24 · El nav deja de mandar fuera de la principal: tabs con submenú abren panel, NOTICIAS se borra
- **Contexto**: con el header ya unificado (D23), el dueño mandó 2 capturas: la
  portada (la que quiere) y la página NOTICIAS (donde aterriza al clickear).
  Dijo: «no quiero que manden para esta segunda página cuando le damos a los
  submenús del principal; cuando le dé a un submenú quédese en la página
  principal; esa, bórrela ya». La página de noticias solo tenía artículos DEMO.
- **Decisión**: (1) la sección de noticias sale COMPLETA del sitio: noticias.html
  y noticia.html borradas (×3 árboles), tab NOTICIAS fuera del nav
  (menu-data.ts + 29 estáticas ×3), link "Noticias" fuera del footer pf,
  entradas fuera de sitemap.xml. (2) Los tabs CON submenú (SALA, PARTIDOS,
  RANKING, TORNEOS, CLIPS) dejan de navegar al clickearlos (desktop, puntero
  fino): el click abre su panel .dd vía :focus-within y los items de adentro
  siguen siendo los enlaces vivos. En táctil no hay hover: el tab sigue
  navegando (la franja móvil no despliega dropdown). (3) El tab LLAVES sale del
  nav: el dueño ya lo pidió («quita llaves porque ya está en el submenú de
  torneo»); sigue alcanzable en TORNEOS ▾ → "Llaves · Bracket". (4) El preview
  #navPv (menu-preview.js v10) ya no se monta sobre los tabs has-sub: tapaba al
  panel .dd; vive en los links del .dd y en tabs sin submenú (TIENDA).
- **Implementación**: guard inline en Nav.astro (index) + insertado por codemod
  en las 29 estáticas con nav (×3): matchMedia '(hover:hover) and (pointer:fine)'
  → preventDefault + focus (Esc cierra). arena.css v12: chev rota también por
  :focus-within. Los tabs TIENDA y DESCARGAR siguen siendo enlaces directos
  (nunca fueron parte del reclamo y son destinos útiles).
- **Qué la invalidaría**: que el dueño pida volver a navegar con el click del
  tab (→ quitar el guard, git revert); que pida restaurar noticias
  (→ git revert + volver a sitemap); que en móvil quiera dropdowns (→ CSS del
  panel fijo bajo la franja).
- **Consecuencias**: 31 HTML + sitemap.xml ×3 árboles; noticias.html/noticia.html
  borradas (bookmarks viejos caen al 404); home-fullstack.spec.js espera
  arena.css?v=12; plataforma.spec.js no cambia (el trigger sigue siendo
  a[href=partidos.html], el foco abre el panel igual).
- Fecha: 2026-10-21.

## D25 · El emblema 3D replica el logo oficial (placa octogonal, V blanca y roja, cuña)
- **Contexto**: el dueño vio el preview 3D del sandbox (página de verificación
  Vue+Three) y dijo: «este preview no tiene nada de identidad con el logo
  porque no se ve la V ahí; colocá ese 3D con el logo oficial». El emblema del
  webapp (Emblema3D.vue, portada) era la V roja genérica de prismas sobre
  placa oscura: sin el trazo blanco ni la cuña del logo real.
- **Decisión**: Emblema3D.vue reproduce el logo oficial (apple-touch-icon.png)
  en 3D: bisel rojo (octógono 1.44) dentro del grosor de la placa oscura
  (1.27) → las DOS caras muestran cara oscura + anillo rojo fino; "V" de dos
  trazos extruidos con degradado por vértice — izquierdo BLANCO
  (#ffffff→#878d97) que afila al vértice, derecho ROJO (#ff344b→#b90d24) con
  cortes horizontales — más la cuña roja flotante junto al vértice. La V va
  también por detrás (grupo clonado, rotation.y=π): mitad del giro muestra el
  reverso y sin eso no se vería la V ahí. Luces: key blanca 2.4, relleno
  blanco trasero 2.4 (sin él el reverso queda teñido rojo por el rimLight,
  bajado de 30 a 12), ambiente 0.9. El dispose ahora libera geometrías y
  materiales (hallazgo de la auditoría 2-d).
- **Motivo**: identidad de marca explícita pedida por el dueño; el emblema es
  el cierre visual de la portada y no se reconocía como el logo.
- **Qué NO cambia**: el contenedor (230×230, opacity .6), el loop rAF
  (t*0.5 rad/s + wobble), client:only="vue", ni el resto de la portada. La
  página de verificación del sandbox replica la MISMA geometría.
- **Qué la invalidaría**: que el dueño pida volver a la V roja plana
  (→ git revert de este commit); que cambie el logo oficial (→ re-medir los
  polígonos y los degradados).
- **Consecuencias**: nuevo bundle _astro/Emblema3D.*.js (hash nuevo, el
  espejo ×3 se regenera con scripts/build-webapp.mjs); index.html ×3
  actualizados; sin bump de cache manual (los bundles _astro van con hash de
  contenido).
- Fecha: 2026-10-21.

## D26 · El emblema nunca se congela: bajo reduced-motion gira plano y suave (0.4×)
- **Contexto**: D25 + #104 dejaron el emblema impecable, pero el dueño reportó:
  «no se mueve en el PC, en el móvil sí» (captura del emblema en pose quieta).
  Causa: su PC tiene los efectos de animación de Windows apagados → el
  navegador reporta `prefers-reduced-motion: reduce` → el bucle de #104
  congelaba el emblema en UN fotograma (pose 0.55). En el móvil la preferencia
  no está activa y por eso ahí sí giraba.
- **Decisión**: Emblema3D.vue ya no trata reduced-motion como "congelar":
  - `debeAnimar()` solo depende de enPantalla, pestaña visible y contexto GPU.
  - Con `mqReduce.matches` el tiempo avanza a **0.4×** y el vaivén vertical
    (`rotation.x`) queda a **amplitud 0**: giro plano, calmado, sin balanceo.
  - Se elimina el fotograma quieto en pose(0.55) y el branch asociado.
  El sandbox de verificación (emblem3d.ts) recibe el mismo cambio para seguir
  siendo espejo (badge «REDUCIDA · GIRO SUAVE»).
- **Motivo**: la preferencia de menos movimiento no puede apagar la identidad
  de la marca en la portada; un giro lento y plano respeta el espíritu de la
  preferencia (menos movimiento, nada que persiga el cursor ni parpadee) y el
  dueño ve su logo vivo en su PC. Las animaciones decorativas del home
  (hero-rise, halo, ticker) SÍ siguen gated por reduced-motion en CSS.
- **Qué NO cambia**: velocidad normal (1×) para quien no pide reduced-motion;
  pausa fuera de pantalla/pestaña oculta (#104); three-min en diferido (#106);
  home-motion.css; el resto de la portada.
- **Qué la invalidaría**: que el dueño pida velocidad completa también bajo
  reduced-motion (subir el factor 0.4 → 1 y recuperar el vaivén), o una queja
  de mareo por movimiento que obligue a revertir a fotograma quieto.
