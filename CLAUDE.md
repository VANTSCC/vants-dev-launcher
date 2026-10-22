# CLAUDE.md · VANTS — acuerdo de trabajo con los agentes

Las 12 reglas de trabajo del equipo, adaptadas a este repo (web estática ×3
espejos + webapp Astro + Neon + Auth0 + GitHub Actions). Lo que no se deduce
del código está acá. Si una regla te impide algo que el dueño pidió
explícitamente, preguntá antes de ejecutar, no después.

## 01 · Contexto antes que prompt
- Cada encargo lleva pegado el extracto que aplica: ficheros a tocar y los que
  NO, qué está ya hecho y criterio de aceptación.
- No apuntes a un documento entero (`INFORME-MAESTRO.md` no es un encargo).

## 02 · Nada de migraciones sin revisión
- El esquema se diseña ANTES de escribir la migración y el dueño la revisa.
- Las migraciones se aplican solas vía `.github/workflows/neon-migrate.yml`
  contra Neon. NO edites `db/migrations/` a la ligera: son idempotentes pero
  tocan la base real compartida (pagos Stripe, perfiles, FACEIT).
- Prohibido correr SQL destructivo (DROP/TRUNCATE/DELETE masivo) contra Neon
  desde cualquier agente. El diagnóstico es solo-lectura (estado-db).

## 03 · Verificado, o no está terminado
- «Implementado» no es un estado. Terminar = haber ejercido el cambio.
- En este repo, terminado significa: `node --check` en cada JS tocado,
  espejos ×3 byte-idénticos (`scripts/build-webapp.mjs --check` en verde; el
  conteo lo imprime el script y baja/sube con lo que haya en `public/`),
  y QA en navegador del flujo tocado (home + página afectada).
- Si algo no se pudo verificar (ej. Neon sin credenciales en el sandbox),
  se DICE. Un «no verificado» honesto es información; un «listo» sin comprobar
  es una mentira que se descubre en producción.

## 04 · Busca antes de crear e imita el repo
- Regla de oro de las espejos: UN cambio, TRES árboles (raíz `/`, `public/`,
  `vants-server/public/`). Si tocas `assets/js/x.js` en raíz, los otros dos
  quedan byte-idénticos o el build --check revienta.
- Bump de cache siempre que cambie un JS/CSS referenciado (`archivo.js?v=N` →
  `N+1`) en TODOS los html que lo cargan, ×3 árboles, + `webapp/src/layouts/Base.astro`.
- Imita capas, nombres y forma del repo: IIFE con 'use strict', `escHtml` para
  todo texto dinámico, sin frameworks nuevos en los árboles estáticos.
- Cambia lo mínimo: refactor y funcionalidad no viajan en el mismo commit.

## 05 · Los agentes viven en el repo
- El registro de trabajo compartido es `/home/z/my-project/worklog.md`
  (fuera del repo): toda tarea appendea su sección con Task ID, agente y
  resumen antes de cerrar.
- Las decisiones que costaría deshacer viven en `DECISIONS.md` (regla 12).
- Si falta un agente o una regla, propónlo: lo que sirve acá le sirve a todos
  los agentes (Claude, autoclaw, claw, etc.).

## 06 · A producción no se llega sin una persona
- Ningún agente pushea a `main`. Se trabaja en rama, se abre PR y el dueño
  mergea. main despliega solo (Pages + Cloudflare + Neon), por eso el merge
  ES el acto de producción y lo hace una persona.
- Excepción única: el dueño lo pide explícitamente para ESE cambio concreto.
- Un bug se arregla en su propia rama, sacada del main actualizado.

## 07 · Lo prohibido va en hooks, no en el prompt
- `.claude/settings.json` de este repo lleva las reglas deny (valen aunque la
  sesión esté en modo automático). Mantenelas al día con la lista de abajo.
- Bloqueado antes de ejecutar: leer/escribir `.env`, `*.pem`, `*.key`;
  `git push --force` en cualquier forma; `rm -rf` sobre raíz/home/comodines;
  editar `.github/workflows/` sin pedirlo el dueño (decide qué se despliega);
  psql/Neon destructivo (regla 02).
- Un guardarraíl que estorba a diario acaba desactivado: nada de denies
  cosméticos.

## 08 · Un agente, un rol
- Quien escribe el fix no se autoaprueba: otra pasada (agente o persona) revisa
  el diff antes del PR; QA ejercita el flujo en navegador y da APTO/NO APTO.
- Lo pequeño no pasa por el circuito entero: dos líneas no necesitan cinco
  agentes.

## 09 · El modelo caro, donde el error es caro
- Lo que se propaga (esquema de Neon, contratos de `neon-functions/`, HMAC del
  worker, cambios de CI) va con el modelo más potente y revisión humana.
- Cambios de texto/copys y bumps de cache no necesitan circuito pesado.

## 10 · Autenticado no es autorizado
- Toda consulta que devuelva datos de alguien valida pertenencia (RLS de
  Neon + `auth0_sub`), no solo que haya sesión.
- Nada de secretos ni datos personales en código, logs ni capturas: el token
  de GitHub va por secret/variable de entorno, NUNCA pegado en el repo.
- Errores útiles: código correcto y campo que falla. Nunca trazas, SQL ni
  nombres internos.

## 11 · Todo se ejecuta dos veces
- Webhooks e integraciones son idempotentes por diseño (mirar
  `stripewebhook` y `faceit_registrar_partida` como patrón: clave de
  idempotencia + best-effort en lo accesorio, la operación principal nunca
  falla por el aviso).
- N+1 prohibido: ninguna consulta a Neon dentro de un bucle del front.

## 12 · Decisiones con fecha de caducidad
- Toda decisión que costaría deshacer entra en `DECISIONS.md` (formato D16):
  contexto, decisión, motivo (con la cita del dueño), consecuencias, fecha.
- Cada decisión lleva «qué la invalidaría».

## Chuleta operativa (lo que más se rompió)
- Espejos: `node scripts/build-webapp.mjs --check` debe terminar en ✅ (el
  conteo cambia con cada página o chunk de Astro que entra o sale; eran 76
  antes de borrar NOTICIAS y los menús de strafe).
- El canal de E/S de algunos sandboxes se come `[m` al mostrar (`[main]` se ve
  `ain]`): los blobs siempre están bien; verificar byte a byte antes de
  «corregir» algo que no está roto.
- Cache: html ×3 + Base.astro siempre juntos, o el usuario ve versión vieja.
- `torneo.html` no carga arena-live.js (única página); el botón MI CUENTA va
  oculto ahí.
