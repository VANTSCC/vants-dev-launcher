"""Supervisor de la web VANTS (Vants Supervisor Bot v1.0).

Cada SUPERVISOR_INTERVAL segundos el bot:
  1. lee hasta 10 eventos nuevos de web_events (processed = false),
  2. envia un embed al DM del dueno (SUPERVISOR_DM_ID) con color por severidad,
  3. marca los eventos entregados; reintenta hasta 3 veces si Discord falla.

Los eventos los captura el SDK de la web (assets/js/vants-supervisor.js) y los
guarda la Neon Function supervisor (neon-functions/supervisor/). Guia completa
en docs/SUPERVISOR.md.

Se puede apagar desde el panel admin con la fila bot_settings key = 'supervisor'.
"""
import asyncio
import json
import logging
import os

import discord

from utils.db import execute, fetch_all, fetch_val

log = logging.getLogger("vants.supervisor")

INTERVAL = int(os.getenv("SUPERVISOR_INTERVAL") or "25")
DM_ID = int(os.getenv("SUPERVISOR_DM_ID") or "1532612429295521930")
MAX_ATTEMPTS = 3
MAX_LOTE = 10
VERSION = "supervisor-1"

COLORES = {"info": 0x3DDC84, "warn": 0xFFB547, "error": 0xED4245, "critical": 0xED4245}
TITULOS = {
    "LOGIN_OK": "LOGIN_OK · acceso concedido",
    "LOGIN_FAILED": "LOGIN_FAILED · acceso denegado",
    "JS_ERROR": "JS_ERROR · error JavaScript",
    "NETWORK_ERROR": "NETWORK_ERROR · fallo de red",
    "PAGE_VIEW": "PAGE_VIEW · navegacion",
}

_task: asyncio.Task | None = None


def _txt(value, limit: int = 200) -> str:
    text = str(value if value not in (None, "") else "—")
    text = text.replace("@everyone", "@\u200beveryone").replace("@here", "@\u200bhere")
    return text[:limit]


def _json(value) -> dict:
    if isinstance(value, dict):
        return value
    try:
        parsed = json.loads(value or "{}")
        return parsed if isinstance(parsed, dict) else {}
    except (TypeError, ValueError):
        return {}


def build_embed(row: dict, data: dict) -> discord.Embed:
    """Anatomia del embed (lamina 12 del diseno): titulo accionable, color por
    severidad, 4 campos clave, footer con event_id."""
    kind = _txt(row.get("kind"), 40)
    severity = row.get("severity") if row.get("severity") in COLORES else "info"
    page = _txt(row.get("page"), 10)
    embed = discord.Embed(
        title=f"{TITULOS.get(kind, kind)} · {page}",
        color=COLORES[severity],
    )

    if kind == "LOGIN_OK":
        embed.description = f"**{_txt(data.get('user'), 80)}** inicio sesion."
        embed.add_field(name="Usuario", value=_txt(data.get("user"), 80))
        embed.add_field(name="Origen", value=_txt(data.get("origen"), 40))
        embed.add_field(name="IP", value=_txt(row.get("ip"), 60))
        embed.add_field(name="Navegador", value=_txt(row.get("user_agent"), 100), inline=False)
    elif kind == "LOGIN_FAILED":
        embed.description = f"Login fallido — motivo: **{_txt(data.get('motivo'), 80)}**"
        embed.add_field(name="Usuario", value=_txt(data.get("user"), 80))
        embed.add_field(name="Motivo", value=_txt(data.get("motivo"), 80))
        embed.add_field(name="IP", value=_txt(row.get("ip"), 60))
        embed.add_field(name="Detalle", value=_txt(data.get("detalle"), 200), inline=False)
    elif kind == "JS_ERROR":
        embed.description = f"`{_txt(data.get('message'), 250)}`"
        embed.add_field(name="Archivo", value=_txt(data.get("file") or data.get("motivo"), 120))
        embed.add_field(name="IP", value=_txt(row.get("ip"), 60))
        embed.add_field(name="Pagina", value=_txt(row.get("url"), 120), inline=False)
        if data.get("stack"):
            embed.add_field(name="Stack", value=f"```{_txt(data.get('stack'), 900)}```", inline=False)
    elif kind == "NETWORK_ERROR":
        embed.description = f"Fallo de red en `{_txt(data.get('endpoint'), 200)}`"
        embed.add_field(name="Endpoint", value=_txt(data.get("endpoint"), 200))
        embed.add_field(name="Status", value=_txt(data.get("status"), 10))
        embed.add_field(name="Duracion", value=f"{_txt(data.get('ms'), 10)} ms")
        embed.add_field(name="Motivo", value=_txt(data.get("motivo"), 120), inline=False)
    else:  # PAGE_VIEW
        embed.description = f"Vista: **{_txt(data.get('vista'), 120)}**"
        embed.add_field(name="Pagina", value=page)
        embed.add_field(name="IP", value=_txt(row.get("ip"), 60))
        embed.add_field(name="URL", value=_txt(row.get("url"), 200), inline=False)

    embed.set_footer(text=f"{_txt(row.get('event_id'), 40)} · supervisor v1.0 · sesion {_txt(row.get('session_id'), 20)}")
    created = row.get("created_at")
    if created is not None:
        try:
            embed.timestamp = created
        except (TypeError, ValueError):
            pass
    return embed


async def _enviar(client: discord.Client, row: dict, data: dict) -> None:
    user = client.get_user(DM_ID) or await client.fetch_user(DM_ID)
    await user.send(embed=build_embed(row, data), allowed_mentions=discord.AllowedMentions.none())


async def _ciclo(client: discord.Client) -> None:
    enabled = await fetch_val("SELECT enabled FROM bot_settings WHERE key = 'supervisor'")
    if enabled is False:
        return

    rows = await fetch_all(
        "SELECT id, event_id, kind, severity, page, session_id, url, ip, user_agent, payload, "
        "discord_attempts, created_at FROM web_events "
        "WHERE processed = false AND discord_attempts < %s ORDER BY created_at LIMIT %s",
        (MAX_ATTEMPTS, MAX_LOTE),
    )

    for row in rows:
        data = _json(row.get("payload"))
        try:
            await _enviar(client, row, data)
            await execute(
                "UPDATE web_events SET processed = true, delivery_status = 'dm_enviado', error = NULL, "
                "discord_attempts = discord_attempts + 1, processed_at = now() WHERE id = %s",
                (row["id"],),
            )
        except discord.Forbidden:
            await execute(
                "UPDATE web_events SET processed = true, delivery_status = 'sin_dm', "
                "error = 'El dueno no acepta DMs del bot', processed_at = now() WHERE id = %s",
                (row["id"],),
            )
            log.warning("Supervisor: el usuario %s no acepta DMs", DM_ID)
        except discord.NotFound:
            await execute(
                "UPDATE web_events SET processed = true, delivery_status = 'sin_dm', "
                "error = 'Usuario de DM no encontrado', processed_at = now() WHERE id = %s",
                (row["id"],),
            )
            log.warning("Supervisor: usuario de DM %s no encontrado", DM_ID)
        except Exception as exc:  # noqa: BLE001
            attempts = (row["discord_attempts"] or 0) + 1
            done = attempts >= MAX_ATTEMPTS
            await execute(
                "UPDATE web_events SET processed = %s, delivery_status = %s, discord_attempts = %s, "
                "error = %s, processed_at = CASE WHEN %s THEN now() ELSE processed_at END WHERE id = %s",
                (done, "failed" if done else "reintentar", attempts, str(exc)[:300], done, row["id"]),
            )
        await asyncio.sleep(0.5)  # holgura frente al limite de 30 mensajes/min de Discord


async def _loop(client: discord.Client) -> None:
    while True:
        try:
            await _ciclo(client)
        except asyncio.CancelledError:
            raise
        except Exception:
            log.exception("Fallo en el ciclo del supervisor")
        await asyncio.sleep(INTERVAL)


def start_supervisor(client: discord.Client) -> None:
    """Arranca el ciclo una sola vez (on_ready puede dispararse varias veces)."""
    global _task
    if _task is None or _task.done():
        _task = asyncio.create_task(_loop(client))
