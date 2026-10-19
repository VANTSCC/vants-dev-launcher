# PROJECT_STATUS — Plataforma VANTS (estilo Strafe)

> Archivo vivo de estado. Se actualiza tras cada bloque de trabajo verificable.
> Última actualización: 2026-10-19 · Sesión T52 (misión 16 fases)

## Contexto

VANTS es una plataforma de esports (Valorant → hub universal de juegos PC) que opera en
**Cloudflare Workers** (`vants.vants.workers.dev`) con frontend estático espejado ×3
(raíz / `public/` / `vants-server/public/`), base de datos **Neon Postgres** y CI de GitHub
que despliega automáticamente cada push a `main`.

El dueño fijó como referencia de diseño la página
`https://www.strafe.com/es/tournaments/csgo/upcoming/` (sesiones T50 y T51 ya realizaron el
análisis en navegador y el rediseño completo, desplegado en el commit `ac485ae`, CI SUCCESS).

Esta sesión (T52) ejecuta la misión completa de 16 fases: investigar, construir, probar,
documentar y preparar para producción la plataforma de torneos, sin presentar datos ficticios
como reales y sin copiar marcas de terceros.

## Fases

| # | Fase | Estado | Evidencia |
|---|------|--------|-----------|
| 1 | Investigación web original | EN CURSO | `research/*.md`, capturas `download/qa-strafe3/` |
| 2 | Definición de producto | PENDIENTE | `product/*.md` |
| 3 | Arquitectura técnica | PENDIENTE | `architecture/*.md` |
| 4 | Configuración del proyecto | PARCIAL | repo existente + scripts verificables |
| 5 | Diseño visual y componentes | PARCIAL | `strafe.css` v2 (T51), componentes por completar |
| 6 | Página de torneos | PARCIAL | home tabs (T51), faltan rutas `/es/tournaments/…` y filtros URL |
| 7 | Backend, BD y API | PARCIAL | APIs existentes (worker.js), falta API pública de torneos |
| 8 | Datos de esports e integraciones | PARCIAL | FACEIT key existe, falta interfaz provider |
| 9 | Páginas complementarias | PARCIAL | faltan equipos, noticias, búsqueda |
| 10 | SEO e internacionalización | PARCIAL | sitemap/robots existen; falta hreflang + es/en |
| 11 | Accesibilidad | PENDIENTE | auditoría pendiente |
| 12 | Seguridad | PARCIAL | worker aplica cabeceras/anti-bot; revisión pendiente |
| 13 | Pruebas automatizadas | PARCIAL | suites node existentes (61+54+36+30+25); falta suite plataforma |
| 14 | Despliegue | OPERATIVO | CI despliega a producción en cada push (verificado) |
| 15 | Documentación y entrega | PENDIENTE | docs finales |
| 16 | Auditoría final y corrección | PENDIENTE | crawler de enlaces + smoke en vivo |

## Verificado en producción (inicio de sesión T52)

- `GET /` → 200 (20 KB) con UA navegador; 403 "Bloqueado" para curl sin UA (bot-protection, comportamiento esperado).
- `/torneos.html` → 307 → `/torneos` (URLs limpias).
- `/api/discord/events` → POST sin firma → 401 "Falta firma de Discord" (ruta viva, valida Ed25519).
- CI último commit `ac485ae`: "Cloudflare · deploy del Worker" **success**.
- Secrets GitHub presentes: AGENT_LLM_KEY, AGENT_LLM_URL, CLOUDFLARE_API_TOKEN, DISCORD_ID_APP, DISCORD_PUBLIC_KEY, FACEIT_API_KEY, FACEIT_CLIENT_ID, FACEIT_WEBHOOK_SECRET, HENRIKDEV_API_KEY, NEON_API_KEY, STEAM_API_KEY, VANTS_BOT_SECRET.
- NO existen aún: `/equipos`, `/noticias`, `/es/tournaments/...`, `/api/games`, `/api/tournaments`, `/api/articles`, `/api/search` (verificado con curl, 404).

## Punto de recuperación

Estado completo en `worklog.md` (T41→T51) y en este archivo. Si la sesión se interrumpe,
reanudar desde la primera fase marcada PENDIENTE/EN CURSO y re-leer `worklog.md` + `IMPLEMENTATION_PLAN.md`.
