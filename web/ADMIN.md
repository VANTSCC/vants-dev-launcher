# Panel admin (`#/admin`)

Pestañas: Resumen (estado del bot por latido, contadores, interruptores), Alertas (cola e historial, reintento de fallidas), Canales, Comandos, Auditoría.

Acceso: la cuenta debe tener `players.discord_user_id` presente en `bot_admins`.

Importante: la web solo oculta el panel. Para que las escrituras (interruptores, reintentos) funcionen y sean seguras, la Neon Data API necesita permisos de UPDATE sobre `bot_alerts` y `bot_settings` solo para admins (RLS). Sin eso, guardar dará error o quedará abierto a cualquier sesión.

Sin enlace en la barra lateral: se entra escribiendo `#/admin`.
