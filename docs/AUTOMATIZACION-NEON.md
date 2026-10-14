# Automatización de la base de datos real (Neon CLI + GitHub Actions)

## Estado real de tu base (sondeado el 14/10/2026)

| Tabla | Estado |
|---|---|
| `players` | ✅ datos reales (5 jugadores) |
| `tournaments` | ✅ **datos reales y limpios** (6 torneos, slugs correctos, fechas Oct–Nov 2026) |
| `ranked_rules` | ✅ con reglas (placement = 5 partidas) |
| `profiles` | ✅ con datos |
| `seasons`, `leaderboard`, `ranked_matches`, `tournament_entries`, `tournament_matches`, `season_player_stats`, `events` | ⚠️ existen pero **vacías** — por eso el ranked/calendario se ven demo |
| `pass_progreso`, `pass_recompensas`, `bot_*`, `vant_sync_events`, `web_events` | privadas (el proxy público no las expone — correcto). La migración las crea si faltara alguna |

**Por qué veías "demo":** 1) el `arena-live.js` roto que dejaba todo muerto (ya lo arreglamos);
2) la caché del navegador — haz **Ctrl+F5** y verás el chip `DATOS EN VIVO · NEON · 6 TORNEOS`;
3) las secciones ranked/calendario están vacías hasta que exista una temporada y partidas reales.

## Qué automatiza el workflow `.github/workflows/neon-migrate.yml`

1. Instala el **Neon CLI** (`npm install -g neon@latest`, como pegaste).
2. Con tu `NEON_API_KEY` resuelve la cadena de conexión de la rama
   `br-sweet-shape-b42xhogj` (proyecto `square-surf-41242074`, base `neondb`) — queda
   **oculta en el log**.
3. Aplica en orden las migraciones de `db/migrations/*.sql` con `psql -v ON_ERROR_STOP=1`:
   - `01-web-events.sql` — tabla del Supervisor Bot (idempotente).
   - `02-bot-infra.sql` — tablas del bot/sincronización si faltara alguna (idempotente).
   - `03-datos-base.sql` — siembra una **temporada activa** solo si `seasons` está vacía
     (si las columnas difieren, avisa y sigue sin romper) + inventario final en el log.
4. Imprime el inventario de tablas y filas para verificarlo en el propio Actions.

Todas las migraciones son **idempotentes**: ejecutarlas 1 o 100 veces da el mismo
resultado. `docs/seed-torneos.sql` NO está en el pipeline a propósito (borra y re-siembra
torneos: solo usarlo a mano si algún día quieres reiniciarlos).

## Puesta en marcha (una sola vez, ~3 min)

1. **Crea la API key de Neon**: https://console.neon.tech/app/settings/api-keys → *Create API key*.
2. **Añádela como secreto del repo** (elige una vía):
   - Web: `https://github.com/feispla/Vants/settings/secrets/actions` → *New repository secret*
     → Name: `NEON_API_KEY`, Value: la clave.
   - O con GitHub CLI (ya logueado en esta máquina):
     ```
     gh secret set NEON_API_KEY --repo feispla/Vants
     ```
     (te la pide de forma oculta; nunca en el chat).
3. **Ejecuta**: https://github.com/feispla/Vants/actions → *Neon · migraciones de la base real*
   → **Run workflow**. En verde verás el inventario de tablas.
4. Recarga la web con **Ctrl+F5**.

## Añadir datos reales después

- **Eventos / torneos / jugadores**: desde la web con sesión o el panel admin.
- **Partidas ranked**: se registran con partidas → `ranked_matches` + `season_player_stats`
  + `leaderboard` se llenan (funciones del ranking ya en la base).
- **Nuevas migraciones**: añade un archivo `NN-nombre.sql` en `db/migrations/` — el workflow
  lo aplica en el próximo push o al pulsar Run workflow.

## Verificación SQL útil (SQL Editor de Neon)

```sql
SELECT kind, severity, COUNT(*) FROM web_events GROUP BY 1, 2;
SELECT name, season_number, status FROM seasons;
SELECT COUNT(*) AS partidas FROM ranked_matches;
```
