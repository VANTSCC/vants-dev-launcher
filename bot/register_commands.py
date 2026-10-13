"""Registra los slash commands del bot VANTS en Discord.

Los comandos los atiende la Edge Function `discord-commands` de Supabase. En el
portal de desarrolladores de Discord, "Interactions Endpoint URL" debe ser:
    https://qtetsgwwsvqzquxssudj.supabase.co/functions/v1/discord-commands

Uso:
    DISCORD_TOKEN=... DISCORD_APP_ID=... [DISCORD_GUILD_ID=...] python register_commands.py

Con DISCORD_GUILD_ID se registran en ese servidor (instantáneo); sin él, globales
(pueden tardar hasta una hora). Reemplaza el conjunto completo de comandos.
"""
import json
import os
import sys
import urllib.request

SUB, GROUP, STRING, INTEGER, USER, CHANNEL = 1, 2, 3, 4, 6, 7
TEXT_CHANNEL, ANNOUNCEMENT_CHANNEL = 0, 5
MANAGE_GUILD = str(1 << 5)

CATEGORIAS = [{"name": c, "value": c} for c in ("anuncios", "registros", "ranked", "staff", "logs")]
FORMATOS = [
    {"name": "Eliminación simple", "value": "single_elimination"},
    {"name": "Doble eliminación", "value": "double_elimination"},
    {"name": "Liga (round robin)", "value": "round_robin"},
    {"name": "Suizo", "value": "swiss"},
]
ESTADOS = [
    {"name": "Inscripción abierta", "value": "registration"},
    {"name": "Inscripción cerrada", "value": "closed"},
    {"name": "En curso", "value": "in_progress"},
    {"name": "Finalizado", "value": "completed"},
    {"name": "Cancelado", "value": "cancelled"},
]


def opt(type_, name, description, required=False, **extra):
    return {"type": type_, "name": name, "description": description, "required": required, **extra}


COMMANDS = [
    {"name": "ayuda", "description": "Lista de comandos de VANTS"},
    {"name": "web", "description": "Enlaces de la plataforma VANTS"},
    {"name": "vincular", "description": "Conecta tu Discord con tu cuenta de la web"},
    {"name": "perfil", "description": "Perfil competitivo VANTS", "options": [opt(USER, "usuario", "Jugador a consultar (por defecto tú)")]},
    {"name": "ranking", "description": "Top 10 de la temporada ranked"},
    {"name": "torneos", "description": "Torneos abiertos y próximos"},
    {"name": "torneo", "description": "Acciones de torneo", "options": [
        opt(SUB, "inscribir", "Inscribirte en un torneo", options=[opt(STRING, "torneo", "Identificador del torneo (ver /torneos)", True)]),
    ]},
    {"name": "eventos", "description": "Próximos eventos de la comunidad"},
    {"name": "calendario", "description": "Lo que viene en los próximos 7 días"},
    {"name": "planes", "description": "Planes BASIC, PRO y ELITE"},
    {"name": "vants", "description": "Administración de VANTS (staff)", "default_member_permissions": MANAGE_GUILD, "dm_permission": False, "options": [
        opt(SUB, "canal", "Elegir el canal de cada tipo de notificación", options=[
            opt(STRING, "categoria", "Tipo de notificación", True, choices=CATEGORIAS),
            opt(CHANNEL, "canal", "Canal de texto", True, channel_types=[TEXT_CHANNEL, ANNOUNCEMENT_CHANNEL]),
        ]),
        opt(SUB, "estado", "Ver canales configurados y entregas recientes"),
        opt(SUB, "torneo-crear", "Publicar un torneo en la web", options=[
            opt(STRING, "nombre", "Nombre del torneo", True, max_length=100),
            opt(STRING, "inicio", "Fecha de inicio AAAA-MM-DD HH:MM", True),
            opt(STRING, "formato", "Formato", choices=FORMATOS),
            opt(INTEGER, "plazas", "Máximo de participantes", min_value=2, max_value=512),
            opt(STRING, "premio", "Premio", max_length=60),
            opt(STRING, "cierre", "Cierre de inscripción AAAA-MM-DD HH:MM"),
            opt(STRING, "nivel", "Nivel (open, pro, elite)"),
            opt(STRING, "descripcion", "Descripción", max_length=1000),
        ]),
        opt(SUB, "torneo-estado", "Cambiar el estado de un torneo", options=[
            opt(STRING, "torneo", "Identificador del torneo", True),
            opt(STRING, "estado", "Nuevo estado", True, choices=ESTADOS),
        ]),
        opt(SUB, "evento-crear", "Publicar un evento en el calendario", options=[
            opt(STRING, "titulo", "Título", True, max_length=120),
            opt(STRING, "inicio", "Fecha de inicio AAAA-MM-DD HH:MM", True),
            opt(STRING, "fin", "Fecha de fin AAAA-MM-DD HH:MM"),
            opt(STRING, "tipo", "Tipo (scrim, watch party, torneo, comunidad)"),
            opt(STRING, "lugar", "Lugar o canal"),
            opt(INTEGER, "aforo", "Aforo máximo", min_value=1, max_value=10000),
            opt(STRING, "descripcion", "Descripción", max_length=1000),
        ]),
        opt(SUB, "temporada-iniciar", "Cerrar la temporada activa y abrir una nueva", options=[
            opt(STRING, "fin", "Fecha de fin AAAA-MM-DD HH:MM", True),
            opt(STRING, "nombre", "Nombre (por defecto Temporada N)"),
        ]),
    ]},
    # Moderación
    {"name": "warn", "description": "Advertir a un usuario", "options": [opt(USER, "usuario", "Usuario a advertir", True), opt(STRING, "razon", "Razón", True)]},
    {"name": "kick", "description": "Expulsar a un usuario", "options": [opt(USER, "usuario", "Usuario a expulsar", True), opt(STRING, "razon", "Razón", True)]},
    {"name": "ban", "description": "Banear a un usuario", "options": [opt(USER, "usuario", "Usuario a banear", True), opt(STRING, "razon", "Razón", True), opt(INTEGER, "borrar_dias", "Días de mensajes a borrar (0-7)")]},
    {"name": "mute", "description": "Silenciar a un usuario", "options": [opt(USER, "usuario", "Usuario a silenciar", True), opt(INTEGER, "minutos", "Minutos", True), opt(STRING, "razon", "Razón", True)]},
    {"name": "unmute", "description": "Quitar el silencio a un usuario", "options": [opt(USER, "usuario", "Usuario a dessilenciar", True)]},
    {"name": "clear", "description": "Borrar mensajes del canal", "options": [opt(INTEGER, "cantidad", "Número de mensajes (máx 100)", True)]},
    {"name": "lock", "description": "Bloquear el canal actual"},
    {"name": "unlock", "description": "Desbloquear el canal actual"},
    # Análisis
    {"name": "stats_servidor", "description": "Estadísticas del servidor y la plataforma"},
    {"name": "stats_jugador", "description": "Estadísticas VANTS de un jugador", "options": [opt(USER, "usuario", "Jugador a consultar (por defecto tú)")]},
    {"name": "actividad", "description": "Mensajes por canal en los últimos días", "options": [opt(INTEGER, "dias", "Días a analizar (por defecto 7)")]},
    {"name": "top", "description": "Top 10 miembros más activos", "options": [opt(INTEGER, "dias", "Días a analizar (por defecto 7)")]},
    # Informes
    {"name": "informe", "description": "Informe semanal de VANTCALL"},
    {"name": "resumen", "description": "Resumen actual de la plataforma"},
    # Comunidad
    {"name": "anuncio", "description": "Publicar un anuncio en #anuncios", "options": [opt(STRING, "titulo", "Título", True), opt(STRING, "mensaje", "Contenido", True), opt(STRING, "imagen", "URL de imagen")]},
    {"name": "evento_crear", "description": "Crear un evento en la plataforma", "options": [opt(STRING, "titulo", "Título", True), opt(STRING, "tipo", "Tipo (torneo, evento, scrim)", True), opt(STRING, "fecha", "YYYY-MM-DD o YYYY-MM-DD HH:MM", True), opt(STRING, "descripcion", "Descripción")]},
    {"name": "torneo_crear", "description": "Crear un torneo", "options": [opt(STRING, "nombre", "Nombre del torneo", True), opt(STRING, "formato", "Formato", choices=FORMATOS, required=True), opt(STRING, "fecha_inicio", "YYYY-MM-DD", True), opt(INTEGER, "max_participantes", "Máximo de jugadores")]},
    {"name": "recordatorio", "description": "Programar un recordatorio en este canal", "options": [opt(STRING, "mensaje", "Mensaje", True), opt(INTEGER, "minutos", "En cuántos minutos", True)]},
]


def main() -> None:
    token = os.environ.get("DISCORD_TOKEN")
    app_id = os.environ.get("DISCORD_APP_ID")
    guild = os.environ.get("DISCORD_GUILD_ID")
    if not token or not app_id:
        sys.exit("Faltan DISCORD_TOKEN y/o DISCORD_APP_ID")
    path = f"/applications/{app_id}/guilds/{guild}/commands" if guild else f"/applications/{app_id}/commands"
    req = urllib.request.Request(
        "https://discord.com/api/v10" + path,
        data=json.dumps(COMMANDS).encode(),
        method="PUT",
        headers={"Authorization": f"Bot {token}", "Content-Type": "application/json", "User-Agent": "VANTS (register, 1.0)"},
    )
    with urllib.request.urlopen(req) as res:
        registered = json.loads(res.read())
    print(f"Registrados {len(registered)} comandos {'en el servidor ' + guild if guild else 'globales'}:")
    for c in registered:
        print(" -", c["name"])


if __name__ == "__main__":
    main()
