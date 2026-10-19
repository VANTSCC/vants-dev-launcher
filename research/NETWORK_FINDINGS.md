# NETWORK_FINDINGS — Red, recursos y proveedores de la referencia

Verificado 2026-10-19 con el registro de red del navegador (carga real de la página pública).
Solo se registran hechos observables; nada de esto se usó para eludir controles ni acceder a
datos privados.

## 1. Framework y entrega

| Evidencia | Conclusión | Confianza |
|---|---|---|
| Recursos bajo `/_next/static/chunks/…` y `_next/static/css/…` | Next.js (React) | VERIFICADO |
| Chunk `pages/tournaments/[[...index]]-….js` y `pages/tournament/archive/[[...game]]-….js` | Pages Router con rutas catch-all para torneos y archivo | VERIFICADO |
| `_buildManifest.js` + `_ssgManifest.js`; campo `__N_SSG: true` en el JSON de datos | Renderizado estático (SSG) con datos `/_next/data/…json` | VERIFICADO |
| `site.webmanifest` cargado | PWA/manifest básico | VERIFICADO |

## 2. APIs de datos observadas (públicas, desde el cliente)

- `GET https://www.strafe.com/_next/data/2L2CkMHeoCaQVTifD6ERB/es/tournaments/csgo/upcoming.json?index=csgo&index=upcoming`
  → 200, JSON SSG con `pageProps.tournaments[]` (modelo en `REFERENCE_ANALYSIS.md` §5). VERIFICADO.
- Precarga del mismo JSON para los 10 juegos (`lol`, `dota2`, `valorant`, `r6s`, `cod`,
  `rocketleague`, `sc2`, `overwatch`, `hearthstone`) — prefetch del router Next.js. VERIFICADO.
- `POST https://flask-api.strafe.com/graphql` — API GraphQL propia de Strafe para datos vivos.
  Solo se observa su existencia (dominio + verbo); no se inspeccionaron queries internas ni se
  intentaron consultas no públicas. VERIFICADO (existencia) / DESCONOCIDO (esquema).
- `GET https://www.strafe.com/api/betting_brands/es` → 200 (contenido de apuestas). VERIFICADO.

## 3. Imágenes y CDN

- Logos y banners de torneos: **Cloudinary** (`res.cloudinary.com/strafe/image/upload/abios/events/…`),
  variantes `square` (logo) y `large` (banner). VERIFICADO.
- Iconos de juegos: SVG self-hosted `/static/images/sports/{csgo,lol,dota2,valorant,r6s,cod,rocketleague,sc2,overwatch,hearthstone}.svg`. VERIFICADO.
- Fondos por juego: WebP `/static/images/sports/page-bg/{juego|default}.webp`. VERIFICADO.

## 4. Fuentes

- `GothamNarrow-{Book,Medium,Bold,Black,Ultra}.woff2` self-hosted en `/fonts/`. VERIFICADO.
- Fuente propietaria → VANTS usa sustituta libre **Barlow Semi Condensed** (ya en producción). DECISIÓN.

## 5. Analítica y publicidad (lo que VANTS NO replica)

- Google Tag Manager / GA4 (`googletagmanager.com`, `google-analytics.com/g/collect`), Google Ads
  (`doubleclick.net`), NitroPay (`floors.nitropay.com`), Google reCAPTCHA. VERIFICADO como
  presentes en Strafe. VANTS no incorpora ninguna de estas redes en esta misión.

## 6. Implicaciones para la arquitectura VANTS

| Strafe | VANTS (adaptación al entorno real) |
|---|---|
| Next.js SSG + JSON `_next/data` | Worker Cloudflare sirve HTML estático espejado ×3 + API JSON propia (`/api/…`) — sin cambio de framework (ver `DECISIONS.md` D3) |
| GraphQL flask-api.strafe.com | API REST JSON en el Worker sobre Neon Postgres (convenciones de la casa: `{ok,data}`) |
| Cloudinary para imágenes | Sin CDN de pago: logos por juego propios en `/assets/brand` + placeholders locales; URL de logo opcional por torneo |
| Precarga de todos los juegos | `fetch` bajo demanda por juego/estado + caché `Cache-Control` corta (sin coste de ancho de banda significativo en Workers) |
| GA/Ads/reCAPTCHA | No se incorporan (privacidad y coste 0) |
