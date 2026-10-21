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
