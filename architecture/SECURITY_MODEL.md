# SECURITY_MODEL — Modelo de seguridad de la plataforma

## 1. Superficie y controles existentes (verificados en worker.js)

| Control | Implementación | Estado |
|---|---|---|
| Bot-protection | 403 "Bloqueado" para UA/scanners conocidos (`run_worker_first`) | EXISTE (verificado: curl sin UA → 403) |
| Rate limit por buckets | `rateLimit(bucket, ip, max)` con KV/memoria por ruta (LIMIT_GENERAL/ESPORTS/TEAMS/TORNEO/ACCOUNT/CLIPS/GPR/NOTIFY) | EXISTE |
| Cabeceras | `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` restrictiva, `Content-Security-Policy` | EXISTE |
| Discord webhook | Verificación Ed25519 obligatoria (401 sin firma) | EXISTE (verificado en vivo) |
| Escrituras de usuario | Sesión Auth0 (JWT verificado) + origen propio + rate limit duro | EXISTE |
| Secretos | Solo en GitHub secrets/Worker vars; nunca en repo | POLÍTICA (patrón auditado T3) |

## 2. Controles añadidos en esta misión (F7/F12)

1. **Validación de entrada server-side** en cada endpoint nuevo: whitelist de valores
   (estado/juego), rangos (pag/porPagina), longitudes (q). Rechazo 400 antes de tocar la BD.
2. **SQL parametrizado**: el Data API de Neon usa querystrings REST (sin SQL concatenado del
   cliente). Los valores dinámicos SIEMPRE van `encodeURIComponent()` (patrón ya usado).
3. **RLS como puerta real**: tablas nuevas con `ENABLE ROW LEVEL SECURITY`, lectura pública
   solo por policy SELECT; escritura solo `current_es_owner()` (migración 17).
4. **Sin PII en API pública**: `/api/players` expone solo display/rating/role — nunca email,
   auth0_sub ni datos de contacto.
5. **CORS mínimo**: `Access-Control-Allow-Origin` propio (patrón existente); nada de `*`
   en endpoints nuevos.
6. **Rate limit de lectura**: bucket general existente aplicado a las rutas nuevas.
7. **Errores sin internals**: 500 → `{ok:false,error:{message:"Error interno"}}`; detalle solo
   en logs del Worker.

## 3. Amenazas consideradas y mitigación

| Amenaza | Mitigación |
|---|---|
| Scraping abusivo de la API | Rate limit por IP + caché 60 s + bot-protection |
| Inyección (SQL/JS) | REST parametrizado + sanitización de `q` (longitud/chars) + sin `innerHTML` con datos de usuario (textContent en render) |
| XSS por contenido de artículos/torneos | El cuerpo de artículos se renderiza como texto con saltos controlados; el HTML de admins se escapa (sin `eval`/`innerHTML` crudo) |
| Clickjacking | `X-Frame-Options: DENY` (existente) |
| Enumeración de IDs | Slugs + 404 consistentes; sin filtrar internals |
| Datos demo confundidos con reales | `is_demo` en la fila + chip visible "DEMO" en UI + sin JSON-LD de evento para demo |
| Fuga de secretos | Nunca en frontend; solo Worker vars/secrets CI; `.env.example` sin valores reales |
| DoS de búsqueda | `q` limitado (2-64) + rate limit + índice GIN |

## 4. Privacidad

- Sin analítica de terceros (D6). Sin cookies nuevas (Auth0 ya gestiona la sesión).
- `presence` (en línea) ya está diseñada sin PII y con ventana de 2 min.
- Logs del Worker: peticiones/errores; sin credenciales ni datos personales en logs.

## 5. Copias de seguridad y recuperación

- Neon: la plataforma usa la base de producción existente (retención según plan del dueño).
- Reversión de código: `git revert` + push (CI redeploya). Migraciones idempotentes y
  reversibles (bloques `DROP … IF EXISTS` documentados en cada archivo).
- Secretos rotables sin deploy: GitHub secrets → workflow → Worker vars.

## 6. Revisión de dependencias

- El Worker no tiene dependencias npm en runtime (solo `wrangler` en dev/deploy).
- El repo mantiene `package-lock.json` actualizados; sin paquetes nuevos en esta misión
  (JS vanilla), por lo que la superficie de supply chain no crece.

## 7. Pendiente documentado (sin ocultar)

- CSP actual permite los CDNs de Auth0/fuentes; una CSP estricta por página requeriría
  revisión del shell (fuera del alcance inmediato, riesgo bajo documentado).
- El bot-protection es una lista propia; los bots nuevos podrían pasar hasta que el dueño
  actualice la lista (riesgo bajo: endpoints de solo lectura con rate limit).
