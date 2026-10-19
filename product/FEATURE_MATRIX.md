# FEATURE_MATRIX — Funcionalidades × estado real

Estados: HECHA (verificada) · EN CURSO · PENDIENTE · FUERA (de alcance actual).
Evidencia = dónde se comprueba (test/smoke/captura).

| Funcionalidad | Prioridad | Estado | Evidencia / Lugar |
|---|---|---|---|
| Home estilo Strafe con tabs de estado | MUST | HECHA | T51, producción, `strafe-home.js` |
| Doble navegación + switch de juego | MUST | HECHA | T51 `strafe-shell.js`, `vants:game` |
| Ficha de torneo (estilo evento) | MUST | HECHA | T51 `torneo.html` (a conectar a API nueva) |
| Inscripción real a torneos | MUST | HECHA | `torneos.html` + `/api/torneos/inscribir` (T51 conserva) |
| Panel EN VIVO + partidas | MUST | HECHA | `arena-live.js` + `/api/en-vivo` |
| Ranking de jugadores | MUST | HECHA | `/ranking` + `/api/gpr` |
| Clips/Membresías/Tienda/Descarga HUB | MUST | HECHA | páginas + APIs existentes (T41-T51) |
| Auth Auth0 (login/cuenta) | MUST | HECHA | `arena.js` + auth0-config.js |
| **Rutas /es/tournaments/:juego/:estado** | MUST | EN CURSO | F6 esta misión |
| **Filtros por estado en URL (compartibles)** | MUST | EN CURSO | F6 |
| **API pública /api/games,tournaments,matches,teams,players,articles,search** | MUST | EN CURSO | F7 |
| **Migración 28 (entidades plataforma)** | MUST | EN CURSO | F7 |
| **EsportsDataProvider (demo + FACEIT)** | MUST | EN CURSO | F8 |
| **Equipos (página)** | MUST | PENDIENTE | F9 |
| **Noticias + ficha de artículo** | MUST | PENDIENTE | F9 |
| **Búsqueda global** | MUST | PENDIENTE | F9 |
| **Paginación en listados** | SHOULD | PENDIENTE | F7 |
| **Filtro por región** | SHOULD | PENDIENTE | F6-F7 |
| **JSON-LD evento (solo datos reales)** | SHOULD | PENDIENTE | F10 |
| SEO metas únicas + canonical + OG | MUST | PARCIAL | home T51 OK; resto por completar (F10) |
| sitemap.xml con rutas nuevas | MUST | PENDIENTE | F10 |
| hreflang es/en + i18n diccionario | MUST | PENDIENTE | F10 |
| Estados carga/vacío/error reutilizables | MUST | PARCIAL | empty en tabs T51; sistematizar (F5) |
| Skeleton de carga | MUST | PENDIENTE | F5 |
| Accesibilidad (foco/aria/teclado) | MUST | PARCIAL | enlaces nativos ya; auditoría F11 |
| Rate limit API lectura | MUST | PARCIAL | Worker ya filtra bots; API nueva F12 |
| Suite pruebas plataforma + E2E | MUST | PENDIENTE | F13 |
| Despliegue CI verificado en vivo | MUST | HECHA | método T50-T52 (curl+browser) |
| Documentación completa | MUST | EN CURSO | research/ y product/ y architecture/ esta misión |
| Modo claro configurable | COULD | FUERA | decisiones D6, alcance |
| RSS de noticias | COULD | FUERA | alcance |
| Publicación de torneos desde panel admin | WON'T | FUERA | REQUIREMENTS §3 |
