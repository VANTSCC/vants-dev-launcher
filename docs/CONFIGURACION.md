# Configuración de VANTS — dónde va cada clave

Esta web funciona sin secretos en el código: el client id de Auth0 es público por
diseño (SPA) y las lecturas públicas de Neon pasan por el proxy `vantsdata`.
Cuando tengas las claves, van **aquí** (nunca en el repo):

---

## 1) Auth0 — login (Google, Discord, GitHub, Kick, correo)

**Tenant:** `vants.eu.auth0.com` · **Client ID SPA:** `oaOmNizh7HrASWfmfM29bN284IMJvqPG` (ya en `assets/js/auth0-config.js`)

En el panel de Auth0 → **Authentication → Social** activa/crea estas conexiones.
El código ya mapea los botones (`assets/js/auth.js` → `PROVIDER_CONNECTION`):

| Conexión Auth0 | Botón en la web | Claves que necesitas | Dónde se pegan |
|---|---|---|---|
| `google-oauth2` | «Continuar con Google» | Google Cloud OAuth Client ID/Secret | Auth0 → Social → Google |
| `discord` | «Continuar con Discord» | Discord App OAuth2 Client ID/Secret | Auth0 → Social → Discord |
| `github` | «Continuar con GitHub» | GitHub OAuth App Client ID/Secret | Auth0 → Social → GitHub |
| `kick` (custom) | «Continuar con Kick» | Client ID/Secret del OAuth de Kick | Auth0 → Social → Custom |

**URLs que deben estar permitidas en Auth0** (Applications → Settings):

- *Allowed Callback URLs*: `https://feispla.github.io/Vants/`, `http://localhost:8788/`
- *Allowed Web Origins* y *Allowed Logout URLs*: las mismas.

> Sin estas URLs el login redirige y Auth0 devuelve `origin not allowed`.

### Errores reales que verás en el login y qué significan

| Error en pantalla | Causa | Solución |
|---|---|---|
| `Callback URL mismatch. The provided redirect_uri is not in the list...` | La URL de retorno no está en *Allowed Callback URLs* | Añadir `https://feispla.github.io/Vants/` (con barra final) en Applications → VANTS INC → Settings → Allowed Callback URLs |
| `invalid_request — The connection is not yet configured. Please go to the database connections and setup your script.` | La app **no tiene ninguna conexión activa y funcional**: la conexión de base de datos por defecto no tiene script (o está rota) y no hay social habilitada | En Auth0: **Authentication → Social** → crear Google/Discord/GitHub (Client ID/Secret de cada proveedor) y en la pestaña **Applications** de cada conexión activar la app **VANTS INC**. Para el acceso por correo: **Authentication → Database → Username-Password-Authentication** → usar los scripts por defecto (no custom) y tenerla habilitada para la app. Comprobar en **Applications → VANTS INC → Connections** que las conexiones figuren activadas |

> Toda la web es una sola página (`index.html`):
> el login vuelve siempre a la raíz y `localStorage` propaga la sesión.

---

## 2) Neon — base de datos

- **Data API (PostgREST):** `https://ep-autumn-scene-b4opu2ip.apirest.c-6.us-east-2.aws.neon.tech/neondb/rest/v1`
  (lecturas con JWT de Auth0 en la cabecera de autenticación)
- **Proxy público** (función Neon `vantsdata`, lecturas sin sesión):
  `https://br-sweet-shape-b42xhogj-vantsdata.compute.c-6.us-east-2.aws.neon.tech/`

Ambas URLs viven en `assets/js/auth0-config.js` y `web/src/config.js`.

**Secretos de las Neon Functions** (`neon-functions/`) — se configuran en el
dashboard de Neon (Functions → tu función → Environment variables), no en git:

| Función | Variables |
|---|---|
| `vantsdata` | `DATABASE_URL`, `AUTH0_DOMAIN`, `AUTH0_AUDIENCE` |
| `steamlogin` | `DATABASE_URL`, `STEAM_API_KEY` (si se usa OpenID con datos) |
| `discord-notify` | `DISCORD_WEBHOOK_URL`, `DATABASE_URL` |
| `stripe-webhook` | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `DATABASE_URL` |

---

## 3) GitHub — despliegue

- **Web viva (raíz):** GitHub Pages en modo *Deploy from a branch* (`main` / root).
  Cada push a `main` dispara `pages build and deployment` automáticamente.
- **App Vue (`web/`):** `.github/workflows/deploy-web.yml` compila `web/` y publica
  `web/dist` cuando cambian archivos de `web/**` (requiere poner Pages en modo
  *GitHub Actions* el día que se publique esa iteración).
- **CI:** `.github/workflows/web-ci.yml` (tests de `web/`), más build de Android y desktop.

No se necesita ningún secreto para el deploy de la web viva.

---

## 4) Discord — bot

El bot (`bot/`) usa `bot/.env.example` como plantilla: copiar a `bot/.env`
(fuera de git) con el token del bot de Discord y la URL de la Data API de Neon.

---

## 5) Checklist rápido cuando pases las claves

1. Auth0 → Social: crear las 4 conexiones con sus Client ID/Secret.
2. Auth0 → Application VANTS: pegar las Allowed Callback/Web/Logout URLs de arriba.
3. Neon → Functions: rellenar las variables de entorno de la tabla.
4. Probar login en `https://feispla.github.io/Vants/` con cada proveedor.
5. Conectores de cuentas: correr `docs/migracion-links.sql` en el SQL Editor, crear la función
   `linker` (código en `neon-functions/linker/index.ts`) y pegar su URL en `LINKER_BASE`
   (`assets/js/auth0-config.js`). Detalle completo en la sección 6.

---

## 6) Conectores de cuentas (linker OAuth — Twitch, Kick, YouTube, TikTok, X, Riot, Steam, FACEIT)

En **Mi perfil → Cuentas conectadas**, cada fila tiene CONECTAR. El flujo real es:

1. **Auth0** identifica al jugador (el vínculo se guarda con el `sub` de su JWT).
2. **Neon** guarda el vínculo en la tabla `vants_links` (1 fila por jugador y plataforma,
   columna `verified`). La función OAuth corre como Neon Function **`linker`**.
3. **GitHub Pages** sirve la web; cada push a `main` publica el cambio.

El botón **CONECTAR** intenta el OAuth real de la red; si esa red todavía no tiene claves
en el servidor, ofrece **vínculo manual** (el jugador escribe su usuario y queda en Neon con
etiqueta `CONECTADO · MANUAL`; pasa a verificado cuando el OAuth lo confirme).

### 6.1) Pasos para dejarlo andando

1. **SQL Editor de Neon**: ejecutar `docs/migracion-links.sql` (crea `vants_links`,
   `vants_link_states` y la función `current_auth0_sub()`; RLS: lectura pública,
   escritura solo del dueño).
2. **Neon → Functions → crear función `linker`** y pegar el contenido de
   `neon-functions/linker/index.ts`. Variables de entorno obligatorias:

   | Variable | Valor |
   |---|---|
   | `DATABASE_URL` | cadena de conexión de Neon (la misma de las otras funciones) |
   | `AUTH0_DOMAIN` | `vants.eu.auth0.com` |
   | `AUTH0_AUDIENCE` | `https://api.vants.app` |
   | `AUTH0_CLIENT_ID` | `oaOmNizh7HrASWfmfM29bN284IMJvqPG` |
   | `VANTS_SITE_URL` | `https://feispla.github.io/Vants` |
   | `LINKER_URL` | **la URL pública de la propia función** (la muestra Neon al crearla; se usa como `redirect_uri`) |

3. **Pegar la URL de la función** en `LINKER_BASE` (`assets/js/auth0-config.js`) y subir a `main`.
4. **Por cada red** (solo si querés OAuth real en esa red): crear la app en su portal de
   developers, registrar como **callback** exactamente `<LINKER_URL>/api/link/callback`,
   y cargar sus claves como variables de entorno de la función `linker`:

   | Red | Variables de la función | Portal donde se crea la app |
   |---|---|---|
   | Twitch | `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET` | dev.twitch.tv/console |
   | Kick | `KICK_CLIENT_ID`, `KICK_CLIENT_SECRET` | kick.com/developers (pide aprobación) |
   | YouTube | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | console.cloud.google.com (habilitar YouTube Data API v3, crear cliente OAuth "Web") |
   | TikTok | `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET` | developers.tiktok.com (Login Kit) |
   | X | `X_CLIENT_ID`, `X_CLIENT_SECRET` | developer.x.com → User authentication settings (OAuth 2.0, Web App, PKCE) |
   | Riot | `RIOT_CLIENT_ID`, `RIOT_CLIENT_SECRET` | developer.riotgames.com (RSO) |
   | Steam | `STEAM_API_KEY` (opcional; OpenID no usa client) | steamcommunity.com/dev/apikey |
   | FACEIT | `FACEIT_CLIENT_ID`, `FACEIT_CLIENT_SECRET` | faceit.com/developers (pide aprobación del scope) |

   Mientras falte una clave, el diagnóstico lo dice exacto: abrir `<LINKER_URL>/` en el
   navegador y muestra por red `ok` o `falta <VARIABLE>`.

### 6.2) Detalles del flujo (por si hay que depurar)

- `POST <LINKER_URL>/api/link/start` con `Authorization: Bearer <JWT Auth0>` y
  `{platform, return_to}` → valida el JWT contra el JWKS del tenant, guarda un estado de
  un solo uso (15 min) en `vants_link_states` y responde `{url}` de autorización
  (con PKCE S256 donde la red lo soporta).
- La red vuelve a `<LINKER_URL>/api/link/callback?code&state` → la función intercambia el
  código, consulta el perfil real (handle, id, avatar), hace upsert verificado en
  `vants_links` y redirige a `https://feispla.github.io/Vants/?linked=<red>`.
- Steam usa OpenID 2.0 clásico: no necesita client, y `STEAM_API_KEY` solo agrega el nick real.
- Desconectar borra la fila en Neon (la web llama a la Data API con el JWT del jugador;
  RLS solo permite borrar la fila propia).

## 7) Pagos reales con Stripe (modo live)

La web vende **VANTS PRO** (4,99 €/mes · 39,99 €/año), **VANTS CREATOR**
(9,99 €/mes · 79,99 €/año), el **Pase Premium S4** (7,99 € pago único) y el
**fee de inscripción** de torneos. Todo se cobra en EUR con impuestos incluidos
(`tax_behavior=inclusive`) en la cuenta live `acct_1UHFf4EamHVhBbtr` (VANT, ES).

### 7.1) Variables de entorno en Neon

Cargar en **Neon → Functions → `stripecheckout` → Variables de entorno**:

| Variable | Valor |
|---|---|
| `STRIPE_SECRET_KEY` | Clave **live** `sk_live_...` o clave restringida `rk_live_...` con permiso *Checkout Sessions: Write* (Stripe → Developers → API keys). |
| `VANTS_SITE_URL` | `https://feispla.github.io/Vants` (para los return URLs). |
| `AUTH0_DOMAIN` / `AUTH0_AUDIENCE` / `AUTH0_CLIENT_ID` | Los mismos del linker (si el tenant no es el que está por defecto). |

> `DATABASE_URL` **no hay que configurarla**: Neon la inyecta automáticamente en
> toda función desplegada en una rama con Postgres (igual que `DATABASE_URL_UNPOOLED`).

Los IDs de precio live ya están dentro de `stripe-checkout/index.ts` y se pueden
sobreescribir con `STRIPE_PRICE_PRO_MO`, `STRIPE_PRICE_PRO_YR`,
`STRIPE_PRICE_CREATOR_MO`, `STRIPE_PRICE_CREATOR_YR` y `STRIPE_PRICE_PASE`.

Y en **Neon → Functions → `stripewebhook`**:

| Variable | Valor |
|---|---|
| `STRIPE_WEBHOOK_SECRET` | El `whsec_...` del endpoint (paso 7.2). Sin él la función **rechaza todo** (fail closed). |

> `DATABASE_URL` tampoco hace falta aquí (inyectada por Neon). Las variables se
> pueden cargar desde el dashboard (Functions → Variables de entorno) o por CLI:
> `neon deploy --env STRIPE_WEBHOOK_SECRET=whsec_...` (se fusionan con las ya
> existentes; una deploy no borra variables previas).

### 7.2) Endpoint de webhook en Stripe

1. Stripe Dashboard → **Developers → Webhooks → Add endpoint**.
2. URL del endpoint: la URL pública de la función `stripewebhook` (Neon →
   Functions → stripewebhook → pestaña URL). Se puede dejar la raíz: la función
   solo atiende `POST`.
3. Eventos a suscribir: `checkout.session.completed`, `invoice.paid`,
   `customer.subscription.deleted`.
4. Copiar el **Signing secret** (`whsec_...`) → variable `STRIPE_WEBHOOK_SECRET`.

### 7.3) Migración de base de datos

**Ya aplicada** (14-10-2026): el workflow `neon-migrate` aplicó
`db/migrations/05-pagos.sql` automáticamente al hacer push — crea `purchases`
(historial de pagos) y `entitlements` (lo que cada jugador tiene activo), con
RLS — la web solo puede leer los entitlements propios vía Data API. El webhook
escribe con la `DATABASE_URL` inyectada (rol dueño, ignora RLS). Idempotente:
se puede reaplicar sin efecto.

### 7.4) Cómo activar el modo real en la web

En `assets/js/auth0-config.js` poner la URL pública de la función de checkout:

```js
const CHECKOUT_BASE = 'https://<host-de-la-funcion-stripecheckout>';
```

- Mientras esté vacía: los pagos quedan en modo demostración (simulación
  original de `processPay`, sin cobro) — nada se rompe.
- Cuando se pone: los botones PAGAR / SUSCRIBIRME / DESBLOQUEAR abren el
  Checkout hosted de Stripe con el JWT de Auth0 (`client_reference_id` = sub),
  y el alta del plan la confirma el webhook (no el retorno a la web).

### 7.5) Verificación

- Abrir `<URL-de-stripecheckout>/` en el navegador: el diagnóstico dice qué
  variables faltan y si la clave es `sk_live_`.
- Probar un pago real pequeño (Pase S4, 7,99 €) y verificar en Stripe →
  Payments que aparece, y en Neon que la fila de `purchases` y el
  `entitlements` activo se crearon (`SELECT * FROM entitlements ORDER BY created_at DESC LIMIT 5;`).
- En Stripe → Webhooks verificar que el endpoint responde `200` y revisar
  "Latest attempts" ante cualquier fallo.
