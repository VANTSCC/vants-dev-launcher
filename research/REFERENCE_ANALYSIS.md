# REFERENCE_ANALYSIS — Strafe `/es/tournaments/csgo/upcoming/`

Análisis de la página de referencia pública. Verificado en navegador real (Chromium headless,
viewport 1440×900 y 390×844) el 2026-10-19, sesión T52. Evidencia complementaria de las
sesiones T50/T51 (capturas + estilos computados, misma URL).

Regla de confianza: **VERIFICADO** = observado directamente hoy en DOM/red/captura.
**INFERIDO** = deducido de evidencia parcial. **DESCONOCIDO** = no observable públicamente.

## 1. Identidad de la página

- Título: `Próximos Torneos de CS2 Esports | Calendarios | Strafe` — VERIFICADO (`document.title`).
- `lang="es"` en `<html>` — VERIFICADO.
- Descripción meta: "Consulta el calendario de próximos torneos de CS2. Horarios y resultados de Counter-Strike en Strafe." — VERIFICADO.
- La URL de "CS:GO" sirve contenido de **CS2** (renombre comercial del juego) — VERIFICADO (h1 "Próximos torneos de CS2").

## 2. Sistema visual (estilos computados reales)

| Token | Valor observado | Confianza |
|---|---|---|
| Fondo body | `rgb(14, 14, 16)` → **#0E0E10** | VERIFICADO |
| Fuente base | `"Gotham Narrow", sans-serif` (5 pesos woff2 self-hosted: Book/Medium/Bold/Black/Ultra) | VERIFICADO |
| Acento (LOGIN / tab activa / badge MAJOR) | `rgb(210, 220, 89)` → **#D2DC59** (lima) | VERIFICADO |
| LOGIN pill | fondo lima, texto blanco, sin radius | VERIFICADO |
| H1 | `30px / 700` + icono naranja del juego a la izquierda | VERIFICADO |
| Metadatos de fila | `12px / 700` en gris (~#666) | VERIFICADO (T51) |
| Panel de torneos | superficie ~#181818, borde ~#3C3C3C, radio 10px | VERIFICADO (T51) |
| Contenedor de tabs | ~#1E1E1E, radio 4px, altura 40px; tab activa fondo lima texto negro | VERIFICADO (T51+T52) |
| Sustituta libre de Gotham Narrow | **Barlow Semi Condensed** (Google Fonts, métrica y proporción similares) | INFERIDO (decisión de diseño T51, sin dependencia de la fuente propietaria) |

La identidad de VANTS NO copia logos ni la marca Strafe: reutiliza únicamente patrones
(colores neutros oscuros + un acento, doble navegación, densidad de tabla). Marca y logotipo
son propios de VANTS — decisión documentada en `DECISIONS.md`.

## 3. Estructura de la página (de arriba a abajo)

1. **Barra superior global** (#101010): logo Strafe + fila de iconos de juegos (CS2 activo
   con nombre visible, resto solo icono), dropdown "Apuestas De Esports", icono buscador,
   selector de idioma (bandera ES + chevron), LOGIN pill lima.
   Juegos observados como recursos SVG: csgo, lol, dota2, valorant, r6s, cod, rocketleague,
   sc2, overwatch, hearthstone (10 juegos) — VERIFICADO en red.
2. **Navegación secundaria** (tabs): Inicio · Partidas · **Torneos** (activo, subrayado lima) ·
   Equipos · Jugadores · Noticias · Artículos — VERIFICADO.
3. **Breadcrumb**: `INICIO | CS2 | TORNEOS DE CS2 | PRÓXIMOS` (uppercase, mono, separadores) — VERIFICADO.
4. **Hero**: icono naranja del juego + H1 "Próximos torneos de CS2" + subtítulo "Calendario de
   próximos torneos de esports de CS2." — VERIFICADO.
5. **Tabs de estado** dentro del hero: `EN CURSO | PRÓXIMOS (activo) | ARCHIVE` — VERIFICADO.
   El término "ARCHIVE" queda sin traducir en la UI de Strafe (detalle observado).
6. **Panel de torneos** "PRÓXIMOS TORNEOS DE CS2" con filas de tabla de 7 columnas:
   `icono-participante | logo 32px | NOMBRE (bold) + juego en gris debajo + badge MAJOR lima
   junto al nombre | región (EU/EA/WA) | premio ($100,000) | fechas ("17 – 20 nov") |
   banderitas de equipos + N`.
   Torneos visibles (datos PÚBLICOS de la referencia, solo para entender la representación):
   "2026 Stake Ranked Episode 6" EU $100.000 17–20 nov · "2026 MaceMedia VOID Autumn Cup" EA
   $12.000 20–24 oct · "2026 Esports Nations Cup" (badge MAJOR) WA $1.320.000 10–15 nov ·
   "2026 Winline MPKBK CIS LAN Season 9" EU $50.000 20–23 oct — VERIFICADO (captura + JSON).
7. **Guías y consejos** ("GUÍAS Y CONSEJOS DE CS2"): 3 cards con imagen de media superior,
   título abajo, y enlace "VER TODOS LOS ARTÍCULOS >" alineado a la derecha — VERIFICADO.
8. **FAQ**: panel con filas plegables (+) — "¿Cómo funcionan los torneos de Counter-Strike?",
   "¿Cuánto dinero en premios hay en los torneos de Counter-Strike?" — VERIFICADO.
9. **Bloque SEO de texto**: 3 párrafos de prosa tras el FAQ — VERIFICADO (captura).
10. **Footer**: logo + tagline ("La experiencia número uno para fans de esports…"), columnas
    EMPRESA (Acerca de Strafe, Contáctanos, Carreras) / EXPLORAR (Partidas, Torneos, Equipos,
    Jugadores) / TÍTULOS (CS2, LoL, Dota 2, Valorant) — VERIFICADO.

## 4. Comportamiento e interacciones

- Las tabs de estado cambian el listado (estado `UPCOMING` por defecto en el JSON de datos,
  campo `selectedTournamentStatus`) — VERIFICADO (JSON) / comportamiento de tabs INFERIDO del
  código de página `tournaments/[[...index]]`.
- Paginación: `pageSize: 4` y `allTournamentsShown: true` en el JSON → listado corto completo,
  sin paginación visible en esta página — VERIFICADO.
- Precarga del cliente: el router de Next.js descarga el JSON de datos de TODOS los juegos
  (`/es/tournaments/{csgo,lol,dota2,valorant,r6s,cod,rocketleague,sc2,overwatch,hearthstone}/upcoming.json`)
  — VERIFICADO en red (optimización de navegación instantánea entre juegos).
- Responsive 390px: **sin overflow horizontal** (`scrollWidth 390 == viewport`) — VERIFICADO.
- Estado 404: ruta inexistente devuelve HTTP 404 real (no soft-404) — VERIFICADO.

## 5. Modelo de datos público de un torneo (JSON `_next/data`, SSG)

Campos observados en `pageProps.tournaments[0]` — VERIFICADO:

```
__typename "Tournament"
name            "2026 Stake Ranked Episode 6"
uuid            "d6d2458b-…"
slug            "2026-stake-ranked-episode-6-d6d245"
sport           { id, name "CS:GO", long_name "Counter-Strike 2" }
location        "EU"      locationType "ONLINE"    locationData null
logo / banner   URLs Cloudinary (res.cloudinary.com/strafe/…)
major           false     (badge MAJOR cuando true)
description     + descripciones por idioma (…Es, …Pt, …Fr, …De, …Ru, …Ua, …Ja, …Ko)
start_date      "2026-11-17T00:00:00+00:00"
end_date        "2026-11-20T00:00:00+00:00"
prize_pool      { value: 100000, currency: "USD" }  (__typename "PrizePool")
```

Metadatos de página: `pageSize`, `allTournamentsShown`, `selectedTournamentStatus` ("UPCOMING"),
`sportIds`, `guides[]` (3).

## 6. Lo que NO se intentó (límites)

No se accedió a paneles privados, cuentas, endpoints autenticados ni se eludieron controles.
Todo el análisis proviene de la página pública y sus recursos accesibles con la sesión normal
de navegación. La arquitectura interna privada de Strafe queda **DESCONOCIDA** y no se afirma
nada sobre ella más allá de la evidencia pública (Next.js Pages Router con SSG + API GraphQL
propia, ver `NETWORK_FINDINGS.md`).

## 7. Implicaciones de diseño para VANTS (traducción, no copia)

| Patrón Strafe | Implementación VANTS |
|---|---|
| Dark #0E0E10 + lima acento | Ya aplicado en `strafe.css` v2 (T51), tokens propios |
| Doble navegación (juegos + tabs) | `strafe-shell.js` top bar + nav tabs |
| Breadcrumb mono | `data-crumb` por página |
| Tabla de torneos 7 col. + badge | `strafe-home.js` filas + badges ABIERTO/PRÓXIMO/FINALIZADO/MAJOR |
| Tabs EN CURSO/PRÓXIMOS/ARCHIVE | tabs del home, a extender con estado en URL |
| Rutas por juego y estado | `/es/tournaments/:juego/:estado/` (a implementar en esta misión) |
| FAQ + texto SEO + guías | ya presentes en el home; a reforzar en fichas |
| hreflang es/en/x-default | a implementar (fase 10) |
