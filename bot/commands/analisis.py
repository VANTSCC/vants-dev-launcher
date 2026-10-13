import discord
from discord import app_commands
from datetime import datetime, timezone, timedelta
from collections import Counter

from utils.db import fetch_one, fetch_val


async def stats_servidor_handler(interaction: discord.Interaction) -> None:
    await interaction.response.defer()
    guild = interaction.guild
    try:
        players = await fetch_val("SELECT count(*) FROM players")
        tournaments = await fetch_val("SELECT count(*) FROM tournaments")
        matches = await fetch_val("SELECT count(*) FROM ranked_matches WHERE status = 'completed'")
    except Exception:
        await interaction.followup.send("❌ No se pudo consultar la base de datos ahora.", ephemeral=True)
        return
    embed = discord.Embed(title="📊 Stats del servidor VANTS", color=0x00B6AF, timestamp=datetime.now(timezone.utc))
    embed.add_field(name="Miembros Discord", value=str(guild.member_count), inline=True)
    embed.add_field(name="Jugadores registrados", value=str(players or 0), inline=True)
    embed.add_field(name="Torneos", value=str(tournaments or 0), inline=True)
    embed.add_field(name="Partidas ranked", value=str(matches or 0), inline=True)
    embed.add_field(name="Canales", value=str(len(guild.channels)), inline=True)
    embed.add_field(name="Roles", value=str(len(guild.roles)), inline=True)
    await interaction.followup.send(embed=embed)


async def stats_jugador_handler(interaction: discord.Interaction, usuario: discord.User | None = None) -> None:
    await interaction.response.defer()
    target = usuario or interaction.user
    try:
        p = await fetch_one("SELECT * FROM players WHERE discord_user_id = %s LIMIT 1", (str(target.id),))
        s = None
        if p:
            s = await fetch_one(
                "SELECT l.* FROM leaderboard l LEFT JOIN seasons se ON se.id = l.season_id "
                "WHERE l.player_id = %s "
                "ORDER BY (se.status = 'active') DESC NULLS LAST, se.season_number DESC NULLS LAST LIMIT 1",
                (p["id"],),
            )
    except Exception:
        await interaction.followup.send("❌ No se pudo consultar la base de datos ahora.", ephemeral=True)
        return
    if not p:
        await interaction.followup.send(f"❌ {target.mention} no tiene perfil VANTS vinculado.")
        return
    embed = discord.Embed(title=f"🎮 Stats de {p.get('display_name') or p['username']}", color=0xE67277)
    embed.add_field(name="Username", value=f"@{p['username']}", inline=True)
    embed.add_field(name="Juego principal", value=p.get("main_game") or "—", inline=True)
    embed.add_field(name="Región", value=p.get("region") or "—", inline=True)
    if s:
        embed.add_field(name="Rango", value=s.get("rank") or "Unranked", inline=True)
        embed.add_field(name="MMR", value=str(s.get("mmr") or 0), inline=True)
        embed.add_field(name="V/D", value=f"{s.get('wins') or 0} / {s.get('losses') or 0}", inline=True)
    embed.set_thumbnail(url=p.get("avatar_url") or target.display_avatar.url)
    await interaction.followup.send(embed=embed)


async def actividad_handler(interaction: discord.Interaction, dias: int = 7) -> None:
    await interaction.response.defer()
    guild = interaction.guild
    cutoff = datetime.now(timezone.utc) - timedelta(days=dias)
    total = 0
    by_channel = Counter()
    for channel in guild.text_channels:
        try:
            async for msg in channel.history(limit=None, after=cutoff):
                if msg.author.bot:
                    continue
                total += 1
                by_channel[channel.name] += 1
        except discord.Forbidden:
            continue
    top = by_channel.most_common(5)
    embed = discord.Embed(title=f"📈 Actividad últimos {dias} días", color=0x9C27B0)
    embed.add_field(name="Mensajes totales", value=str(total), inline=False)
    if top:
        embed.add_field(name="Canales más activos", value="\n".join(f"#{c}: {n}" for c, n in top), inline=False)
    await interaction.followup.send(embed=embed)


async def top_handler(interaction: discord.Interaction, dias: int = 7) -> None:
    await interaction.response.defer()
    guild = interaction.guild
    cutoff = datetime.now(timezone.utc) - timedelta(days=dias)
    by_user = Counter()
    for channel in guild.text_channels:
        try:
            async for msg in channel.history(limit=None, after=cutoff):
                if msg.author.bot:
                    continue
                by_user[msg.author.display_name] += 1
        except discord.Forbidden:
            continue
    top = by_user.most_common(10)
    embed = discord.Embed(title=f"🏆 Top 10 miembros más activos ({dias} días)", color=0xFFD700)
    if top:
        medals = ["🥇", "🥈", "🥉"] + ["▫️"] * 7
        embed.description = "\n".join(f"{medals[i]} **{name}** — {count} mensajes" for i, (name, count) in enumerate(top))
    else:
        embed.description = "Sin actividad en el período."
    await interaction.followup.send(embed=embed)
