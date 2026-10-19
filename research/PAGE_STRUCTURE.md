# PAGE_STRUCTURE — Estructura de página y DOM de la referencia

Verificado 2026-10-19 (navegador real). Complementa `REFERENCE_ANALYSIS.md`.

## Árbol de secciones (orden vertical, escritorio 1440×900)

```
<body lang="es">
├─ Header global (sticky, #101010)
│  ├─ Logo Strafe (SVG)
│  ├─ Barra de juegos: [Counter-Strike 2 (activo, icono+nombre)] [8 iconos más] [Apuestas ▾]
│  ├─ Acciones: buscador (icono) · idioma (bandera ES ▾) · LOGIN (pill lima)
├─ Nav secundaria (tabs, subrayado lima en activa)
│  └─ Inicio · Partidas · Torneos* · Equipos · Jugadores · Noticias · Artículos
├─ Breadcrumb: INICIO | CS2 | TORNEOS DE CS2 | PRÓXIMOS
├─ Hero del juego
│  ├─ Icono del juego (naranja, ~40px)
│  ├─ H1 "Próximos torneos de CS2" (30px/700)
│  ├─ Subtítulo "Calendario de próximos torneos de esports de CS2."
│  └─ Tabs de estado [EN CURSO] [PRÓXIMOS*] [ARCHIVE]  (contenedor #1E1E1E)
├─ Panel "PRÓXIMOS TORNEOS DE CS2" (#181818, borde #3C3C3C, radio 10)
│  └─ Filas (7 columnas):
│     [icono] [logo 32] [NOMBRE 12-13/700 + "Counter-Strike 2" gris + badge MAJOR] [región]
│     [premio] [fechas "17 – 20 nov"] [banderitas +N]
│  └─ (pageSize 4, allTournamentsShown true → sin paginación en esta página)
├─ "GUÍAS Y CONSEJOS DE CS2" — 3 cards con media + "VER TODOS LOS ARTÍCULOS >"
├─ FAQ — 2 preguntas plegables (+)
├─ Bloque SEO — 3 párrafos de prosa
└─ Footer
   ├─ Marca + tagline
   ├─ EMPRESA: Acerca de Strafe · Contáctanos · Carreras
   ├─ EXPLORAR: Partidas · Torneos · Equipos · Jugadores
   └─ TÍTULOS: CS2 · LoL · Dota 2 · Valorant
```

## Rutas internas observadas (footer/nav, href reales)

Patrón de rutas por juego — VERIFICADO en los href del DOM:

```
/es/tournaments/upcoming/                 (todas las categorías)
/es/tournaments/{juego}/upcoming/         {csgo, lol, dota2, valorant, r6s, cod, rocketleague, sc2, overwatch, hearthstone}
/es/{juego}/                              portada del juego
/es/calendar/{juego}/                     calendario de partidas
/es/tournaments/{juego}/                  listado general de torneos del juego
/es/teams/{juego}/                        equipos
/es/players/{juego}/                      jugadores
/es/news/{juego}/                         noticias
/es/articles/{juego}/                     artículos
```

Distribución desde la home de torneos: cada juego tiene su propio árbol de secciones
(calendario/torneos/equipos/jugadores/noticias/artículos), siempre bajo `/es/`.

## Estados de la interfaz observados

| Estado | Evidencia |
|---|---|
| Carga inicial | SSG: el HTML llega con el listado ya renderizado (`__N_SSG: true`) — VERIFICADO |
| Listado corto | 4 torneos, sin paginación ni "ver más" — VERIFICADO |
| Tab activa | fondo lima, texto negro, 12px/700 — VERIFICADO |
| Error 404 | HTTP 404 real en ruta inexistente — VERIFICADO |
| Vacío | no observable en esta visita (había torneos) — DESCONOCIDO |
| Móvil 390px | header compacta, tabla sin overflow (`scrollWidth 390`) — VERIFICADO |

## Mapeo de componentes equivalentes para VANTS

| Componente Strafe | Componente VANTS (fase 5-6) | Estado |
|---|---|---|
| Header global juegos | `sf-top` + switch de juego (`strafe-shell.js`) | HECHO (T51) |
| Nav tabs | `sf-nav` | HECHO (T51) |
| Breadcrumb | `data-crumb` + `sf-crumb` | HECHO (T51) |
| Hero + tabs estado | `sf-hero` + tabs | HECHO (T51); estado en URL PENDIENTE |
| Fila de torneo | `sf-row` (7 col) | HECHO (T51) |
| Filtros por juego/estado | filtros pill | PARCIAL (partidos); torneos PENDIENTE |
| Guías (cards media) | `sf-cards` | HECHO (T51) |
| FAQ | `sf-faq` | HECHO (T51) |
| Footer columnas | `sf-foot` | HECHO (T51) |
| Detalle de evento | `torneo.html` estilo evento | HECHO (T51); a reforzar (fase 9) |
| Búsqueda global | buscador icono → resultados | PENDIENTE |
| Noticias/Artículos | secciones propias | PENDIENTE |
| Equipos/Jugadores por juego | páginas + API | PARCIAL (jugadores existe) |
