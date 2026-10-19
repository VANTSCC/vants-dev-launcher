# USER_FLOWS — Flujos críticos de la plataforma

Flujos con inicio → pasos → fin y condición de éxito. Cada flujo será cubierto por pruebas
(F13) y auditado (F16).

## F1 · Descubrir e inscribirse a un torneo (crítico)

```
Inicio (/) → click "TORNEOS" (nav) → /es/tournaments/valorant/upcoming/
→ click fila de torneo → /torneo?id=… (ficha)
→ click "INSCRIBIR MI EQUIPO" → /torneos (inscripción real existente)
→ formulario de inscripción → confirmación visible en "recién inscritos"
ÉXITO: el usuario llega a la inscripción real sin salir del diseño strafe y sin 404.
```

## F2 · Cambiar estado del calendario (crítico)

```
/es/tournaments/valorant/upcoming/ → click tab EN CURSO → URL /es/tournaments/valorant/ongoing/
→ el listado muestra solo torneos en curso; tab activa visualmente marcada.
→ click tab ARCHIVO → /es/tournaments/valorant/archive/ → listado archivo.
ÉXITO: URL compartible refleja estado; recarga directa (deep link) funciona; back del
navegador restaura el estado anterior.
```

## F3 · Cambiar de juego (crítico)

```
Cualquier página → click "VALORANT"/"COUNTER-STRIKE 2" en top bar → evento vants:game
→ breadcrumb y hero y listado actualizados al juego; las rutas de torneos mantienen
el juego elegido (/es/tournaments/<juego>/<estado>/).
ÉXITO: nunca se pierde el diseño (no "manda para la otra"); título y datos coherentes.
```

## F4 · Ficha de torneo desde API

```
Fila de torneo (API /api/tournaments) → /torneo?slug=<slug>
→ la ficha pide /api/tournaments/<slug> → pinta información real (o DEMO etiquetada)
→ estado de carga (skeleton) → contenido; si 404 → EmptyState con enlace al listado.
ÉXITO: sin datos inventados; sin error de consola; enlace de vuelta al listado.
```

## F5 · Búsqueda global

```
Cualquier página → click icono de búsqueda → /busqueda?q=…
→ /api/search?q=… → agrupado Torneos/Equipos/Jugadores/Artículos
→ click resultado → ficha correspondiente.
ÉXITO: con q vacío muestra guía de búsqueda (EmptyState); con sin resultados, mensaje claro.
```

## F6 · Noticias y artículos

```
Nav "Noticias" → /noticias → /api/articles → lista de artículos (real o DEMO etiquetado)
→ click → ficha de artículo (/noticia?id=…) con cuerpo, fecha y autor.
ÉXITO: navegación interna consistente; metas únicas por ficha.
```

## F7 · Cambio de idioma

```
Cualquier página de la plataforma → selector ES/EN (o ?lang=en)
→ textos de UI traducidos al completo; localStorage recuerda la preferencia;
hreflang links apuntan a la equivalente /es/ o /en/.
ÉXITO: ninguna página mezcla idiomas; fechas formateadas al locale activo.
```

## F8 · Estados de red

```
API caída (fetch rechazado o !ok) → ErrorState con botón "Reintentar" (re-fetch).
Listado sin datos → EmptyState ("No hay torneos próximos ahora mismo…").
Carga → skeleton de filas (no layout shift).
ÉXITO: ningún estado deja la página en blanco ni muestra spinner infinito.
```

## F9 · Navegación por teclado (accesibilidad)

```
Tab por el orden: nav principal → tabs de estado → filas de torneo (enlaces reales) → footer.
Los tabs/filtros son <a>/<button> nativos con :focus-visible; Enter activa.
ÉXITO: todos los flujos F1-F6 completables solo con teclado.
```
