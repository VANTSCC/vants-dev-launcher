# Content Island — secciones de contenido dinámico servidas como islas hidratadas

> El patrón que usa la home compilada (`webapp/`): HTML estático + componentes interactivos
> que se hidratan por separado en el navegador. Estaba referenciado en las tablas del
> proyecto como "pendiente de documentar"; este documento cierra ese hueco.

## Qué es

Una **isla de contenido** es una sección de la página que necesita interactividad (un panel
explorable, un canvas 3D) y se entrega como un componente de framework que Astro compila y
**hidrata de forma aislada**, mientras el resto de la página sigue siendo HTML estático puro.
En VANTS la home vive en `webapp/` (Astro 7, `output: 'static'`, integradores oficiales
`@astrojs/react` y `@astrojs/vue`) y se despliega a **Cloudflare Workers**: no hay SSR en
producción, el Worker sirve el HTML compilado y las islas hidratan client-side.

## Por qué

- **SEO del shell estático**: el HTML llega compilado y indexable; el framework es un
  detalle de implementación invisible para el crawler.
- **Interactividad aislada**: cada isla hidrata por su cuenta (una 3D pesada no bloquea al
  resto; si una falla, la página sigue funcionando).
- **Bundles por isla**: `astro build` genera un JS con hash por componente (`_astro/*.js`);
  el navegador solo descarga el JS de las islas que la página usa.

## Cómo funciona (archivo → isla → bundle → deploy)

1. El componente vive en `webapp/src/components/` (`Explore.tsx` en React,
   `Emblema3D.vue`/`IntroJett.vue` en Vue 3.5 + Three.js 0.186).
2. `webapp/src/pages/index.astro` lo importa y elige la directiva de hidratación
   (`client:load`, `client:only="vue"`, `client:visible`…).
3. `npm run build` (en `webapp/`) produce `dist/` con el HTML y los bundles con hash en
   `_astro/`; `scripts/build-webapp.mjs` los copia a los 3 árboles del espejo
   (raíz / `public/` / `vants-server/public/`).
4. Commit de `index.html` + `_astro/` → `cloudflare-deploy.yml` publica; el Worker los
   sirve tal cual. CI (`fullstack.yml`) gatea `astro check`, el build y la sincronía del
   espejo (`build-webapp.mjs --check`, hash de contenido).

## Estado actual (en producción)

| Isla | Archivo | Framework | Hidratación | Bundle |
|---|---|---|---|---|
| Explorador EXPLORAR | `webapp/src/components/Explore.tsx` | React 19 | `client:load` | `_astro/Explore.ZD4a5hKY.js` |
| Emblema 3D | `webapp/src/components/Emblema3D.vue` | Vue 3.5 + Three | `client:only="vue"` | `_astro/Emblema3D.Cq3vLdgo.js` |

> Actualización (2026-10-20, `cd7f9f1`): la isla **Intro Jett** (`IntroJett.vue`, bundle
> `_astro/IntroJett.DejkFndp.js`) quedó RETIRADA del home (sin `<div class="hero-dock">` ni
> `client:only` en `index.astro`/`Hero.astro`); el componente permanece en el árbol sin usar.
> Los hashes de la tabla corresponden al build vigente (reproducible byte a byte).

Verificación: `astro check` 0 errores y el build reproduce bundles **byte-idénticos** a los
commiteados.

## Cómo añadir una isla nueva (tomando `Explore.tsx` como ejemplo)

1. **Crea el componente** en `webapp/src/components/` con su estado y datos propios
   (`Explore.tsx` define sus categorías como constantes tipadas y no pide nada a red).
2. **Impórtalo en `index.astro`** y elige directiva: `client:load` si es contenido principal
   (como EXPLORAR), `client:only="vue"` si toca `window`/WebGL antes de montar (caso de las
   islas 3D), `client:visible` si está bajo el pliegue.
3. **Compila y sincroniza**: `npm run build` en `webapp/` y luego
   `node scripts/build-webapp.mjs`; commitea el `index.html` y los `_astro/*.js` nuevos
   (nunca se editan a mano).
4. **Convivencia con el menú legado**: si la isla comparte zona con el hero/menú, respeta el
   guard `data-explore="react"` de `menu-preview.js` (o añade el equivalente) para que ningún
   script legado pise su panel; CI valida el espejo ×3 con `build-webapp.mjs --check`.
