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
| `AGENT_LLM_URL` | `https://api.z.ai/api/paas/v4` (GLM global) · `https://open.bigmodel.cn/api/paas/v4` (GLM CN) · `https://api.openai.com/v1` · `http://localhost:11434/v1` (Ollama) |
| `AGENT_LLM_KEY` | la key del proveedor (Z.ai → API Keys) |
| `AGENT_LLM_MODEL` | `glm-5.3-flash` por defecto (rápido/económico) · `glm-5.3` máxima calidad |

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
node scripts/test_agente.js       # 61 asserts
```

## 8. Variables de entorno (`services/agent-service/.env.example`)

`PORT` (8082) · `ALLOW_ORIGIN` · `AGENT_TOKEN` (auth Bearer de la API) ·
`DATABASE_URL` (memoria Neon; si falta → RAM) · `URLS_WEB` / `URLS_WORKER_FACEIT`
/ `URLS_MATCHMAKING` · `GITHUB_TOKEN` + `GITHUB_REPOSITORY` (acciones) ·
`AGENT_LLM_URL` / `AGENT_LLM_KEY` / `AGENT_LLM_MODEL` (IA opcional).

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
