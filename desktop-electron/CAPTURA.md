# CAPTURA DE TRÁFICO · VANTS

Modo diagnóstico del lanzador para **ver y exportar todo el tráfico de red del HUB**.
Cubierto al 100% porque el HUB concentra toda su red en el proceso principal:

| Capa | Tráfico | Cómo se captura |
|---|---|---|
| Proceso principal (`main.js`) | Auth0 (`/oauth/token`, `/userinfo`), Neon REST (`/players`, `/presence`, todo lo que sale por `hub:api`), latido de presencia | `fetchMedido()` envuelve cada `fetch()` con tiempos, cabeceras, cuerpos y errores |
| Renderer + ventanas de login | imágenes (avatares, portadas), páginas de Auth0 en la ventana embebida | CDP `webContents.debugger` (dominio `Network`) |

El resultado se exporta en **HAR 1.2** (estándar HTTP Archive), abrible en:
Chrome DevTools (pestaña *Network* → *Import HAR*), Charles, Fiddler, mitmweb
o cualquier visor HAR.

---

## 1. Uso rápido (Windows)

### Opción A · Interruptor en la bandeja (sin consola)
1. Abre VANTS.
2. Clic derecho en el icono de la bandeja → **● Capturar tráfico (HAR)**.
3. Usa el HUB con normalidad (login, partidos, biblioteca…).
4. Clic derecho → **■ Detener captura de tráfico**.
5. El archivo se guarda en: `%APPDATA%\VANTS\captures\`
   — mientras capturas, `captura-en-curso.har` se refresca cada 30 s
   (si el proceso muere, no se pierde nada) y al **detener** queda el
   definitivo `captura-<fecha>.har`.
   (o usa **Abrir carpeta de capturas** en el mismo menú).

> Nota: la detención automática al cerrar el HUB también guarda el archivo,
> así que aunque te olvides de detenerla no pierdes la captura.

### Opción B · Desde consola (recomendada para depurar)
```bat
cd desktop-electron
npm install
npx electron . --captura
```
La captura arranca sola al abrir el HUB y se guarda al cerrarlo.

### Opción C · Con proxy externo (mitmproxy / Fiddler / Charles)
Para inspeccionar en vivo y reescribir peticiones contra **tu propia API**:
```bat
:: 1) arranca tu proxy, p. ej. mitmproxy en el puerto 8080
mitmweb --listen-port 8080

:: 2) abre el HUB enrutado por ese proxy
npx electron . --captura --proxy-server=http://127.0.0.1:8080
```
- `--proxy-server` también acepta `socks5://` y dominios; se aplica a TODO el
  tráfico Chromium (renderer incluido) y al `fetch` del proceso principal
  (Node respeta el proxy del sistema; en mitmproxy verás ambas capas).
- Para excluir dominios: `--proxy-bypass-list="*.auth0.com;localhost"`.
- Si tu proxy hace HTTPS con certificado propio (mitmproxy), instala su CA
  (`http://mitm.it`) en el almacén de Windows **usuario o máquina**; Chromium la
  usará automáticamente. Este paso es solo para depurar el HUB en tu equipo.

### Opción D · Sin redacción de tokens (solo en tu máquina)
Por defecto el HAR viene **saneado**: `Authorization`, `Cookie`, `Set-Cookie`,
`access_token`, `refresh_token`, `id_token`, `code_verifier` y `code` salen como
`[REDACTADO]`. Si necesitas verlos para depurar el flujo OAuth completo:
```bat
npx electron . --captura --captura-sin-redaccion
```
⚠️ Ese archivo contiene tokens vivos: no lo subas al repo ni lo compartas.
(Caduca solo, pero bórralo tras usarlo: `%APPDATA%\VANTS\captures\`.)

---

## 2. Qué verás en el HAR

- Cada petición con `startedDateTime`, duración (`time`), cabeceras y queryString.
- **Cuerpos** de las respuestas JSON/texto (tope 256 KB por cuerpo) → puedes leer
  las respuestas de tu API de Neon directamente en el visor.
- **Cuerpos** de las peticiones POST (incluye el exchange de Auth0).
- Los fallos de red aparecen con `status: 0` y el motivo en `content.text`
  (útil para diagnosticar caídas de Neon, refresh de token fallido, etc.).
- Campo extra `_origen`: `main` (proceso principal) o `renderer` — te dice de
  qué capa salió cada petición.
- Tope de 5000 entradas por sesión (se marca `Captura TRUNCADA` en el
  `comment` del HAR si se alcanza).

### Flujo típico de depuración
| Síntoma | Qué mirar en el HAR |
|---|---|
| Login no completa | `POST /oauth/token` → status y cuerpo del error de Auth0 |
| Datos que no cargan | peticiones a `ep-autumn-scene…neon.tech` → status 4xx/5xx y cuerpo |
| Presencia "fantasma" | `POST /presence` cada 60 s (falta `player_id`?) |
| Todo lento | ordena por `time` y busca esperas > 1 s en Neon |

---

## 3. Android (TWA)

La app Android **no tiene capa de red propia**: es una Trusted Web Activity que
abre la web en Chrome, así que el tráfico se captura desde el propio Chrome del
dispositivo de prueba, sin tocar el proyecto:

1. **`chrome://inspect`** (recomendado): en el PC abre `chrome://inspect#devices`,
   conecta el móvil por USB con *Depuración USB* activa y abre la TWA → las
   peticiones de la web aparecen en el inspector (Network → puedes exportar HAR
   desde el propio DevTools con ↓ → *Export HAR*).
2. **Proxy + CA de usuario** (para ver tráfico fuera del inspector): configura el
   proxy Wi-Fi del móvil hacia mitmproxy e instala su CA en
   *Ajustes → Seguridad → Cifrado y credenciales → Instalar certificado → CA*.
   Chrome confía en CAs de usuario (muestra un aviso); suficiente para depurar
   tu propia web en un dispositivo de prueba.
3. **Android Studio → Network Profiler** (vistas de socket por app) si prefieres
   perfilado nativo.

No hace falta recompilar la app Android para nada de esto.

---

## 4. Sobre los juegos (VALORANT / CS2)

El HUB lanza los juegos por su vía oficial (`steam://rungameid/…`,
`RiotClientServices.exe --launch-product=valorant`, `com.epicgames.launcher://…`).
Ese lanzamiento **no se toca**: VALORANT corre con Vanguard (anti-cheat a nivel
de kernel) y CS2 con VAC, que prohíben interceptar o inyectar en el proceso del
juego; además el tráfico de partida es UDP de baja latencia que un proxy HTTP no
cubre. La captura de este módulo es para el **tráfico del HUB y de la web
VANTS** (Auth0, Neon, estáticos), que es lo que se depura del lado de la
plataforma. Para métricas de partidas usa las fuentes ya integradas
(`vlr-results/`, `neon-functions/vantsdata`).

---

## 5. Referencia de flags y API

| Flag / acción | Efecto |
|---|---|
| `--captura` (o `--capture`) | inicia la captura al arrancar |
| `--proxy-server=<url>` | enruta el tráfico por ese proxy (se registra en el log al arrancar) |
| `--proxy-bypass-list=<lista>` | dominios excluidos del proxy, separados por `;` |
| `--captura-sin-redaccion` | guarda tokens y cookies reales en el HAR |
| Bandeja → *Capturar tráfico (HAR)* | inicia/detiene y guarda |
| Bandeja → *Abrir carpeta de capturas* | abre `%APPDATA%\VANTS\captures\` |
| (autoguardado) | `captura-en-curso.har` se refresca cada 30 s durante la captura |
| `window.vantsHub.captura('iniciar')` | API del renderer (preload) |
| `window.vantsHub.captura('detener')` | detiene, guarda y devuelve `{ archivo }` |
| `window.vantsHub.captura('carpeta')` | abre la carpeta de capturas |
| `window.vantsHub.captura()` | estado: `{ activa, entradas, ultimoArchivo, redactar, proxy }` |
| `window.vantsHub.onCaptura(cb)` | evento `hub:captura-estado` al iniciar/detener |

Mientras la captura está activa el debugger CDP queda asociado a cada ventana,
por lo que **DevTools no puede abrirse a la vez** (Chromium solo permite un
depurador); detén la captura si necesitas inspeccionar el DOM.
