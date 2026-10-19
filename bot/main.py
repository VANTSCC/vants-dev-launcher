import asyncio
import os
from dotenv import load_dotenv

load_dotenv()

import discord
from discord import app_commands

from commands.perfil import perfil_handler
from commands.verificar import verificar_handler
from commands.vincular import vincular_riot_handler
from commands.agente import registrar as registrar_agente
from commands.moderacion import (
    warn_handler, kick_handler, ban_handler, mute_handler,
    unmute_handler, clear_handler, lock_handler, unlock_handler,
)
from commands.analisis import (
    stats_servidor_handler, stats_jugador_handler,
    actividad_handler, top_handler,
)
from commands.informes import informe_semanal_handler, resumen_handler
from commands.comunidad import (
    anuncio_handler, evento_crear_handler,
    torneo_crear_handler, recordatorio_handler,
)
from utils.health import start_health_server
from utils.db import execute, fetch_all, fetch_one
from alerts import start_alerts
from supervisor import start_supervisor
from agent_bridge import start_agent_bridge


def required_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"Falta la variable de entorno {name}")
    return value


TOKEN = required_env("DISCORD_TOKEN")
GUILD_ID = int(required_env("DISCORD_GUILD_ID"))
GUILD = discord.Object(id=GUILD_ID)

intents = discord.Intents.default()
client = discord.Client(intents=intents)
tree = app_commands.CommandTree(client)


# ─────────────────────────────────────────────────────────────────────────────
# GRUPO: vincular
# ─────────────────────────────────────────────────────────────────────────────
vincular_group = app_commands.Group(
    name="vincular",
    description="Vincula una cuenta externa a tu perfil VANTS",
)


@vincular_group.command(name="riot", description="Vincula tu cuenta de Riot (Valorant)")
@app_commands.describe(handle="Tu Riot ID completo, por ejemplo: Nombre#TAG")
async def vincular_riot(interaction: discord.Interaction, handle: str) -> None:
    await vincular_riot_handler(interaction, handle)


tree.add_command(vincular_group, guild=GUILD)


# ─────────────────────────────────────────────────────────────────────────────
# COMANDO: perfil
# ─────────────────────────────────────────────────────────────────────────────
@tree.command(guild=GUILD, name="perfil", description="Muestra el perfil VANTS de un jugador")
@app_commands.describe(usuario="Jugador a consultar (opcional, por defecto tú)")
async def perfil_command(interaction: discord.Interaction, usuario: discord.User | None = None) -> None:
    await perfil_handler(interaction, usuario)


# ─────────────────────────────────────────────────────────────────────────────
# COMANDO: verificar
# ─────────────────────────────────────────────────────────────────────────────
@tree.command(guild=GUILD, name="verificar", description="Comprueba si tu Discord esta verificado en VANTS")
async def verificar_command(interaction: discord.Interaction) -> None:
    await verificar_handler(interaction)


# ─────────────────────────────────────────────────────────────────────────────
# COMANDO: setup (ACTUALIZADO - Usa canales existentes con IDs fijas)
# ─────────────────────────────────────────────────────────────────────────────
@tree.command(guild=GUILD, name="setup", description="Configura automáticamente los canales de VANTCALL")
@app_commands.checks.has_permissions(administrator=True)
async def setup_command(interaction: discord.Interaction) -> None:
    await interaction.response.defer(ephemeral=True)
    
    guild = interaction.guild
    guild_id = str(guild.id)
    
    try:
        # IDs de canales fijos (ya existentes en tu servidor)
        canales_ids = {
            "welcome": "1546654795186577488",
            "anuncios": "1553634435671396432",
            "tryouts": "1553938201754730506",
            "resultados": "1553938926320877669",
            "estadisticas": "1553863844915585146",
            "sup": "1553659242458652733",
            "torneos": "1553659315565367307",
        }
        
        # Obtener objetos de canal
        canales = {}
        for nombre, canal_id in canales_ids.items():
            canal = guild.get_channel(int(canal_id))
            if canal:
                canales[nombre] = canal
        
        # Guardar en Neon: una fila por categoría en discord_channels.
        # DO NOTHING para no pisar los canales ya elegidos con /vants canal.
        categorias = {
            "anuncios": canales_ids["anuncios"],
            "registros": canales_ids["welcome"],
            "ranked": canales_ids["resultados"],
            "staff": canales_ids["sup"],
        }
        for categoria, channel_id in categorias.items():
            await execute(
                "INSERT INTO discord_channels (category, channel_id, guild_id, updated_by) "
                "VALUES (%s, %s, %s, %s) ON CONFLICT (category) DO NOTHING",
                (categoria, channel_id, guild_id, str(interaction.user.id)),
            )
        
        # Mensaje de éxito
        embed = discord.Embed(
            title="✅ Servidor configurado",
            description=f"**{guild.name}** está listo para VANTCALL",
            color=0x00FF00
        )
        
        embed.add_field(
            name="📢 Canales configurados",
            value=(
                f"• {canales['anuncios'].mention} - Anuncios\n"
                f"• {canales['tryouts'].mention} - Tryouts\n"
                f"• {canales['resultados'].mention} - Resultados\n"
                f"• {canales['torneos'].mention} - Torneos\n"
                f"• {canales['estadisticas'].mention} - Estadísticas\n"
                f"• {canales['sup'].mention} - Sup\n"
            ),
            inline=False
        )
        
        embed.add_field(
            name="🚀 Primeros pasos",
            value=(
                "Usa `/perfil` para ver tu perfil\n"
                "Usa `/vincular riot <ID>` para conectar tu cuenta\n"
                "Los anuncios de torneos llegarán a " + canales["anuncios"].mention
            ),
            inline=False
        )
        
        # Enviar mensaje en el canal de anuncios con @everyone
        await canales["anuncios"].send(
            content="@everyone 🏆 **VANTCALL ya está disponible en este servidor**",
            embed=embed
        )
        
        # Confirmación para el admin
        await interaction.followup.send(
            "✅ Canales configurados y anuncio enviado a " + canales["anuncios"].mention,
            ephemeral=True
        )
        
    except Exception as e:
        await interaction.followup.send(f"❌ Error: {str(e)}", ephemeral=True)


# ─────────────────────────────────────────────────────────────────────────────
# GRUPO: valorant
# ─────────────────────────────────────────────────────────────────────────────
valorant_group = app_commands.Group(
    name="valorant",
    description="Ranking y perfiles de Valorant",
)


ACTIVE_SEASON_SQL = (
    "(SELECT id FROM seasons ORDER BY (status = 'active') DESC, season_number DESC NULLS LAST LIMIT 1)"
)


async def _get_valorant_ranking() -> list[dict]:
    return await fetch_all(
        "SELECT row_number() OVER (ORDER BY l.mmr DESC) AS rank_position, "
        "COALESCE(l.display_name, l.username) AS display_name, l.rank, l.mmr AS rr, l.wins, "
        "CASE WHEN l.wins + l.losses > 0 THEN round(100.0 * l.wins / (l.wins + l.losses), 1) ELSE 0 END AS win_rate "
        f"FROM leaderboard l WHERE l.season_id = {ACTIVE_SEASON_SQL} "
        "ORDER BY l.mmr DESC LIMIT 10"
    )


async def _get_valorant_profile(discord_id: str) -> dict | None:
    row = await fetch_one(
        "SELECT p.id, p.username, p.display_name, p.region FROM players p "
        "WHERE p.discord_user_id = %s "
        "OR p.id = (SELECT player_id FROM player_discord_accounts WHERE discord_id = %s LIMIT 1) "
        "LIMIT 1",
        (discord_id, discord_id),
    )
    if not row:
        return None

    stats = await fetch_one(
        "SELECT l.rank, l.mmr AS rr, l.wins + l.losses AS games_played, l.wins, l.losses, "
        "CASE WHEN l.wins + l.losses > 0 THEN round(100.0 * l.wins / (l.wins + l.losses), 1) ELSE 0 END AS win_rate, "
        "l.region, "
        "(SELECT count(*) + 1 FROM leaderboard o WHERE o.season_id = l.season_id AND o.mmr > l.mmr) AS rank_position "
        f"FROM leaderboard l WHERE l.player_id = %s AND l.season_id = {ACTIVE_SEASON_SQL}",
        (row["id"],),
    )
    if not stats:
        return None

    return {
        "player": row,
        "stats": {**stats, "peak_rank": None, "act": None},
        "rank_position": stats.get("rank_position"),
    }


def _safe_discord_text(value: object, limit: int = 80) -> str:
    text = str(value or "—").replace("@everyone", "@\u200beveryone").replace("@here", "@\u200bhere")
    return text[:limit]


@valorant_group.command(name="ranking", description="Muestra el top 10 de Valorant")
async def valorant_ranking(interaction: discord.Interaction) -> None:
    await interaction.response.defer()

    try:
        rows = await _get_valorant_ranking()
    except Exception:
        await interaction.followup.send(
            "No se pudo cargar el ranking de Valorant ahora mismo.",
            ephemeral=True,
        )
        return

    if not rows:
        await interaction.followup.send(
            "Aún no hay jugadores en el ranking de Valorant.",
            ephemeral=False,
        )
        return

    embed = discord.Embed(
        title="Ranking de Valorant · Top 10",
        color=discord.Color(0xFF4655),
    )

    lines = []
    for row in rows:
        name = _safe_discord_text(row.get("display_name"), 32)
        rank = _safe_discord_text(row.get("rank"), 24)
        rr = row.get("rr", 0)
        wins = row.get("wins", 0)
        win_rate = float(row.get("win_rate") or 0)
        position = row.get("rank_position", "?")
        lines.append(
            f"**{position}.** {name} — **{rank} {rr} MMR** · "
            f"{wins} victorias · {win_rate:.1f}% WR"
        )

    embed.description = "\n".join(lines)
    await interaction.followup.send(embed=embed, ephemeral=False)


@valorant_group.command(name="perfil", description="Muestra las stats de Valorant de un jugador")
@app_commands.describe(usuario="Jugador a consultar; si se omite, muestra tu perfil")
async def valorant_perfil(
    interaction: discord.Interaction,
    usuario: discord.User | None = None,
) -> None:
    target = usuario or interaction.user

    try:
        result = await _get_valorant_profile(str(target.id))
    except Exception:
        await interaction.response.send_message(
            "No se pudieron cargar las stats de Valorant ahora mismo.",
            ephemeral=True,
        )
        return

    if not result:
        await interaction.response.send_message(
            f"No hay perfil VANTS o stats de Valorant sincronizadas para {target.mention}.",
            ephemeral=True,
            allowed_mentions=discord.AllowedMentions.none(),
        )
        return

    player = result["player"]
    stats = result["stats"]
    name = _safe_discord_text(player.get("display_name") or player.get("username"))
    games = stats.get("games_played") or 0
    wins = stats.get("wins") or 0
    losses = stats.get("losses") or 0
    win_rate = float(stats.get("win_rate") or 0)
    position = result.get("rank_position")

    embed = discord.Embed(
        title=f"Valorant · {name}",
        color=discord.Color(0xFF4655),
    )
    embed.add_field(
        name="Rango actual",
        value=f"{_safe_discord_text(stats.get('rank'), 32)} · {stats.get('rr') or 0} MMR",
        inline=True,
    )
    embed.add_field(
        name="Posición",
        value=f"#{position}" if position else "Sin clasificar",
        inline=True,
    )
    embed.add_field(
        name="Rango máximo",
        value=_safe_discord_text(stats.get("peak_rank"), 32),
        inline=True,
    )
    embed.add_field(
        name="Victorias / derrotas",
        value=f"{wins} / {losses} · {win_rate:.1f}% WR",
        inline=True,
    )
    embed.add_field(name="Partidas", value=str(games), inline=True)
    embed.add_field(
        name="Acto / región",
        value=(
            f"{_safe_discord_text(stats.get('act'), 24)} · "
            f"{_safe_discord_text(stats.get('region') or player.get('region'), 24)}"
        ),
        inline=True,
    )

    await interaction.response.send_message(embed=embed, ephemeral=True)


tree.add_command(valorant_group, guild=GUILD)


# ─────────────────────────────────────────────────────────────────────────────
# MODERACIÓN
# ─────────────────────────────────────────────────────────────────────────────
@tree.command(guild=GUILD, name="warn", description="Advertir a un usuario")
@app_commands.describe(usuario="Usuario a advertir", razon="Razón de la advertencia")
async def warn_cmd(interaction: discord.Interaction, usuario: discord.Member, razon: str) -> None:
    await warn_handler(interaction, usuario, razon)


@tree.command(guild=GUILD, name="kick", description="Expulsar a un usuario del servidor")
@app_commands.describe(usuario="Usuario a expulsar", razon="Razón")
async def kick_cmd(interaction: discord.Interaction, usuario: discord.Member, razon: str) -> None:
    await kick_handler(interaction, usuario, razon)


@tree.command(guild=GUILD, name="ban", description="Banear a un usuario")
@app_commands.describe(usuario="Usuario a banear", razon="Razón", borrar_dias="Días de mensajes a borrar (0-7)")
async def ban_cmd(interaction: discord.Interaction, usuario: discord.Member, razon: str, borrar_dias: int = 0) -> None:
    await ban_handler(interaction, usuario, razon, borrar_dias)


@tree.command(guild=GUILD, name="mute", description="Silenciar a un usuario (timeout)")
@app_commands.describe(usuario="Usuario a silenciar", minutos="Minutos de silencio", razon="Razón")
async def mute_cmd(interaction: discord.Interaction, usuario: discord.Member, minutos: int, razon: str) -> None:
    await mute_handler(interaction, usuario, minutos, razon)


@tree.command(guild=GUILD, name="unmute", description="Quitar el silencio a un usuario")
@app_commands.describe(usuario="Usuario a dessilenciar")
async def unmute_cmd(interaction: discord.Interaction, usuario: discord.Member) -> None:
    await unmute_handler(interaction, usuario)


@tree.command(guild=GUILD, name="clear", description="Borrar mensajes del canal (máx 100)")
@app_commands.describe(cantidad="Número de mensajes a borrar")
async def clear_cmd(interaction: discord.Interaction, cantidad: int) -> None:
    await clear_handler(interaction, cantidad)


@tree.command(guild=GUILD, name="lock", description="Bloquear el canal actual (nadie escribe)")
async def lock_cmd(interaction: discord.Interaction) -> None:
    await lock_handler(interaction)


@tree.command(guild=GUILD, name="unlock", description="Desbloquear el canal actual")
async def unlock_cmd(interaction: discord.Interaction) -> None:
    await unlock_handler(interaction)


# ─────────────────────────────────────────────────────────────────────────────
# ANÁLISIS
# ─────────────────────────────────────────────────────────────────────────────
@tree.command(guild=GUILD, name="stats_servidor", description="Estadísticas del servidor y la plataforma")
async def stats_servidor_cmd(interaction: discord.Interaction) -> None:
    await stats_servidor_handler(interaction)


@tree.command(guild=GUILD, name="stats_jugador", description="Estadísticas VANTS de un jugador")
@app_commands.describe(usuario="Jugador a consultar (opcional, por defecto tú)")
async def stats_jugador_cmd(interaction: discord.Interaction, usuario: discord.User | None = None) -> None:
    await stats_jugador_handler(interaction, usuario)


@tree.command(guild=GUILD, name="actividad", description="Mensajes por canal en los últimos días")
@app_commands.describe(dias="Días a analizar (por defecto 7)")
async def actividad_cmd(interaction: discord.Interaction, dias: int = 7) -> None:
    await actividad_handler(interaction, dias)


@tree.command(guild=GUILD, name="top", description="Top 10 miembros más activos")
@app_commands.describe(dias="Días a analizar (por defecto 7)")
async def top_cmd(interaction: discord.Interaction, dias: int = 7) -> None:
    await top_handler(interaction, dias)


# ─────────────────────────────────────────────────────────────────────────────
# INFORMES
# ─────────────────────────────────────────────────────────────────────────────
@tree.command(guild=GUILD, name="informe", description="Informe semanal de VANTCALL")
async def informe_cmd(interaction: discord.Interaction) -> None:
    await informe_semanal_handler(interaction)


@tree.command(guild=GUILD, name="resumen", description="Resumen actual de la plataforma")
async def resumen_cmd(interaction: discord.Interaction) -> None:
    await resumen_handler(interaction)


# ─────────────────────────────────────────────────────────────────────────────
# COMUNIDAD
# ─────────────────────────────────────────────────────────────────────────────
@tree.command(guild=GUILD, name="anuncio", description="Publicar un anuncio en #anuncios")
@app_commands.describe(titulo="Título del anuncio", mensaje="Contenido", imagen="URL de imagen (opcional)")
async def anuncio_cmd(interaction: discord.Interaction, titulo: str, mensaje: str, imagen: str | None = None) -> None:
    await anuncio_handler(interaction, titulo, mensaje, imagen)


@tree.command(guild=GUILD, name="evento_crear", description="Crear un evento en la plataforma")
@app_commands.describe(titulo="Título", tipo="Tipo (torneo, evento, scrim)", fecha="YYYY-MM-DD o YYYY-MM-DD HH:MM", descripcion="Descripción (opcional)")
async def evento_crear_cmd(interaction: discord.Interaction, titulo: str, tipo: str, fecha: str, descripcion: str | None = None) -> None:
    await evento_crear_handler(interaction, titulo, tipo, fecha, descripcion)


@tree.command(guild=GUILD, name="torneo_crear", description="Crear un torneo")
@app_commands.describe(nombre="Nombre del torneo", formato="single_elimination, double_elimination, round_robin", fecha_inicio="YYYY-MM-DD", max_participantes="Máximo de jugadores")
async def torneo_crear_cmd(interaction: discord.Interaction, nombre: str, formato: str, fecha_inicio: str, max_participantes: int = 16) -> None:
    await torneo_crear_handler(interaction, nombre, formato, fecha_inicio, max_participantes)


@tree.command(guild=GUILD, name="recordatorio", description="Programar un recordatorio en este canal")
@app_commands.describe(mensaje="Mensaje del recordatorio", minutos="En cuántos minutos")
async def recordatorio_cmd(interaction: discord.Interaction, mensaje: str, minutos: int) -> None:
    await recordatorio_handler(interaction, mensaje, minutos)


# ─────────────────────────────────────────────────────────────────────────────
# AGENTE VANTS (control total de la plataforma)
# ─────────────────────────────────────────────────────────────────────────────
registrar_agente(tree, GUILD)


# ─────────────────────────────────────────────────────────────────────────────
# EVENTOS
# ─────────────────────────────────────────────────────────────────────────────
@client.event
async def on_ready() -> None:
    await start_health_server()
    await tree.sync(guild=GUILD)
    start_alerts(client)
    start_supervisor(client)
    start_agent_bridge(client)
    print(f"✅ vantcall conectado como {client.user}")
    print(f"📋 Comandos registrados en guild {GUILD_ID}")
    print(f"🛡️ Supervisor de la web activo → DM {os.getenv('SUPERVISOR_DM_ID') or '1532612429295521930'}")
    print("🤖 Agente VANTS activo: /agente estado · informe · incidentes · resolver · comando")


client.run(TOKEN)
