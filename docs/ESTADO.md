# ESTADO DEL PROYECTO VANTS GAMES (14/10/2026 — actualizado)

## Web en vivo
- URL: https://feispla.github.io/Vants/ (deploy por Pages, verde)
- index.html = VANTS GAMES (arena roja/negra). No hay otra web.
- panel.html = PANEL ADMIN — ELIMINADO (15/10/2026): sin administración manual de roles/insignias; los planes comprados emiten sus insignias solos al volver de Stripe y el OWNER se reconoce por email/Discord ID en arena-live.js
- 404.html minimalista · sw.js = stub de migración

## Credenciales / cuentas (cambiar tras primer uso)
- Cuenta admin Auth0: admin@vants.games / vantsadmin / V4nts-Arena#2026-Neon (email sin verificar)
- Dueño (Google): geimerjhoan099@gmail.com — jugador: geimerpedroza (Jhoan Pedroza)
- OWNER_EMAILS en arena-live.js v6: geimerjhoan099@gmail.com, admin@vants.games
- BETTER_AUTH_API_KEY expuesta en chat: ba_3j53hgtrl122tfif0443b1bluw3ozkou → REGENERAR
- Neon Auth: 2 usuarios con rol Administración (FEIS geimerjhoan099, @vantsadmin admin@vants.games)

## Base de datos Neon (proyecto square-surf-41242074, rama br-sweet-shape-b42xhogj, db neondb)
- Data API: https://ep-autumn-scene-b4opu2ip.apirest.c-6.us-east-2.aws.neon.tech/neondb/rest/v1
- Proxy lectura pública (vantsdata): https://br-sweet-shape-b42xhogj-vantsdata.compute.c-6.us-east-2.aws.neon.tech/ (solo GET)
- Autenticación Data API: JWKS de Auth0 (vants.eu.auth0.com) — NO eliminar ese proveedor
- players (5 reales): geimerpedroza, forgpower3, andacredito50/Fenix, feistv (VERIFICADO), +1 — columnas: id, username, display_name, slug, role, verified, country, region, team_id, avatar_url, stats(jsonb), main_game, kick/twitch_channel…
- tournaments: 6 filas — PENDIENTE normalizar (un paste del translate las deformó: slugs con espacios/mayúsculas/acentos, status en español "próximamente"/"Registro") → fix = DELETE all + re-INSERT limpio (docs/seed-torneos.sql)
- tournaments_status_check estados válidos: draft, registration, open, in_progress, live, upcoming, closed, completed, cancelled
- Otros constraints: id PK, name NOT NULL, status NOT NULL, current_participants NOT NULL, created_at NOT NULL, updated_at NOT NULL, slug UNIQUE
- teams / team_members: existen, 403 sin sesión (conectar con SELECT column_name FROM information_schema.columns WHERE table_name='teams' para integrar creación de equipos)
- seasons, leaderboard, entries: vacías (el ranked real llega con partidas registradas)

## Login
- Auth0 tenant vants.eu.auth0.com, client oaOmNizh7HrASWfmfM29bN284IMJvqPG, audience https://api.vants.app
- Conexiones activas: Google, Discord, Kick + correo (verificado en vivo)
- Callback único permitido: https://feispla.github.io/Vants/ (arena y panel comparten sesión por localStorage)

## Funciones verificadas en vivo (matriz completa en commits)
- Cambio de juego · bracket doble elim. con llaves inferiores (12 partidos, todo clicable) · ranking orden/buscador · pase 12 con reclamo/XP · membresías simuladas · inscripción · perfil real (país/región/DC editables) · film · ticker · panel v2 (estado BD, siembra, roles, verificado, país/región) · 0 errores

## Pase real en Neon
- docs/migracion-pase.sql: pass_progreso + pass_recompensas + pass_estado() + pass_reclamar() (validación servidor; premium auto owner/admin; defaults nivel 7 · 1.780/2.000)
- arena-live v5/v6 (subido por el dueño, commit "Update arena-live.js"): pass_estado carga progreso; claimReward → pass_reclamar; perfil real con país/región/DC y banner

## Conectores de cuentas (14/10)
- Cuentas conectadas reales: tabla `vants_links` (sub Auth0 + plataforma + handle + verified) y
  Neon Function `linker` (OAuth real: Twitch, Kick, YouTube, TikTok, X, Riot, Steam OpenID, FACEIT).
- SQL pendiente de correr: `docs/migracion-links.sql` · función pendiente de crear en Neon
  (código en `neon-functions/linker/`) · pegar su URL en `LINKER_BASE` (auth0-config.js).
- Sin claves de una red, CONECTAR ofrece vínculo manual guardado en Neon (etiqueta MANUAL);
  Discord conserva su flujo demo propio. Receta por red: docs/CONFIGURACION.md sección 6.
- FIX preexistente corregido: arena-live.js tenía `await` a nivel superior dentro de una IIFE
  NO async → el navegador rechazaba el archivo entero (login, pase y perfil real no corrían).
  Ahora es `(async function () {`. node --check verde en arena.js / arena-live.js / auth0-config.js.

## Pendientes
1. Normalizar los 6 torneos (bloque DELETE+INSERT limpio entregado en chat) — slugs/estados en español romperán enlaces y sembrarían duplicados futuros
2. Insignias/roles: ya gestionables desde panel (si RLS rechaza → SQL plan B que el panel muestra)
3. Cuentas conectadas reales: OAuth por plataforma (Discord/Twitch/YouTube/Kick) con claves en vants-server
4. Pagos reales: Stripe account → claves en vants-server (webhook ya existe en neon-functions/stripe-webhook)
5. Better Auth dashboard: requiere servidor Better Auth propio (opcional; hoy no se usa)
6. Edición de país/región del dueño desde el drawer: requiere el mismo patrón de escritura (entregado por chat)
7. RANGO APEX: automático cuando se registren partidas (tablas ranked hoy vacías)
8. Limpieza: release vacío desktop-v2.0.0-build27 + 2 corridas en cola en Actions (borrar/cancelar a mano)

## Registro de capturas que rotan (hechos preservados)
- preview/inicio.png: app vieja pre-deploy (irrelevante, eliminada)
- preview/login.png: login viejo 4 botones — hoy verificado en vivo en Auth0
- preview/torneos.png: torneos demo 4 filas + chip DATOS DE DEMOSTRACIÓN — ya real (6 torneos)
- preview/ranked.png: 8 tarjetas de rango HIERRO→ESCARLATA + leaderboard demo
- preview/seo-torneos.png: portada SEO redirigiendo a #/torneos ✓
- preview/arena-inicio.png: intro cinematográfica (logo, partículas, ENTRAR A LA ARENA)
- preview/arena-torneos.png: torneos con chip + CTA Discord
- preview/arena-hero.png: hero ASCENSIÓN SERIES S4, countdown, marcador KRÜ vs LVP, ENTRAR en nav
- preview/pase-pase.png: pase 12 columnas, nivel 7 rojo, XP 1.780/2.000, 5 reclamables, dos carriles
- preview/pase-discord.png: consentimiento OAuth estilo Discord (demo)
- preview/standalone-file.png: vista autónoma por file:// funciona sin servidor
- preview/panel-v2.png / nav-sin-sesion.png: panel con datos reales (players 4→5, torneos 6) y chip oculto sin sesión
- preview/bracket-completo.png / bracket-previa-semi.png: llaves inferiores 3+3 rondas, 12 partidos, previa de semi en drawer
- Insignias: chips octogonales PRO(rojo)/VERIFICADO(cian)/CAMPEÓN(dorado)/CREADOR(morado)/SOCIO(gema dorada) · DC tag azul #8ea1ff
