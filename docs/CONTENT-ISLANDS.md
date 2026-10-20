# Content Islands — las islas interactivas de VANTS

> Patrón "Content Island" (isla de contenido): una página compila a HTML estático y solo
> los componentes interactivos se hidratan con su framework encima. HTML que se ve ya
> rendered + interactividad quirúrgica donde hace falta. Documentado el 20-oct (era el
> pendiente declarado del proyecto: el concepto se USABA pero no estaba escrito).

## Dónde vive el patrón en este repo

La compilación la hace **Astro 7** (`webapp/`), con integradores oficiales
`@astrojs/react` y `@astrojs/vue`. El HTML compilado + bundles se commitean al espejo ×3
(raíz / `public/` / `vants-server/public/`) y el Worker los sirve tal cual: **no hay SSR en
producción**, la home es estática y las islas hidratan en el navegador.

### 1. `webapp/src/components/Explore.tsx` — isla React
- Explorador de la arena con preview al hover.
- Integra Astro con `client:visible` (hidrata cuando entra en viewport).
- React 19. El guard `data-explore="react"` en `menu-preview.js` evita que el menú
  legado pise su panel `#hcPreview` (ver D15/auditoría: ese guard había llegado solo a
  la copia raíz del espejo — producción corría la versión vieja).

### 2. `webapp/src/components/Emblema3D.vue` — isla Vue + Three.js
- Emblema 3D de la marca: placa octogonal extruida + "V" roja de prismas, 3 luces,
  materiales metálicos y loop `requestAnimationFrame`.
- Vue 3 `<script setup lang="ts">` con Three.js puro (mismo motor que usa TresJS por
  debajo, sin la capa declarativa): el ciclo de vida de Vue (onMounted/onBeforeUnmount)
  es dueño del renderer y de su limpieza.
- Bundle compilado: `_astro/Emblema3D.BiCJqfOx.js` (commiteado y servido en producción).

### 3. `webapp/src/components/IntroJett.vue` — isla Vue + Three.js (intro)
- Intro 3D estilo Jett: kunai procedural que vuela al cargar y aterrizaje flotante en el
  hero (commit `33fafc2`, reskin MYKD).

## Reglas del patrón en VANTS

1. **El build es la fuente de verdad**: `npm run build` (en `webapp/`) →
   `node scripts/build-webapp.mjs` copia `index.html` + `_astro/` a los 3 árboles.
2. **Nada se edita a mano en los bundles** `_astro/` — se regeneran.
3. **El espejo ×3 se verifica en CI**: `fullstack.yml` corre
   `node scripts/build-webapp.mjs --check` (hash de contenido de los ~79 archivos
   espejados; exit 1 si hay drift — el drift de `menu-preview.js` ya causó un bug en
   producción).
4. **Compatibilidad con el menú legado**: cualquier asset JS nuevo que toque el hero o el
   menú debe respetar el guard `data-explore` (o el equivalente) para no pisar el panel de
   una isla ya hidratada.

## El mismo patrón en otros anfitriones (referencia)

- **Astro (este repo)**: `client:visible` / `client:load` sobre HTML compilado.
- **Next.js**: un componente cliente puede montar una isla de OTRO framework con
  `createApp`/`createRoot` en un `useEffect` (puente por `reactive()`/store externo).
  Demo funcional del patrón React→Vue usada para verificar este concepto: página
  "VANTS × VUE 3D" del sandbox de auditoría (isla Vue 3.5 + Three 0.186 dentro de
  Next.js 16, con controles que mutan un `reactive()` de Vue sin remontar).
- **Servido por el Worker**: el resultado siempre es HTML estático + bundles — el
  Worker no renderiza framework alguno.

## Verificación (evidencia)

- `astro check`: 0 errores / 0 warnings / 0 hints.
- `astro build` reproduce bundles **byte-idénticos** a los commiteados (auditoría 20-oct).
- 60 FPS sostenidos en el loop del emblema (verificado con navegador en el sandbox).
