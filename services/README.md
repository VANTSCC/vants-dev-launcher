# VANTS — Servicios backend (Node.js · Express + Fastify)

> Fase 2/4 del plan `docs/ARCHITECTURE.md`. Servicios Node independientes que
> complementan al Worker de Cloudflare. Decisión del dueño: **todos los
> servicios llevan `express` y `fastify` instalados** (`npm install express`
> + `npm install fastify`); cada servicio usa uno como servidor HTTP y deja el
> otro disponible para utilidades (p. ej. `fastify.inject` para tests de la
> app, o un router Express secundario).

## Servicios

| Servicio | Puerto | Framework | Estado | Responsabilidad |
|----------|--------|-----------|--------|-----------------|
| `api-gateway/` | 8080 | **Express** | ✅ base | Puerta única `/api/v1/*`, rate limit, status de servicios |
| `matchmaking-service/` | 8081 | **Fastify** | ✅ base (cola en memoria, Fase 4 la conecta a Neon) | Colas de partida, tickets, criterios |

## Cómo correr

```bash
cd services/api-gateway
npm install        # instala express + fastify
npm start          # http://localhost:8080/healthz

cd ../matchmaking-service
npm install
npm start          # http://localhost:8081/healthz
```

## Convenciones (obligatorias para NUEVOS servicios)

1. `package.json` con **express y fastify** en `dependencies` (decisión del dueño).
2. `GET /healthz` → `{ ok:true, service:"<nombre>", version, uptime }` siempre 200.
3. JSON en todas las respuestas; errores con forma `{ ok:false, error:{ message } }`.
4. Secretos por variables de entorno (`.env`), **nunca** en el repo (`.env.example` documenta).
5. Sin credenciales de Neon en el código; el acceso a DB llega en su fase vía connection string secreto.
6. CORS cerrado por defecto: `ALLOW_ORIGIN` define el origen permitido (por defecto `https://vants.vants.workers.dev`).
