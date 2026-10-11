# VANTS web 0.2.0

Segunda entrega de la nueva web (Vue 3 + Vite).

## Qué hay de nuevo
- **Ranked** y **Torneos** ya viven en la web nueva.
- Nuevo diseño inspirado en FACEIT: barra lateral, banner de inicio y tarjetas de modos.
- **Versión móvil**: barra inferior con iconos y barra superior con acceso a la cuenta.

## Antes de publicar
1. Comprueba que `web/` compila (`npm ci && npm run build`) y que pasan `npm test` y `npm run test:e2e`.
2. Añade la URL de publicación a Allowed Callback URLs y Logout URLs de la app de Auth0.
3. En GitHub: Releases > Draft a new release, tag `web-v0.2.0`, rama destino `main`, y pega este texto.
