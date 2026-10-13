import os
from urllib.parse import quote

import discord

from utils.db import fetch_all, fetch_one, fetch_val


def _channel_url() -> str:
    """URL al canal de ValoTracker en VANTS"""
    return "https://discord.com/channels/1546641331927908472/1546641332632817686"


def _account_url(display_name: str) -> str:
    """URL al perfil del jugador en la web"""
    slug = display_name.lower().replace(" ", "").replace("_", "")
    return f"https://vantsbetaa.pplx.app/#/jugador/{slug}"


async def perfil_handler(interaction: discord.Interaction, usuario: discord.User | None = None) -> None:
    target = usuario or interaction.user
    
    # ✅ Defer PÚBLICO (al comienzo, antes de las consultas)
    await interaction.response.defer()

    try:
        player = await fetch_one(
            "SELECT * FROM players WHERE discord_user_id = %s LIMIT 1", (str(target.id),)
        )
        if not player:
            embed = discord.Embed(
                title="❌ Usuario no encontrado",
                description="Este usuario no tiene cuenta VANTS vinculada.",
                color=0xE30613,
            )
            await interaction.followup.send(embed=embed, ephemeral=True)
            return

        player_id = player["id"]
        auth_user_id = player.get("auth_user_id")
        tournaments = await fetch_val(
            "SELECT count(*) FROM tournament_entries WHERE player_id = %s", (player_id,)
        ) or 0
        accounts_rows = await fetch_all(
            "SELECT game, handle FROM user_game_accounts WHERE user_id = %s AND game = ANY(%s) LIMIT 10",
            (auth_user_id, ["riot", "steam"]),
        )
        standing = await fetch_one(
            "SELECT l.rank, l.mmr FROM leaderboard l LEFT JOIN seasons se ON se.id = l.season_id "
            "WHERE l.player_id = %s "
            "ORDER BY (se.status = 'active') DESC NULLS LAST, se.season_number DESC NULLS LAST LIMIT 1",
            (player_id,),
        )
    except Exception:
        await interaction.followup.send(
            "❌ No se pudo consultar el perfil ahora. Inténtalo de nuevo más tarde.",
            ephemeral=True,
        )
        return

    accounts = {row["game"]: row["handle"] for row in accounts_rows}
    riot_handle = accounts.get("riot")
    steam_id = accounts.get("steam")
    display_name = player.get("display_name") or target.display_name

    embed = discord.Embed(color=0xE30613)
    embed.set_author(name=display_name, icon_url=player.get("avatar_url") or target.display_avatar.url)
    if player.get("avatar_url"):
        embed.set_thumbnail(url=player["avatar_url"])
    embed.add_field(name="🏆 Rango VANTS", value=str((standing or {}).get("rank") or "Sin rango"), inline=True)
    embed.add_field(name="⭐ Puntos", value=str((standing or {}).get("mmr") or 0), inline=True)
    embed.add_field(name="🎮 Torneos", value=str(tournaments), inline=True)
    embed.add_field(name="🌍 País", value=player.get("country") or "No definido", inline=True)
    embed.add_field(name="🔫 Riot ID", value=riot_handle or "No vinculado", inline=True)
    embed.add_field(
        name="🎲 Steam",
        value=(f"[Perfil](https://steamcommunity.com/profiles/{steam_id})" if steam_id else "No vinculado"),
        inline=True,
    )
    embed.set_footer(text="VANTS · vantsbetaa.pplx.app")

    view = discord.ui.View()
    if riot_handle:
        encoded_handle = quote(riot_handle, safe="")
        view.add_item(discord.ui.Button(
            label="Stats en tracker.gg",
            style=discord.ButtonStyle.link,
            url=f"https://tracker.gg/valorant/profile/riot/{encoded_handle}",
            row=0,
        ))
        view.add_item(discord.ui.Button(
            label="Abrir ValoTracker",
            style=discord.ButtonStyle.link,
            url=_channel_url(),
            row=0
        ))
    if steam_id:
        view.add_item(discord.ui.Button(
            label="Perfil de Steam",
            style=discord.ButtonStyle.link,
            url=f"https://steamcommunity.com/profiles/{steam_id}",
            row=1,
        ))
    view.add_item(discord.ui.Button(
        label="Perfil completo en vantsbetaa.pplx.app",
        style=discord.ButtonStyle.link,
        url=_account_url(display_name),
        row=2,
    ))
    await interaction.followup.send(embed=embed, view=view)
