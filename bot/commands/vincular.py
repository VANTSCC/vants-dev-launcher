

import re
from datetime import datetime, timezone
from urllib.parse import quote

import discord

from psycopg.errors import UniqueViolation

from utils.db import execute, fetch_one

RIOT_HANDLE_PATTERN = re.compile(r"^[^\s#]{3,16}#[A-Za-z0-9]{3,5}$")


def _channel_url() -> str:
    """URL al canal de ValoTracker en VANTS"""
    return "https://discord.com/channels/1546641331927908472/1546641332632817686"


async def vincular_riot_handler(interaction: discord.Interaction, handle: str) -> None:
    handle = handle.strip()
    if not RIOT_HANDLE_PATTERN.fullmatch(handle):
        await interaction.response.send_message(
            "❌ Formato inválido. Usa `Nombre#TAG` (ej: Player#1234)", ephemeral=True
        )
        return

    # ✅ Defer PRIVADO (después de validar formato, antes del try)
    await interaction.response.defer(ephemeral=True)

    try:
        player = await fetch_one(
            "SELECT id, auth_user_id FROM players WHERE discord_user_id = %s LIMIT 1",
            (str(interaction.user.id),),
        )
        if not player:
            await interaction.followup.send(
                "⚠️ Primero vincula tu Discord con VANTS en https://vantsbetaa.pplx.app/#/jugadores",
            )
            return

        if not player.get("auth_user_id"):
            await interaction.followup.send(
                "⚠️ Tu cuenta de VANTS todavía no tiene un usuario autenticado asociado.",
            )
            return

        try:
            await execute(
                "INSERT INTO user_game_accounts (user_id, game, handle, verified, verified_at, updated_at) "
                "VALUES (%s, 'riot', %s, false, NULL, now()) "
                "ON CONFLICT (user_id, game) DO UPDATE SET handle = EXCLUDED.handle, "
                "verified = false, verified_at = NULL, updated_at = now()",
                (player["auth_user_id"], handle),
            )
        except UniqueViolation:
            await interaction.followup.send(
                "❌ Ese Riot ID ya está vinculado a otra cuenta de VANTS.",
            )
            return
    except Exception:
        await interaction.followup.send(
            "❌ No se pudo guardar la cuenta ahora. Inténtalo de nuevo más tarde.",
        )
        return

    embed = discord.Embed(
        title="✅ Cuenta de Riot vinculada a VANTS",
        description=(
            f"**{handle}** quedó guardada en tu perfil VANTS. "
            "Para ver tus stats de ranked, vincula también la misma cuenta en ValoTracker."
        ),
        color=0xE30613,
    )
    embed.add_field(
        name="📌 Siguiente paso",
        value="Usa `/link` del bot **ValoTracker** con el mismo Riot ID.",
        inline=False,
    )
    embed.set_footer(text="VANTS · vantsbetaa.pplx.app")

    view = discord.ui.View()
    encoded_handle = quote(handle, safe="")
    view.add_item(discord.ui.Button(
        label="Ver stats en tracker.gg",
        style=discord.ButtonStyle.link,
        url=f"https://tracker.gg/valorant/profile/riot/{encoded_handle}",
    ))
    view.add_item(discord.ui.Button(
        label="Ir a #valorant-stats",
        style=discord.ButtonStyle.link,
        url=_channel_url()
    ))
    await interaction.followup.send(embed=embed, view=view)
