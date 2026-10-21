# API de VALORANT (HenrikDev) — configuración de la clave

## Qué cubre
- **VLR / Valorant**: `vlr-results/app.py` + `vlr-results/ranked.py` (backend Flask de
  resultados y del ladder ranked) lee la clave desde la variable de entorno `HENRIK_API_KEY`.
- **Web (agenda en vivo)**: el Worker expone `GET /api/valorant/esports`, que consulta
  `api.henrikdev.xyz/valorant/v1/esports/schedule` con el secret `HENRIKDEV_API_KEY`
  y caché de 5 minutos. Si el secret no está configurado, responde 503 y la web
  sigue mostrando su agenda verificada de vlr.gg (no se rompe nada).

## REGLA DE ORO
La clave **NUNCA** se sube al repositorio (es público). Solo vive en:
- variables de entorno locales, o
- secrets de la plataforma (GitHub Secrets / Worker Secrets / panel de Neon).

## 1. Backend Flask (ranked real)
```bash
# Linux / macOS
export HENRIK_API_KEY="TU_CLAVE_HDEV"
python3 vlr-results/app.py          # http://0.0.0.0:5000  · /ranked sale del modo demo

# Windows (PowerShell)
$env:HENRIK_API_KEY="TU_CLAVE_HDEV"; python vlr-results/app.py
```
Sin la variable, `ranked.py` arranca en modo demo (datos de ejemplo claramente
marcados). Con la variable, trae cuenta, MMR y partidas reales por región.

## 2. Worker de Cloudflare (agenda en vivo de la web)
Panel → Workers & Pages → **vants** → Settings → Variables y Secrets →
**Add secret**:
- Nombre: `HENRIKDEV_API_KEY`
- Valor: tu clave HDEV

(o por CLI: `npx wrangler secret put HENRIKDEV_API_KEY` dentro de `vants-server/`).

Después del alta, `GET https://vants.geimerjhoan099.workers.dev/api/valorant/esports`
desde un origen propio (workers.dev / feispla.github.io / vantsgg.com) devuelve la
agenda real; la home la usa automáticamente para refrescar "Partidos y resultados".

## Estado de la clave (verificado 2026-10-18)
- Sin clave → `401 Unauthorized`. Con la clave del dueño → `404 Account not found`
  sobre una cuenta inexistente = **clave válida y aceptada** por api.henrikdev.xyz.
- El endpoint `v1/esports/schedule` devolvía `500` (fallo upstream del proveedor,
  no de la clave). El Worker reintenta con caché de 5 min; mientras tanto la agenda
  verificada de vlr.gg sigue siendo la fuente visible.
- Si la clave se filtra en algún chat o captura, regenerala gratis en el Discord de
  HenrikDev y actualizá los secrets (tarda 1 minuto).
