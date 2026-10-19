# TROUBLESHOOTING — Problemas conocidos y soluciones

## La API del Worker responde `{"ok":false,"error":{"message":"Datos no disponibles (proxy 403)"}}`

**Causa**: el WAF del endpoint de Neon Functions bloquea el egreso de Cloudflare Workers por
ASN (403 HTML de nginx, confirmado con diagnóstico en producción). Los navegadores de
usuarios reales NO están bloqueados.
**Solución**: es la esperada — la UI del navegador lee pt_* DIRECTO del proxy vantsdata
(plan C, T52f). La API `/api/…` del Worker mantiene el contrato server-side para clientes
cuyo egreso no esté bloqueado. Si el dueño quiere la API server-side 100% operativa,
alternativa: una Neon Function propia de solo-lectura en el mismo dominio del Worker o
regla de WAF personalizada en el panel de Neon.

## La API responde "Datos no disponibles" sin `(proxy NNN)`

**Causa**: la migración 28 (tablas `pt_*`) aún no se aplicó en Neon.
**Solución**: re-ejecutar `neon-migrate.yml` desde Actions; verificar el inventario final
del log (`pt_games 6`, `pt_torneos 4`, `pt_teams 4`).

## `403 "Bloqueado"` con curl

El Worker bloquea peticiones sin User-Agent de navegador y scanners (por diseño).
**Solución**: añadir `-A "Mozilla/5.0 …"` a curl, o probar en navegador.

## La página `/es/tournaments/…` carga sin estilos

Solo puede ocurrir si se desactiva el reescritor de rutas del Worker: los assets del HTML
son relativos (`./assets/…`) y en rutas anidadas necesitan volverse absolutos. El Worker
(`/es|en/tournaments/…`) los reescribe con HTMLRewriter. Si añades páginas con rutas
profundas, usa hrefs absolutos (`/assets/…`).

## Las tabs no cambian la URL

Las tabs son anchors con `href` a `/es|en/tournaments/:juego/:estado/` y pushState en click.
Si algo las rompe, verifica que `strafe-home.js` cargó (`window.__SF_HOME__.version === '2.1.0'`).

## "Neon no disponible" en la consola del navegador (local)

Con `wrangler dev`, las llamadas directas del navegador al Data API de Neon pueden fallar por
red/CORS del entorno local; el frontend cae a sus fallbacks etiquetados. En producción no
ocurre. No es un defecto del sitio.

## CI en cola mucho tiempo ("queued")

Los runners gratuitos pueden tardar. La prueba definitiva del deploy es el workers.dev
(decisión D7). Si un workflow queda atascado horas: re-run desde Actions.

## GitHub API rate-limited (403) al consultar Actions

El PAT del remote puede agotar el rate limit por IP compartida. Alternativa: verificar la
web viva con curl/navegador (método D7).

## El buscador no devuelve nada

`/api/search` requiere `q` de 2–64 caracteres (rechaza `%`, `;`, `\`). Con menos de 2
caracteres la UI muestra la guía de búsqueda (EmptyState), no un error.

## Datos "DEMO" en el calendario

Es la semilla etiquetada de la migración 28 (nunca pasa por real: chip DEMO + prefijo
"DEMO ·" en el nombre). Para torneos reales: insertar filas con `is_demo=false,
source='vants'` desde una sesión del OWNER (RLS) o activar el adaptador FACEIT
(`FACEIT_API_KEY` ya en secrets; contrato en `architecture/API_SPEC.md`).
