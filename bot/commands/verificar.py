import discord

from utils.db import fetch_one


async def verificar_handler(interaction: discord.Interaction) -> None:
    """Responde (solo al usuario) si su Discord esta vinculado a un jugador VANTS."""
    await interaction.response.defer(ephemeral=True)

    try:
        player = await fetch_one(
            "SELECT p.id, p.username, p.display_name FROM players p "
            "WHERE p.discord_user_id = %s "
            "OR p.id = (SELECT player_id FROM player_discord_accounts WHERE discord_id = %s LIMIT 1) "
            "LIMIT 1",
            (str(interaction.user.id), str(interaction.user.id)),
        )
    except Exception:
        await interaction.followup.send(
            "No se pudo comprobar tu verificacion ahora mismo. Intentalo de nuevo en unos minutos.",
            ephemeral=True,
        )
        return

    is_admin = bool(
        getattr(interaction.user, "guild_permissions", None)
        and interaction.user.guild_permissions.administrator
    )

    if not player:
        await interaction.followup.send(
            "Todavia no estas verificado. Vincula tu Discord con tu cuenta VANTS en la web "
            "(https://feispla.github.io/Vants/) y vuelve a ejecutar `/verificar`.",
            ephemeral=True,
        )
        return

    name = (player.get("display_name") or player.get("username") or interaction.user.name)[:40]
    name = name.replace("@everyone", "@\u200beveryone").replace("@here", "@\u200bhere")
    rol = "Administrador" if is_admin else "Jugador"
    await interaction.followup.send(
        f"Verificado como **{name}** · Rol: **{rol}**",
        ephemeral=True,
        allowed_mentions=discord.AllowedMentions.none(),
    )
