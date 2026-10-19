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

## D2 · El diseño replica patrones, no identidad de terceros
- **Decisión**: se replican patrones de UX de la referencia (doble nav, tabla densa, tabs de
  estado, tokens oscuros + acento) con paleta y marca propias de VANTS (logo vmark, Barlow Semi
  Condensed en lugar de Gotham Narrow). Sin logos, imágenes ni textos de Strafe.
- **Motivo**: requisito explícito de la misión (no copiar marcas/contenido de terceros) y ya
  ejecutado así en T51 (lima #D2DC59 propio de VANTS, verificado en producción).
- **Consecuencias**: ninguna restricción legal conocida; identidad consistente.
- Fecha: 2026-10-19 (formaliza lo hecho en T51).

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

## Decisiones heredadas (resumen de sesiones previas)
- Electron (NUNCA Tauri) para el HUB/launcher, con electron-updater (Fase 5 del plan VANTS).
- Borrado (no ocultado) de perfiles duplicados; única identidad del dueño conservada.
- Backend = autoridad competitiva; secretos solo en backend; Neon Functions para servicios
  gratis (sin Railway/Render).
- Historial de RR en Neon (migración 27, T46) — motivo/partida/temporada/fecha.
- Matchmaking en Neon Functions (T47), cerebro agéntico GLM (T43), auto-diagnóstico IA (T48).
