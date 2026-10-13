import discord
from discord import app_commands
from datetime import datetime, timezone, timedelta

from utils.db import fetch_all, fetch_one, fetch_val

ACTIVE_TOURNAMENT_STATUSES = ["registration", "open", "upcoming", "in_progress", "live"]


async def informe_semanal_handler(interaction: discord.Interaction) -> None:
    await interaction.response.defer()
    week_ago = datetime.now(timezone.utc) - timedelta(days=7)
    try:
        new_players = await fetch_all(
            "SELECT username, display_name, created_at FROM players "
            "WHERE created_at >= %s ORDER BY created_at DESC LIMIT 10",
            (week_ago,),
        )
        tournaments = await fetch_all(
            "SELECT name, status, current_participants, max_participants, starts_at "
            "FROM tournaments WHERE status = ANY(%s)",
            (ACTIVE_TOURNAMENT_STATUSES,),
        )
        matches = await fetch_val(
            "SELECT count(*) FROM ranked_matches WHERE status = 'completed' AND completed_at >= %s",
            (week_ago,),
        )
        season = await fetch_one("SELECT id, name FROM seasons WHERE status = 'active' LIMIT 1")
        top5 = []
        if season:
            top5 = await fetch_all(
                "SELECT username, display_name, rank, mmr, wins FROM leaderboard "
                "WHERE season_id = %s ORDER BY mmr DESC LIMIT 5",
                (season["id"],),
            )
    except Exception:
        await interaction.followup.send("❌ No se pudo consultar la base de datos ahora.", ephemeral=True)
        return

    embed = discord.Embed(title="📋 Informe semanal VANTS", color=0x00B6AF, timestamp=datetime.now(timezone.utc))
    embed.add_field(name="🆕 Jugadores nuevos (7d)", value=str(len(new_players)), inline=True)
    embed.add_field(name="🎮 Partidas ranked (7d)", value=str(matches or 0), inline=True)
    embed.add_field(name="🏆 Torneos activos", value=str(len(tournaments)), inline=True)

    if new_players:
        names = ", ".join(p.get("display_name") or p["username"] for p in new_players[:5])
        embed.add_field(name="Últimos registros", value=names, inline=False)

    if tournaments:
        t_list = "\n".join(
            f"• **{t['name']}** ({t.get('status', '?')}) — {t.get('current_participants', 0)}/{t.get('max_participants') or '∞'}"
            for t in tournaments[:5]
        )
        embed.add_field(name="Torneos en curso", value=t_list, inline=False)

    if top5:
        lb = "\n".join(
            f"{i+1}. **{p.get('display_name') or p['username']}** — {p.get('rank', '?')} ({p.get('mmr', 0)} MMR)"
            for i, p in enumerate(top5)
        )
        embed.add_field(name="Top 5 ranked", value=lb, inline=False)

    await interaction.followup.send(embed=embed)


async def resumen_handler(interaction: discord.Interaction) -> None:
    await interaction.response.defer()
    try:
        players = await fetch_val("SELECT count(*) FROM players")
        tournaments = await fetch_val("SELECT count(*) FROM tournaments")
        matches = await fetch_val("SELECT count(*) FROM ranked_matches WHERE status = 'completed'")
        events = await fetch_val("SELECT count(*) FROM events WHERE starts_at >= %s", (datetime.now(timezone.utc),))
        season = await fetch_one("SELECT name, season_number, status FROM seasons WHERE status = 'active' LIMIT 1")
    except Exception:
        await interaction.followup.send("❌ No se pudo consultar la base de datos ahora.", ephemeral=True)
        return

    embed = discord.Embed(title="⚡ Resumen VANTCALL", color=0xE67277, timestamp=datetime.now(timezone.utc))
    embed.add_field(name="Jugadores", value=str(players or 0), inline=True)
    embed.add_field(name="Torneos", value=str(tournaments or 0), inline=True)
    embed.add_field(name="Partidas ranked", value=str(matches or 0), inline=True)
    embed.add_field(name="Eventos próximos", value=str(events or 0), inline=True)
    if season:
        embed.add_field(
            name="Temporada",
            value=f"{season.get('name') or 'T' + str(season['season_number'])} ({season['status']})",
            inline=True,
        )
    embed.set_footer(text="Datos en tiempo real desde Neon")
    await interaction.followup.send(embed=embed)
