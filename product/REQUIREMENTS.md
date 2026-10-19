# REQUIREMENTS — Plataforma de torneos VANTS

Producto: hub de torneos, partidas, equipos, jugadores y noticias de esports de VANTS
(Valorant primero, hub universal PC después), con la experiencia de la referencia Strafe
adaptada a la identidad propia. Español e inglés.

## 1. Usuarios y necesidades

| Usuario | Necesidad principal | Éxito |
|---|---|---|
| **Jugador competidor** (principal) | Ver torneos próximos/abiertos de su juego y inscribirse | Encuentra un torneo activo y completa inscripción en < 2 min |
| **Espectador/fan** | Seguir partidas en vivo, resultados y calendario | Encuentra qué se juega hoy y quién va primero |
| **Capitán de equipo** | Gestionar equipo y fichas de rivales | Consulta equipo/jugador y estado de su inscripción |
| **Dueño/organización** | Publicar torneos y noticias; autoridad competitiva | Publica contenido sin tocar código; datos reales de FACEIT |
| **Buscador/Google** | Indexar correctamente | Metas únicas, sitemap, hreflang, 404 real |

## 2. Historias de usuario (núcleo)

1. Como jugador, abro `/es/tournaments/valorant/upcoming/` y veo los torneos próximos de
   Valorant ordenados por fecha, con región, premio, fechas y plazas.
2. Como jugador, cambio entre EN CURSO / PRÓXIMOS / ARCHIVO sin recargar el diseño y el
   estado queda reflejado en la URL (compartible).
3. Como jugador, entro a la ficha de un torneo y veo formato, bolsa, fechas, equipo
   organizador, reglas y el botón real de inscripción (torneos.html existente).
4. Como fan, abro Partidas y veo el calendario con el panel EN VIVO (ya existe) y filtros
   por juego.
5. Como fan, abro Equipos/Jugadores y navego a fichas con sus datos (de Neon/FACEIT).
6. Como usuario, busco "copa" en la búsqueda y obtengo torneos/equipos/artículos coincidentes.
7. Como usuario, cambio a EN y toda la interfaz de la plataforma se traduce sin mezclar idiomas.
8. Como lector, abro Noticias y leo artículos publicados por la organización.
9. Con móvil estrecho (320–390px), todo sin overflow horizontal y navegable por teclado.

## 3. Prioridades MoSCoW

**MUST (esta misión)**
- Página de torneos con rutas `/es/tournaments/:juego/:estado/` + tabs + filtros en URL.
- API pública JSON: games, tournaments (+slug), matches, teams, players, articles, search.
- Migración 28 con entidades y seed DEMO etiquetado; datos reales FACEIT documentados.
- Ficha de torneo (ya existe) alimentada por la API nueva con estados.
- Equipos, Noticias y Búsqueda (páginas nuevas).
- SEO: metas únicas, canonical, OG, sitemap, hreflang es/en, 404 real.
- i18n es/en (diccionario JS + prefijos de ruta en la plataforma).
- Estados carga/vacío/error en todas las páginas nuevas.
- Suite de pruebas node (unit + integración) y E2E en vivo.
- Seguridad: validación, rate limit, cabeceras (revisar), sin secretos.

**SHOULD**
- Paginación en listados (>20 filas).
- JSON-LD de evento SOLO con datos reales (demo excluido).
- Filtros por región además de juego/estado.

**COULD**
- Modo claro configurable.
- Sitemap segmentado por juego.
- Feed RSS de noticias.

**WON'T (ahora)**
- Analítica/publicidad de terceros, reCAPTCHA, cuentas nuevas (Auth0 ya existe).
- Paneles de administración completos (el dueño publica vía BD/inscripción existente).

## 4. Dependencias externas

| Dependencia | Estado | Plan sin credenciales |
|---|---|---|
| Neon Postgres | OK (producción) | — |
| FACEIT Data API (key en secrets) | OK | Adaptador con caché; si falla → demo etiquetado |
| Steam API (key en secrets) | OK | Usada por el HUB, no por torneos (fuera de alcance) |
| Auth0 (login) | OK | Sin cambios; UI existente |

## 5. Qué funciona con datos locales vs API

- **Local (estático)**: textos de UI (i18n), guías/FAQ, footer, metas, placeholders de marca.
- **API (Worker + Neon)**: juegos, torneos, partidos, equipos, jugadores, artículos, búsqueda.
- **Fallback**: si la API falla, las páginas muestran estado de error recuperable (nunca datos
  falsos sin etiquetar); el seed DEMO mantiene la página navegable con etiqueta visible.
