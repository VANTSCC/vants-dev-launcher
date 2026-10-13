# VANTS — Kit de marca y rangos

## Marca
| Archivo | Uso |
|---|---|
| `brand/vants-mark.svg` | Logo principal (header, footer, documentos) |
| `brand/favicon.svg`, `brand/favicon-32.png` | Favicon de la web |
| `brand/apple-touch-icon.png` | Icono de iOS (180 px) |
| `brand/vants-mark-512.png`, `brand/vants-mark-1024.png` | Logo transparente en PNG |
| `brand/discord-icon-1024.png` | Icono del servidor de Discord y avatar del bot vantcall |
| `brand/vants-lockup-dark.png` / `-light.png` | Logo + wordmark para fondo oscuro / claro |
| `brand/og-vants.png` | Imagen para compartir (Open Graph, 1200×630) y banner de Discord |

Colores: rojo VANTS `#FF0D2E`, carbón `#0B131B`, marfil `#F3EFE8`. Tipografía: Cabinet Grotesk 800–900 (títulos), Satoshi (texto).

## Rangos VANTS (8 niveles)
`ranks/{hierro,bronce,plata,oro,platino,diamante,titan,escarlata}.svg` y `.png` (512 px, fondo transparente). `ranks/rank-sheet.png` muestra la escalera completa.

| Nivel | Rango | MMR | Rasgos |
|---|---|---|---|
| I | Hierro | 0+ | Escudo de acero mate |
| II | Bronce | 900+ | Escudo de bronce con alas cortas |
| III | Plata | 1100+ | Escudo con muesca y doble ala |
| IV | Oro | 1300+ | Gema superior y alas doradas |
| V | Platino | 1500+ | Cristal hexagonal con facetas |
| VI | Diamante | 1700+ | Diamante tallado con halo |
| VII | Titán | 1900+ | Escudo con cuernos, corona y aura |
| VIII | Escarlata | 2100+ / Top global | Corona dorada, llamas y rayos |

Los emblemas se generan desde `ranks.js` (fuente única). Para regenerar los SVG:
`node -e "const R=require('./ranks.js');const fs=require('fs');for(const k of R.ORDER)fs.writeFileSync('assets/ranks/'+k+'.svg',R.emblemSVG(k,{id:'f'})+'\n')"`
