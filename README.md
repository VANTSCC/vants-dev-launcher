# VANTS GAMES — Arena competitiva

Web de torneos de VALORANT y CS2: partidos en vivo, ranking, bracket, pase de
temporada, login con **Auth0** y datos en **Neon**. Despliegue automático en
**GitHub Pages**.

**Web:** https://feispla.github.io/Vants/

## Estructura

```
├── index.html            ← LA WEB (VANTS GAMES): arena completa, login, pase
├── 404.html              ← página 404 (autónoma)
├── sw.js                 ← stub de migración: elimina el service worker de la
│                            web antigua y sus cachés en los visitantes
├── robots.txt, sitemap.xml, netlify.toml, .nojekyll, .well-known/
├── assets/
│   ├── js/arena.js       ← motor de la arena (simulador live, bracket, pase,
│   │                        perfiles, insignias — SVG propios)
│   ├── js/arena-live.js  ← capa viva: Auth0 (login) + torneos reales de Neon
│   ├── js/auth0-config.js← Auth0 SPA SDK + cliente PostgREST de Neon
│   │                        (window.VantAuth0 / window.VantDB)
│   ├── css/arena.css     ← estilos de la arena
│   └── brand/            ← logos y assets de marca
├── docs/CONFIGURACION.md ← dónde va cada clave (Auth0, Neon, bot)
├── vants-server/         ← servidor Node: web + bot de Discord
│                            (POST /api/discord/notify)
├── bot/                  ← bot ORION de Discord (Python)
├── neon-functions/       ← vantsdata (proxy público), steam-login,
│                            discord-notify, stripe-webhook
├── desktop/, android/    ← wrappers de escritorio y móvil
└── .github/workflows/    ← android-build, desktop-build
```

> La web antigua (SPA oscura + páginas SEO) fue eliminada del repo a petición
> del propietario. Todo sigue recuperable desde el historial de git.

## Login

`auth0-config.js` inicializa Auth0 SPA SDK y expone `window.VantAuth0`;
`arena-live.js` monta el botón ENTRAR → Universal Login de Auth0 y procesa el
retorno en la raíz. Las conexiones (Google, Discord, GitHub, Kick, correo) se
activan en el panel de Auth0 — guía y errores comunes en
**docs/CONFIGURACION.md**. La sesión se comparte por `localStorage`.

## Datos (Neon)

Sin sesión, las lecturas pasan por el proxy público `vantsdata`; con sesión,
directo a la Data API con el JWT. Si la tabla `tournaments` tiene filas, la
arena sustituye la demo por torneos reales y enciende el chip
"DATOS EN VIVO · NEON".

## Vista previa local

```bash
python -m http.server 8788     # → http://localhost:8788
```

O abre `index.html` directamente (doble clic): todo el diseño funciona, solo
el login real requiere un servidor o el dominio publicado.
