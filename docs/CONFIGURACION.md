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
