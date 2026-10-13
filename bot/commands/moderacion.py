import discord
from discord import app_commands
from datetime import timedelta

STAFF_ROLE_NAMES = {"staff", "admin", "moderador", "owner"}


def is_staff(interaction: discord.Interaction) -> bool:
    if interaction.user.guild_permissions.administrator:
        return True
    user_roles = {r.name.lower() for r in interaction.user.roles}
    return any(r in user_roles for r in STAFF_ROLE_NAMES)


async def warn_handler(interaction: discord.Interaction, usuario: discord.Member, razon: str) -> None:
    if not is_staff(interaction):
        await interaction.response.send_message("❌ Solo el staff puede usar este comando.", ephemeral=True)
        return
    await interaction.response.defer()
    embed = discord.Embed(title="⚠️ Advertencia", color=0xFFC107)
    embed.add_field(name="Usuario", value=usuario.mention, inline=True)
    embed.add_field(name="Razón", value=razon, inline=True)
    embed.add_field(name="Moderador", value=interaction.user.mention, inline=True)
    try:
        await usuario.send(f"Has recibido una advertencia en **{interaction.guild.name}**: {razon}")
    except discord.Forbidden:
        pass
    await interaction.followup.send(embed=embed)


async def kick_handler(interaction: discord.Interaction, usuario: discord.Member, razon: str) -> None:
    if not is_staff(interaction):
        await interaction.response.send_message("❌ Solo el staff puede usar este comando.", ephemeral=True)
        return
    await interaction.response.defer()
    await usuario.kick(reason=razon)
    embed = discord.Embed(title="👢 Usuario expulsado", color=0xFF5722)
    embed.add_field(name="Usuario", value=f"{usuario} ({usuario.id})", inline=True)
    embed.add_field(name="Razón", value=razon, inline=True)
    await interaction.followup.send(embed=embed)


async def ban_handler(interaction: discord.Interaction, usuario: discord.Member, razon: str, borrar_dias: int = 0) -> None:
    if not is_staff(interaction):
        await interaction.response.send_message("❌ Solo el staff puede usar este comando.", ephemeral=True)
        return
    await interaction.response.defer()
    await usuario.ban(reason=razon, delete_message_days=borrar_dias)
    embed = discord.Embed(title="🔨 Usuario baneado", color=0xF44336)
    embed.add_field(name="Usuario", value=f"{usuario} ({usuario.id})", inline=True)
    embed.add_field(name="Razón", value=razon, inline=True)
    await interaction.followup.send(embed=embed)


async def mute_handler(interaction: discord.Interaction, usuario: discord.Member, minutos: int, razon: str) -> None:
    if not is_staff(interaction):
        await interaction.response.send_message("❌ Solo el staff puede usar este comando.", ephemeral=True)
        return
    await interaction.response.defer()
    await usuario.timeout(timedelta(minutes=minutos), reason=razon)
    embed = discord.Embed(title="🔇 Usuario silenciado", color=0x9E9E9E)
    embed.add_field(name="Usuario", value=usuario.mention, inline=True)
    embed.add_field(name="Duración", value=f"{minutos} minutos", inline=True)
    embed.add_field(name="Razón", value=razon, inline=True)
    await interaction.followup.send(embed=embed)


async def unmute_handler(interaction: discord.Interaction, usuario: discord.Member) -> None:
    if not is_staff(interaction):
        await interaction.response.send_message("❌ Solo el staff puede usar este comando.", ephemeral=True)
        return
    await interaction.response.defer()
    await usuario.timeout(None)
    await interaction.followup.send(f"🔊 {usuario.mention} ya no está silenciado.")


async def clear_handler(interaction: discord.Interaction, cantidad: int) -> None:
    if not is_staff(interaction):
        await interaction.response.send_message("❌ Solo el staff puede usar este comando.", ephemeral=True)
        return
    await interaction.response.defer(ephemeral=True)
    deleted = await interaction.channel.purge(limit=min(cantidad, 100))
    await interaction.followup.send(f"🗑️ Eliminados {len(deleted)} mensajes.", ephemeral=True)


async def lock_handler(interaction: discord.Interaction) -> None:
    if not is_staff(interaction):
        await interaction.response.send_message("❌ Solo el staff puede usar este comando.", ephemeral=True)
        return
    await interaction.response.defer()
    channel = interaction.channel
    await channel.set_permissions(interaction.guild.default_role, send_messages=False)
    await interaction.followup.send(f"🔒 Canal {channel.mention} bloqueado.")


async def unlock_handler(interaction: discord.Interaction) -> None:
    if not is_staff(interaction):
        await interaction.response.send_message("❌ Solo el staff puede usar este comando.", ephemeral=True)
        return
    await interaction.response.defer()
    channel = interaction.channel
    await channel.set_permissions(interaction.guild.default_role, send_messages=None)
    await interaction.followup.send(f"🔓 Canal {channel.mention} desbloqueado.")
