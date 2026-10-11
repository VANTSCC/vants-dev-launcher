# Alertas automaticas

El bot publica solo, en el canal de cada categoria (`discord_channels`):

| Tipo | Categoria | Cuando |
|---|---|---|
| `tournament` | anuncios | torneo nuevo (ultimo dia) |
| `event` | anuncios | evento nuevo (ultimo dia) |
| `event_reminder` | anuncios | falta 1 hora o menos |
| `ranked_result` | ranked | partida ranked completada (ultimo dia) |

Tablas nuevas: `bot_alerts` (cola e historial, UNIQUE kind+ref_id), `bot_heartbeat` (latido cada 30 s),
`bot_settings` (interruptor por tipo). Tres intentos por alerta; luego queda `failed` y se reintenta desde
el panel admin (`#/admin`, pestana Alertas).

No hace falta ninguna variable nueva: usa `DATABASE_URL` y `DISCORD_TOKEN`.
