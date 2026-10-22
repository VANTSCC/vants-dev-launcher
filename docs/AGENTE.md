# AGENTE VANTS — el cerebro de control total

> *"el mejor agente de IA… que maneje todo la web y el Launcher… si Discord no
> te funciona… crea uno que sea máximo para el control de todo"*

El Agente VANTS es el servicio que **vigila, decide, actúa y reporta** sobre
toda la plataforma. Reúne en un solo cerebro lo que antes estaba suelto
(`monitor/` de un lado, `supervisor.py` de otro) y añade lo que faltaba:
**memoria persistente**, **acciones automáticas con guardas**, **órdenes en
lenguaje natural** y **canal Discord** vía el bot VANTCALL ya conectado.

## 1. Arquitectura

```
┌────────────────────────── CEREBRO (services/agent-service) ──────────────────────────┐
│  chequeos.js ──► cerebro.js ──► acciones.js                                          │
│  (los ojos)      (reglas + NLU       (las manos: re-despliegues GitHub              │
│                   + LLM opcional)     con guarda anti-bucle)                        │
│        ▲                │                        │                                   │
│        │                ▼                        ▼                                   │
│  web · worker FACEIT ·  memoria.js ─────────► Neon: agent_runs / agent_events /     │
│  launcher · workflows   (RAM o PG)            agent_comandos  (migración 25)        │
└──────────────────────────────┬───────────────────────────────┬───────────────────────┘
                               │                               │
        CI cada 30 min (agente.yml)                    bot VANTCALL (Python)
        + resumen en GitHub + Discord                  /agente estado·informe·incidentes·
        webhook opcional (VANTS_DISCORD_WEBHOOK)       resolver·comando  + DMs (agent_bridge)
```

**Dónde corre el agente** — dos modos, mismo código:

| Modo | Cómo | Cuándo usarlo |
|------|------|---------------|
| **CI (por defecto, 0 €)** | `.github/workflows/agente.yml` — cron cada 30 min + manual | Ya funcionando. Vigila, actúa, escribe en Neon y publica resumen. |
| **Servicio HTTP (instantáneo)** | `node server.js` (:8082) donde el dueño quiera | Si se quiere `/agente comando` con respuesta inmediata (definir `AGENT_URL`). Opcional: la ruta Neon ya responde en ≤30 min sin host. |

## 2. Lo que vigila (chequeos)

| Chequeo | Qué mira | Severidad si falla |
|---------|----------|--------------------|
| `web` | `https://vants.vants.workers.dev` responde 200 con contenido VANTS | **critical** (→ DOWN) |
| `worker_faceit` | `/healthz` del webhook worker (v2) | error |
| `launcher` | última release de GitHub: instalador `.exe` + `latest.yml` + versión coherente + borradores sin publicar (cadena auto-update del HUB) | error |
| `workflows` | último run de cloudflare-deploy, neon-migrate, desktop-electron, faceit-xp, tests (clasifica por **ruta** del workflow, no por nombre) | warn |
| `neon` | web_events pendientes, FACEIT sin procesar, cola de matchmaking, incidentes abiertos (solo con acceso a datos) | error |
| `matchmaking` | `/healthz` del matchmaking-service (opcional, con `URLS_MATCHMAKING`) | warn |
| `vercel_deploy` | último deploy de `main` en Vercel (`GET /v6/deployments`): `READY` ok · `BUILDING`/`QUEUED` aviso · `ERROR`/`CANCELED` fallo, con `uid`, `sha` y URL del log en `datos`. Sin `VERCEL_TOKEN` → **omitido** | error |

## 3. Lo que hace solo (acciones con guarda anti-bucle)

Cada acción automática se ejecuta **una sola vez por commit/run** (guarda
persistida en `agent_events` con `dedupe_key`); si vuelve a fallar, el agente
re-intenta en el siguiente ciclo. Sin `GITHUB_TOKEN` las acciones quedan
propuestas, nunca a medias:

| Situación | Acción | Mecanismo |
|-----------|--------|-----------|
| Web caída o `cloudflare-deploy` fallido | `redispatch_cloudflare` → re-lanza el deploy (1 vez por SHA) | workflow dispatch |
| `neon-migrate` fallido | `redispatch_neon_migrate` (1 vez por SHA) | workflow dispatch |
| Otro workflow fallido (desktop-electron, faceit-xp, tests) | `rerun_fallidos` (1 vez por run) | run re-run |
| Deploy de Vercel en `ERROR`/`CANCELED` | `redeploy_vercel` → `POST /v13/deployments` con `deploymentId` = uid fallido (mismo commit), **máx. 2 intentos por SHA** | API de Vercel |
| Cualquier otra cosa | incidente en Neon con `accion_sugerida` | el dueño decide |

## 4. La memoria (Neon, migración 25)

- **`agent_runs`** — cada ciclo: estado global, hallazgos JSON, acciones, resumen.
- **`agent_events`** — incidentes con `dedupe_key` (no se duplican; si un
  incidente resuelto reaparece se **reabre** y vuelve a notificar), severidad,
  acción sugerida, `notificado` para el puente de DMs.
- **`agent_comandos`** — órdenes del dueño en cola (ruta **Discord → Neon →
  agente → respuesta → DM**), sin necesidad de servidor encendido.
- Vista **`agent_resumen`** para paneles; interruptor `bot_settings.agente`.

## 5. Discord (canal de control, sin hosting de pago)

El mando del agente vive en la **Neon Function `vantsbot`**
(`neon-functions/vantsbot`, desplegada gratis por CI): atiende los comandos
`/agente` vía el **Interactions endpoint** de Discord (firma Ed25519, sin
Gateway ni proceso residente) y entrega los **DMs del puente** leyendo
`agent_events` / `agent_comandos` de Neon (`/tarea`, disparada por
`agente.yml` tras cada ciclo). El bot Python VANTCALL sigue funcionando para
los comandos de comunidad cuando el dueño lo enciende, pero **ya no es
necesario para controlar el agente** — nada de Railway/Render.

- **DMs automáticos**: incidentes nuevos/reabiertos de severidad
  warn/error/critical + respuestas a sus órdenes.
- **Comandos** (registrados como comando global por `/setup`):
  - `/agente estado` — último ciclo + incidentes abiertos (embed con colores).
  - `/agente informe` — diagnóstico completo.
  - `/agente incidentes` — lista numerada.
  - `/agente resolver <id>` — cierra un incidente.
  - `/agente comando <texto>` — orden libre; queda en cola en Neon y la
    respuesta llega por DM tras el próximo ciclo.
- **Eventos de la app de Discord** (punto de conexión del Developer Portal →
  `https://vants.vants.workers.dev/api/discord/events`, ya configurado):
  el **Worker** verifica la firma Ed25519 del portal y responde 204; cada
  evento (app autorizada/desautorizada, **entitlements = compras**,
  invitaciones de actividad, relaciones) se reenvía sin bloquear a
  `vantsbot POST /evento-discord`, que lo **guarda en `web_events`** (Neon,
  dedupe por `event_id`/sha256) y manda **DM al dueño** cuando es una compra
  o instalación (`ENTITLEMENT_CREATE/UPDATE`, `APPLICATION_AUTHORIZED`) si
  `DISCORD_BOT_TOKEN` está en el deploy. Cadena: Discord → Worker →
  vantsbot → Neon → DM, todo 0 EUR.
- Si **Discord no funciona**: la memoria queda íntegra en Neon, el workflow
  publica el resumen en GitHub, y si el dueño crea el secret
  `VANTS_DISCORD_WEBHOOK` el propio ciclo avisa a un canal. Nada se pierde.

## 6. La capa de IA — MODO AGÉNTICO (GLM con function calling)

El cerebro **siempre** entiende órdenes en español sin depender de nadie
(NLU local, 0 dependencias): `estado`, `informe`, `revisa todo`,
`despliega la web`, `migraciones`, `incidentes`, `resuelve 12`, `ayuda`.

Pero desde v2, si se enchufa una API OpenAI-compatible **con tools**, el agente
funciona en **MODO AGÉNTICO REAL**: GLM recibe el catálogo de herramientas
(`services/agent-service/herramientas.js`) y **él mismo decide cuáles ejecutar y
en qué orden**, encadenándolas hasta responder con datos reales (nunca inventados).

```
Tú (Discord):   "mira cómo está todo y cierra el incidente si ya se arregló"
GLM:            → llama a estado()  → ve el incidente #3  → llama a resolver(3)
                → "Estado UP. Cerré el #3. Todo en orden (5 chequeos OK)."
```

Herramientas expuestas al modelo (envuelven 1:1 el núcleo, cero duplicación):
`estado` · `informe` · `incidentes` · `resolver(id)` · `ciclo` ·
`desplegar_web` · `migrar` · `ayuda`.

Protecciones del bucle agéntico: máximo **5 pasos** (`MAX_PASOS`) y una última
llamada forzada sin tools para cerrar la respuesta; si la API falla o no hay
key, el núcleo cae al modo reglas (degradación elegante, nunca se queda mudo).

| Variable | Ejemplo |
|----------|---------|
| `AGENT_LLM_KEY` | la key del proveedor (Z.ai → API Keys). **Basta con ella**: sin URL se usa la global `https://api.z.ai/api/paas/v4` |
| `AGENT_LLM_URL` | (opcional) `https://open.bigmodel.cn/api/paas/v4` si la key es de CN · `https://api.openai.com/v1` · `http://localhost:11434/v1` (Ollama) |
| `AGENT_LLM_MODEL` | `glm-4.5-flash` por defecto (rápido/económico) · `glm-5.3 (si tu cuenta tiene cuota)` máxima calidad |

Funciona igual en local (`node cli.js comando "..."`), en el servicio HTTP
(`POST /api/v1/comando` → `via: "llm-herramientas"`) y en Discord
(`/agente comando ...` → cola en Neon → el ciclo lo ejecuta agénticamente).
Para CI: añadir `AGENT_LLM_URL` y `AGENT_LLM_KEY` como secrets de GitHub
(`AGENT_LLM_MODEL` opcional) y el ciclo programado ya piensa con GLM.

## 7. Uso rápido

```bash
# Local (sin credenciales → memoria RAM, acciones propuestas)
cd services/agent-service && npm install
node cli.js ciclo                 # vigilancia completa
node cli.js estado                # último estado
node cli.js informe               # diagnóstico legible
node cli.js comando "despliega la web"

# Servidor de control (respuesta instantánea para el bot)
node --env-file=.env server.js    # :8082

# CI: manual desde GitHub → Actions → "AGENTE VANTS · vigilancia y control"
#     (modo ciclo | informe | comando con texto libre)

# Tests
node scripts/test_agente.js       # 83 asserts (incluye Vercel con API falsa)
```

## 8. Variables de entorno (`services/agent-service/.env.example`)

`PORT` (8082) · `ALLOW_ORIGIN` · `AGENT_TOKEN` (auth Bearer de la API) ·
`DATABASE_URL` (memoria Neon; si falta → RAM) · `URLS_WEB` / `URLS_WORKER_FACEIT`
/ `URLS_MATCHMAKING` · `GITHUB_TOKEN` + `GITHUB_REPOSITORY` (acciones) ·
`AGENT_LLM_URL` / `AGENT_LLM_KEY` / `AGENT_LLM_MODEL` (IA opcional) ·
`VERCEL_TOKEN` + `VERCEL_TEAM_ID` / `VERCEL_PROJECT_ID` / `VERCEL_PROJECT_NAME`
(Vercel; team y proyecto traen por defecto los de `vants`).

En CI el workflow ya inyecta `GITHUB_TOKEN` (permiso `actions: write`) y
resuelve `DATABASE_URL` con `NEON_API_KEY` — no se necesita ningún secret
nuevo para el modo básico.

## 9. Canal Discord con Neon Functions (para el dueño, ~2 min)

El bot de control corre como **Neon Function `vantsbot`** — gratis, sin
Railway/Render y desplegada automáticamente al hacer push (workflow
`Neon · deploy de funciones`). Solo falta conectar tu app de Discord:

1. **Secrets del repo** (https://github.com/feispla/Vants/settings/secrets/actions):
   - `DISCORD_BOT_TOKEN` — el token del bot que ya conectaste
     (Discord Developer Portal → tu app → Bot → Reset Token).
   - `DISCORD_PUBLIC_KEY` — la *Public Key* de la app (portal → General
     Information). Con estos dos, el workflow ya registra `/agente` global
     y activa los DMs (`VANTS_BOT_SECRET` ya está creado; `SUPERVISOR_DM_ID`
     es opcional, por defecto es tu id).
2. **Interactions Endpoint URL** (portal → General Information): pega
   `https://br-sweet-shape-b42xhogj-vantsbot.compute.c-6.us-east-2.aws.neon.tech/`
   y **Save** (Discord envía un PING; la función lo responde).
3. Listo: `/agente estado` en Discord funciona aunque el bot Python esté
   apagado, y los DMs del agente llegan tras cada ciclo de vigilancia.
   Verificación técnica en cualquier momento: `GET .../salud` y el paso
   "Verificación vantsbot" del workflow de deploy.

El bot Python (`bot/`) queda como refuerzo opcional para comandos de
comunidad (perfil, torneos, moderación) cuando quieras tenerlo encendido;
para el control del agente ya no hace falta ningún host.

## 10. SANDBOX AGENT — almacenes de memoria autoalojados (migración 26)

El agente ya no solo vigila: **recuerda, guarda ficheros y ejecuta código** en
una sandbox autoalojada, sin servicios de pago (nada de Railway/Render).

### Dónde vive todo (0 €)
| Almacén | Motor | Qué guarda |
|---------|-------|------------|
| Memoria semántica | Neon `agent_memoria` | hechos, aprendizajes y preferencias (clave única, importancia 1-5, expiración opcional) |
| Memoria episódica | Neon `agent_runs` | cada ciclo: qué vio, qué decidió, qué hizo (migración 25) |
| Disco de la sandbox | Neon `agent_archivos` | informes, notas y scripts del agente (hasta 256 KB por fichero, sha256, upsert por ruta) |
| Auditoría de ejecución | Neon `agent_sandbox_execs` | cada comando ejecutado: exit, salida, duración (poda > 7 días) |
| Ejecución | Runner efímero de GitHub Actions (o local) | la "máquina" de la sandbox: VM desechable, sin estado |

### Las 7 herramientas nuevas que GLM puede usar
`memoria_guardar(clave,valor,tipo,importancia)` · `memoria_buscar(consulta)` ·
`memoria_olvidar(clave)` · `archivo_guardar(ruta,contenido)` ·
`archivo_leer(ruta)` · `archivo_listar(prefijo)` · `sandbox_exec(comando)`.

El catálogo completo del cerebro pasa de 8 a **15 herramientas**; el modo reglas
(sin key GLM) también entiende las órdenes básicas: `recuerda X = Y`,
`¿qué recuerdas de X?`, `olvida X`, `lista archivos`, `lee el archivo X`,
`ejecuta "node -v"`.

### Seguridad de `sandbox_exec` (defensa en profundidad)
1. **Allowlist** por segmento de pipeline: solo lectura y diagnóstico
   (`node`, `npm test`, `python3`, `ls`, `cat`, `grep`, `awk`, `jq`, `df`...).
2. **Denylist dura**: `rm -rf`, `sudo`, `ssh`, `git push`, `npm publish`,
   `curl -X POST`...
3. Prohibidos: varios comandos (`;` `&&`), sustituciones (`` ` `` `$()`),
   redirecciones (`>` `<`) y **cualquier string que parezca un secreto**.
4. Timeout (10 s por defecto, 30 s máx) + salida recortada a 32 KB.
5. Todo queda auditado en `agent_sandbox_execs` (Neon), nunca en RAM sola.

### API nueva (con `AGENT_TOKEN` si está definido)
- `GET /api/v1/memoria?q=texto` → busca recuerdos
- `POST /api/v1/memoria {clave,valor,tipo,importancia}` → guarda (creado_por: dueno)
- `GET /api/v1/archivos?prefijo=informes/` → lista el disco de la sandbox

## 11. Vercel — vigilancia, redeploy y disparo inmediato

Vercel no tiene agente propio; el Agente VANTS lo trata igual que Cloudflare y
Neon. Tres piezas:

1. **Chequeo `vercel_deploy`** (`chequeos.js`) — cada ciclo lee los últimos 5
   deploys del proyecto y se queda con el último de `main`/production.
   `READY` → ok · en curso → aviso · `ERROR`/`CANCELED` → fallo. El hallazgo
   trae `datos.uid`, `datos.sha`, `datos.estado` y `url` (inspector del deploy):
   la fila Vercel del resumen (GitHub Summary y embed de Discord) sale con
   estado + enlace `[ver](…)`.
2. **Acción `redeploy_vercel`** (`acciones.js`) — `POST /v13/deployments?teamId=…`
   con `{ name: "vants", deploymentId: <uid fallido>, target: "production" }`
   (redeploy del mismo commit). Guarda anti-bucle como `redispatch`: claves
   `redeploy_vercel:<sha>:1` y `:2` en `agent_events`, así que como máximo se
   re-lanza **dos veces por SHA**; al tercer fallo queda solo el incidente
   (`accion_sugerida: redeploy_vercel`) para el dueño. Fail-safe: sin memoria
   no se ejecuta. `cerebro.js` la dispara en automático cuando `vercel_deploy`
   está en fallo y trae `uid`.
3. **Disparo inmediato** — Vercel → *Project → Settings → Webhooks* apuntando a
   `https://vants.vants.workers.dev/api/vercel/webhook` (eventos
   `deployment.error` y `deployment.canceled`). El Worker verifica
   `x-vercel-signature` (HMAC-SHA1 del cuerpo con `VERCEL_WEBHOOK_SECRET`),
   filtra por proyecto y hace `repository_dispatch` (`event_type:
   vercel_deploy`) en GitHub con `GH_DISPATCH_TOKEN`; `agente.yml` escucha
   `on.repository_dispatch: types: [vercel_deploy]` y corre un ciclo al
   momento (el `client_payload` con uid/sha/url queda en el log del job). Sin
   webhook, el cron de 30 min lo cubre igual.

### Lo que configura el dueño (una vez)

| Dónde | Secreto | Para qué |
|-------|---------|----------|
| GitHub → Settings → Secrets → Actions | `VERCEL_TOKEN` (token de Vercel con acceso al team) | chequeo + redeploy. Opcional: `VERCEL_TEAM_ID`, `VERCEL_PROJECT_ID` si cambian |
| Cloudflare → Worker `vants` → Settings → Variables (secret) | `VERCEL_WEBHOOK_SECRET` (el que muestra Vercel al crear el webhook) | verificar la firma del webhook |
| Cloudflare → Worker `vants` → Settings → Variables (secret) | `GH_DISPATCH_TOKEN` (PAT *fine-grained*, solo este repo, permiso **Contents: read/write**) | `repository_dispatch` |
| Vercel → Project → Settings | Root Directory `.`, Framework `Other`; `vercel.json` ya fija `buildCommand`/`installCommand` = `echo skip`, `outputDirectory` = `.` y cache `immutable` para `/_astro/` y `/assets/*?v=` | que el deploy estático no falle |

Sin `VERCEL_TOKEN` el chequeo sale `omitido` y la acción queda propuesta; sin
los dos secretos del Worker el endpoint responde `503` y no hace nada.

### Verificación recomendada
1. Forzar un deploy fallido (preview con build roto o cancelar uno desde el
   dashboard) → el webhook dispara `agente.yml` → el hallazgo `vercel_deploy`
   sale en fallo, `redeploy_vercel` se ejecuta **una** vez para ese SHA y el
   embed de Discord muestra la fila Vercel con el enlace al deploy.
2. Un push normal a `main` → check de Vercel ✅ con preview URL y el ciclo
   siguiente marca `vercel_deploy: ok`.

