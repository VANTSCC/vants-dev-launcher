# SEO_FINDINGS — Metadatos, internacionalización e indexación de la referencia

Verificado 2026-10-19 (DOM + peticiones públicas).

## 1. Metadatos de la página de referencia (VERIFICADO)

| Elemento | Valor observado |
|---|---|
| `<title>` | `Próximos Torneos de CS2 Esports | Calendarios | Strafe` |
| `<meta name="description">` | "Consulta el calendario de próximos torneos de CS2. Horarios y resultados de Counter-Strike en Strafe." |
| `<link rel="canonical">` | `https://www.strafe.com/es/tournaments/csgo/upcoming/` (canonical propio de la URL concreta) |
| `og:title` | igual al `<title>` |
| `<html lang>` | `es` |
| `<h1>` | único: "Próximos torneos de CS2" |

## 2. hreflang (VERIFICADO)

```
x-default → https://www.strafe.com/tournaments/csgo/upcoming/
en        → https://www.strafe.com/tournaments/csgo/upcoming/
pt-BR     → https://www.strafe.com/br/tournaments/csgo/upcoming/
es        → https://www.strafe.com/es/tournaments/csgo/upcoming/
```

Estrategia observada: prefijo de idioma en la ruta (`/es/`, `/br/`, sin prefijo = inglés),
`x-default` apunta a la versión inglesa. Las variantes de idioma comparten el mismo contenido
estructural (título/descripción traducidos por i18n `_nextI18Next.initialLocale: "es"`).

## 3. robots.txt y sitemap

- `robots.txt` existe y contiene reglas por User-agent con múltiples `Allow:` (contenido de
  trading/apuestas) — VERIFICADO su contenido parcial; el listado completo de `Disallow:`
  no se cataloga porque no afecta al patrón a replicar.
- `sitemap.xml` NO devuelve XML en esa ruta (responde el HTML de la home) — VERIFICADO que la
  ruta `/sitemap.xml` tal cual no es un XML válido. Strafe usará otra estrategia de sitemaps
  (probablemente segmentada). Conclusión para VANTS: servir un `sitemap.xml` XML REAL y válido
  (el repo ya tiene uno; habrá que regenerarlo con las rutas nuevas).
- URL inexistente → HTTP 404 real (sin soft-404). VERIFICADO.

## 4. Patrones SEO a replicar en VANTS (fase 10)

1. `<title>` único por página con patrón `{Sección} de {Juego} | VANTS`.
2. `<meta name="description">` única por página, con la consulta objetivo.
3. Canonical absoluto por URL (incluye idioma).
4. hreflang `es` + `en` + `x-default` con rutas por prefijo `/es/` y `/en/`.
5. Un solo `<h1>` por página; jerarquía h2/h3 coherente.
6. URLs limpias con barra final por juego y estado: `/es/tournaments/valorant/upcoming/`.
7. Sitemap XML real + robots.txt.
8. Open Graph + imagen social de marca propia (`og-vants.jpg` ya existe en el repo).
9. Sin marcar datos ficticios con datos estructurados de eventos reales (JSON-LD solo si hay
   datos verificables; los torneos demo van etiquetados como demo y sin schema de evento).

## 5. i18n de la referencia (VERIFICADO como patrón)

- Prefijo de locale en la ruta; textos de UI traducidos (ES completo en esta página); fechas
  formateadas al locale ("17 – 20 nov").
- El término "ARCHIVE" permanece sin traducir en la UI de Strafe — detalle observado; en VANTS
  se traducirá ("ARCHIVO") porque el i18n es propio.
