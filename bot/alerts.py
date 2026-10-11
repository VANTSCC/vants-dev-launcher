"""Alertas automaticas de VANTS hacia los canales de Discord.

Cada 30 s el bot:
  1. escribe su latido en bot_heartbeat (el panel admin lo usa para el estado),
  2. mete en la cola bot_alerts lo nuevo (torneos, eventos, recordatorios, resultados ranked),
  3. envia las alertas pendientes al canal de su categoria (tabla discord_channels).

Nada se envia dos veces: bot_alerts tiene UNIQUE (kind, ref_id). El panel admin puede
apagar cada tipo con bot_settings y reintentar fallidas poniendo status = 'pending'.
"""
import asyncio
import json
import logging

import discord

from utils.db import execute, fetch_all, fetch_one

log = logging.getLogger("vants.alerts")

INTERVAL = 30
MAX_ATTEMPTS = 3
VERSION = "alerts-1"

# kind -> (clave en bot_settings, SQL que encola lo nuevo). Solo se mira lo creado en el ultimo dia
# para no inundar el canal con historico al activar la funcion.
ENQUEUE = {
    "tournament": (
        "alerts_tournament",
        "INSERT INTO bot_alerts (kind, ref_id, category, payload) "
        "SELECT 'tournament', t.id::text, 'anuncios', jsonb_build_object("
        "'name', t.name, 'game', t.game, 'prize', COALESCE(t.prize_pool, t.prize), "
        "'starts_at', t.starts_at, 'max', t.max_participants, 'slug', t.slug) "
        "FROM tournaments t WHERE t.created_at > now() - interval '1 day' "
        "ON CONFLICT (kind, ref_id) DO NOTHING",
    ),
    "event": (
        "alerts_event",
        "INSERT INTO bot_alerts (kind, ref_id, category, payload) "
        "SELECT 'event', e.id::text, 'anuncios', jsonb_build_object("
        "'title', e.title, 'type', e.event_type, 'starts_at', e.starts_at, "
        "'location', e.location, 'description', e.description) "
        "FROM events e WHERE e.created_at > now() - interval '1 day' "
        "ON CONFLICT (kind, ref_id) DO NOTHING",
    ),
    "event_reminder": (
        "alerts_event_reminder",
        "INSERT INTO bot_alerts (kind, ref_id, category, payload) "
        "SELECT 'event_reminder', e.id::text, 'anuncios', jsonb_build_object("
        "'title', e.title, 'type', e.event_type, 'starts_at', e.starts_at, 'location', e.location) "
        "FROM events e WHERE e.starts_at > now() AND e.starts_at <= now() + interval '1 hour' "
        "ON CONFLICT (kind, ref_id) DO NOTHING",
    ),
    "ranked_result": (
        "alerts_ranked_result",
        "INSERT INTO bot_alerts (kind, ref_id, category, payload) "
        "SELECT 'ranked_result', m.id::text, 'ranked', jsonb_build_object("
        "'p1', COALESCE(p1.display_name, p1.username), 'p2', COALESCE(p2.display_name, p2.username), "
        "'winner', COALESCE(w.display_name, w.username), 'c1', m.mmr_change_p1, 'c2', m.mmr_change_p2) "
        "FROM ranked_matches m "
        "LEFT JOIN players p1 ON p1.id = m.player1_id "
        "LEFT JOIN players p2 ON p2.id = m.player2_id "
        "LEFT JOIN players w ON w.id = m.winner_id "
        "WHERE m.status = 'completed' AND m.completed_at > now() - interval '1 day' "
        "ON CONFLICT (kind, ref_id) DO NOTHING",
    ),
}

_task: asyncio.Task | None = None


def _txt(value, limit: int = 200) -> str:
    text = str(value if value not in (None, "") else "—")
    text = text.replace("@everyone", "@\u200beveryone").replace("@here", "@\u200bhere")
    return text[:limit]


def _when(value) -> str:
    """Marca de tiempo de Discord a partir de un ISO 8601 (o texto vacio)."""
    if not value:
        return "—"
    try:
        from datetime import datetime

        ts = int(datetime.fromisoformat(str(value).replace("Z", "+00:00")).timestamp())
        return f"<t:{ts}:F> (<t:{ts}:R>)"
    except ValueError:
        return _txt(value, 40)


def build_embed(kind: str, p: dict) -> discord.Embed:
    if kind == "tournament":
        e = discord.Embed(title=f"Nuevo torneo: {_txt(p.get('name'), 100)}", color=0xFF5500)
        e.add_field(name="Juego", value=_txt(p.get("game"), 50))
        e.add_field(name="Premio", value=_txt(p.get("prize"), 50))
        e.add_field(name="Cupos", value=_txt(p.get("max"), 10))
        e.add_field(name="Inicio", value=_when(p.get("starts_at")), inline=False)
    elif kind == "event":
        e = discord.Embed(title=f"Nuevo evento: {_txt(p.get('title'), 100)}", color=0xFF5500)
        e.add_field(name="Tipo", value=_txt(p.get("type"), 40))
        e.add_field(name="Lugar", value=_txt(p.get("location"), 80))
        e.add_field(name="Fecha", value=_when(p.get("starts_at")), inline=False)
        if p.get("description"):
            e.description = _txt(p.get("description"), 500)
    elif kind == "event_reminder":
        e = discord.Embed(title=f"Empieza pronto: {_txt(p.get('title'), 100)}", color=0xFFB800)
        e.add_field(name="Fecha", value=_when(p.get("starts_at")), inline=False)
        e.add_field(name="Lugar", value=_txt(p.get("location"), 80))
    else:  # ranked_result
        e = discord.Embed(title="Resultado ranked", color=0xFF4655)
        e.description = (
            f"**{_txt(p.get('p1'), 40)}** ({_txt(p.get('c1'), 6)} MMR) vs "
            f"**{_txt(p.get('p2'), 40)}** ({_txt(p.get('c2'), 6)} MMR)\n"
            f"Ganador: **{_txt(p.get('winner'), 40)}**"
        )
    e.set_footer(text="VANTS")
    return e


async def _heartbeat(client: discord.Client) -> None:
    lat = client.latency
    latency_ms = int(lat * 1000) if lat == lat and lat != float("inf") else None
    await execute(
        "INSERT INTO bot_heartbeat (id, last_seen, latency_ms, guilds, version) "
        "VALUES ('main', now(), %s, %s, %s) "
        "ON CONFLICT (id) DO UPDATE SET last_seen = now(), latency_ms = EXCLUDED.latency_ms, "
        "guilds = EXCLUDED.guilds, version = EXCLUDED.version",
        (latency_ms, len(client.guilds), VERSION),
    )


async def _settings() -> dict[str, bool]:
    rows = await fetch_all("SELECT key, enabled FROM bot_settings")
    return {r["key"]: bool(r["enabled"]) for r in rows}


async def _enqueue(settings: dict[str, bool]) -> None:
    for kind, (key, sql) in ENQUEUE.items():
        if not settings.get(key, True):
            continue
        try:
            await execute(sql)
        except Exception:
            log.exception("No se pudo encolar %s", kind)


async def _send_pending(client: discord.Client, settings: dict[str, bool]) -> None:
    rows = await fetch_all(
        "SELECT id, kind, category, payload, attempts FROM bot_alerts "
        "WHERE status = 'pending' ORDER BY id LIMIT 10"
    )
    for row in rows:
        key = ENQUEUE.get(row["kind"], (None,))[0]
        if key and not settings.get(key, True):
            await execute("UPDATE bot_alerts SET status = 'skipped' WHERE id = %s", (row["id"],))
            continue
        try:
            ch = await fetch_one(
                "SELECT channel_id FROM discord_channels WHERE category = %s", (row["category"],)
            )
            if not ch:
                raise RuntimeError(f"Sin canal configurado para la categoria '{row['category']}'")
            channel = client.get_channel(int(ch["channel_id"])) or await client.fetch_channel(
                int(ch["channel_id"])
            )
            payload = row["payload"] if isinstance(row["payload"], dict) else json.loads(row["payload"])
            msg = await channel.send(
                embed=build_embed(row["kind"], payload),
                allowed_mentions=discord.AllowedMentions.none(),
            )
            await execute(
                "UPDATE bot_alerts SET status = 'sent', sent_at = now(), channel_id = %s, "
                "message_id = %s, error = NULL, attempts = attempts + 1 WHERE id = %s",
                (str(channel.id), str(msg.id), row["id"]),
            )
        except Exception as exc:  # noqa: BLE001
            attempts = (row["attempts"] or 0) + 1
            status = "failed" if attempts >= MAX_ATTEMPTS else "pending"
            await execute(
                "UPDATE bot_alerts SET status = %s, attempts = %s, error = %s WHERE id = %s",
                (status, attempts, str(exc)[:300], row["id"]),
            )


async def _loop(client: discord.Client) -> None:
    while True:
        try:
            await _heartbeat(client)
            settings = await _settings()
            await _enqueue(settings)
            await _send_pending(client, settings)
        except asyncio.CancelledError:
            raise
        except Exception:
            log.exception("Fallo en el ciclo de alertas")
        await asyncio.sleep(INTERVAL)


def start_alerts(client: discord.Client) -> None:
    """Arranca el ciclo una sola vez (on_ready puede dispararse varias veces)."""
    global _task
    if _task is None or _task.done():
        _task = asyncio.create_task(_loop(client))
