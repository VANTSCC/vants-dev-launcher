# REFERENCE_SCREENSHOTS — Capturas de la referencia (2026-10-19, sesión T52)

Capturas tomadas con navegador real (Chromium headless) sobre
`https://www.strafe.com/es/tournaments/csgo/upcoming/`.

| Archivo | Vista | Viewport | Confianza |
|---|---|---|---|
| `qa-strafe3/ref-desktop-top.png` | Header + nav + breadcrumb + hero + tabs + panel de torneos (4 filas) + guías | 1440×900 | VERIFICADO |
| `qa-strafe3/ref-desktop-mid.png` | Fin de guías + "VER TODOS LOS ARTÍCULOS" + FAQ + bloque SEO + footer | 1440×900 (scroll) | VERIFICADO |
| `qa-strafe3/ref-desktop-bottom.png` | Footer completo (marca, EMPRESA, EXPLORAR, TÍTULOS) | 1440×900 (scroll) | VERIFICADO |
| `qa-strafe3/ref-movil-top.png` | Header compacto móvil + hero + tabs | 390×844 | VERIFICADO |
| `qa-strafe3/ref-movil-mid.png` | Panel de torneos móvil (filas apiladas, sin overflow) | 390×844 (scroll) | VERIFICADO |

Ruta local de las capturas: `/home/z/my-project/download/qa-strafe3/`.

Notas de lectura de las capturas:

- La fila de torneo muestra claramente: logo cuadrado 32px, nombre en bold, nombre del juego
  en gris debajo, badge MAJOR lima INMEDIATAMENTE a la derecha del nombre (no en columna
  propia), región, premio, rango de fechas y banderitas de equipos con `+N`.
- La tab activa PRÓXIMOS es la única con fondo lima y texto oscuro; el resto gris claro.
- El FAQ expandido muestra prosa larga (bloque SEO) con ancho completo del panel.
- El footer tiene la marca + tagline a la izquierda y tres columnas de enlaces a la derecha.
- En móvil el switch de juegos colapsa a iconos y la tabla pasa a filas compactas verticales
  sin desbordamiento horizontal (verificado con `scrollWidth == 390`).

Capturas históricas de las sesiones T50/T51 (misma referencia y detalle de evento, calendario,
jugadores, equipos) siguen en `/home/z/my-project/download/qa-strafe/` y `qa-strafe2/`.
