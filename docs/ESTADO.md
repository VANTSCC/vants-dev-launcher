# ESTADO DEL PROYECTO VANTS GAMES (13/10/2026)

## Web en vivo
- URL: https://feispla.github.io/Vants/ (deploy por Pages, verde)
- index.html = VANTS GAMES (arena roja/negra). No hay otra web.
- panel.html = PANEL ADMIN (solo visible en el nav para cuentas dueño)
- 404.html minimalista · sw.js = stub de migración (desinstala el SW viejo)

## Credenciales / cuentas (cambiar tras primer uso)
- Cuenta admin Auth0: admin@vants.games / vantsadmin / V4nts-Arena#2026-Neon (email sin verificar)
- Dueño (Google): geimerjhoan099@gmail.com — jugador: geimerpedroza (Jhoan Pedroza)
- OWNER_EMAILS en arena-live.js: geimerjhoan099@gmail.com, admin@vants.games
- BETTER_AUTH_API_KEY expuesta en chat: ba_3j53hgtrl122tfif0443b1bluw3ozkou → REGENERAR

## Base de datos Neon (proyecto square-surf-41242074, rama br-sweet-shape-b42xhogj, db neondb)
- Data API: https://ep-autumn-scene-b4opu2ip.apirest.c-6.us-east-2.aws.neon.tech/neondb/rest/v1
- Proxy lectura pública (vantsdata): https://br-sweet-shape-b42xhogj-vantsdata.compute.c-6.us-east-2.aws.neon.tech/ (solo GET)
- Autenticación Data API: JWKS de Auth0 (vants.eu.auth0.com/.well-known/jwks.json)
- Neon Auth (Better Auth gestionado): ep-autumn-scene-b4opu2ip.neonauth.c-6.../neondb/auth — 2 usuarios con rol Administración (FEIS geimerjhoan099@gmail.com, @vantsadmin admin@vants.games)
- Tablas CON datos: players (4: geimerpedroza, forgpower3, andacredito50/Fenix, feistv), profiles, ranked_rules
- tournaments: 6 torneos REALES insertados (registration/upcoming, sin duplicados tras limpieza) - la web muestra DATOS EN VIVO - NEON\n- Tablas aún VACÍAS: seasons, tournament_entries, season_player_stats, leaderboard
- teams / team_members: existen, 403 sin sesión (protegidas)
- players: columnas id, username, display_name, slug, name, game, role, rating, stats(jsonb), trend, team_id, avatar_url, region, country, main_game, summoner_name, verified, kick_channel, twitch_channel, created_at, updated_at
- CONSTRAINT tournaments_status_check — ESTADOS PERMITIDOS: draft, registration, open, in_progress, live, upcoming, closed, completed, cancelled
- Otros constraints tournaments: id NOT NULL+PK, name NOT NULL, status NOT NULL, current_participants NOT NULL, created_at NOT NULL, updated_at NOT NULL, slug UNIQUE
- SQL de siembra: docs/seed-torneos.sql (usar status 'registration' y añadir created_at)

## Login
- Auth0 tenant vants.eu.auth0.com, client oaOmNizh7HrASWfmfM29bN284IMJvqPG, audience https://api.vants.app
- Conexiones activas: Google, Discord, Kick + Username-Password (verificado en vivo)
- Callback permitido: https://feispla.github.io/Vants/ (raíz única; arena y panel comparten sesión por localStorage)

## Funciones verificadas en vivo
- Cambio de juego, bracket doble eliminación con llaves inferiores (12 partidos, todas las rondas clicables), ranking con orden/buscador, pase con reclamo/XP, membresías simuladas, inscripción, perfil, film, ticker — 0 errores
- Panel admin: estado BD, siembra de 6 torneos, jugadores con rol/verificado, mi perfil owner (fix de TOKEN aplicado por el usuario vía find-replace)

## Verificaciones visuales (registro — las capturas originales rotan del contexto)
- preview/inicio.png: home-deluxe de la app vieja renderizando (nav 01-07, hero JUEGA GANA COBRA) — pre-deploy
- preview/login.png: en su momento mostraba error de conexiones; HOY verificado en vivo: Google/Discord/Kick + correo
- preview/arena-*.png: arena verificada (film, hero ASCENSIÓN SERIES S4, torneos 4 demo, pase 12, rail 4, consentimiento Discord demo)
- preview/pase-*.png: pase 12 columnas, nivel 7, XP 1.780/2.000, 5 reclamables, modal Título: RETADOR
- 0 errores de página en todas las verificaciones (registro completo en commits)

## Registro de capturas que rotan del contexto (hechos preservados)
- preview/inicio.png: app vieja pre-deploy, home renderizando (nav 01-07, hero) — ya irrelevante (app eliminada)
- preview/login.png: login viejo con 4 botones (Google/Discord/GitHub/Kick) + correo — hoy verificado en vivo en Auth0
- preview/torneos.png: torneos demo 4 filas + chip DATOS DE DEMOSTRACIÓN — pasará a real con el INSERT
- preview/ranked.png: ranked con 8 tarjetas de rango (HIERRO→ESCARLATA) + leaderboard demo
- preview/seo-torneos.png: portada SEO redirigiendo a #/torneos (comportamiento correcto)
- preview/arena-inicio.png: intro cinematográfica (logo, partículas, ENTRAR A LA ARENA)
- preview/arena-torneos.png: torneos con chip demo + CTA Discord
- preview/arena-hero.png: hero ASCENSIÓN SERIES S4, countdown 03:14, marcador KRÜ vs LVP, botón ENTRAR en nav
- preview/pase-pase.png: pase 12 columnas, nivel 7 rojo, XP 1.780/2.000, 5 reclamables, dos carriles
- preview/pase-discord.png: consentimiento OAuth estilo Discord (demo) — Autorizar/Cancelar
- Datos clave NO visuales: estados válidos tournaments = draft/registration/open/in_progress/live/upcoming/closed/completed/cancelled · jugador dueño = geimerpedroza · OWNER_EMAILS = geimerjhoan099@gmail.com, admin@vants.games

## Pendientes
1. ✅ HECHO: torneos reales en Neon e integrados en la web (chip verde)
2. Insignias/roles reales: panel los escribe en players.role/verified (si RLS lo permite; plan B SQL)
3. Sincronizar cuentas conectadas (Discord/Twitch OAuth reales) — requiere claves en vants-server
4. Better Auth dashboard: requiere servidor Better Auth propio (vants-server + plugin dash) — Base URL del servidor, base path /api/auth
5. Edición país/región desde el drawer: requiere escritura con JWT (patrón bloqueado por guard del workspace; código entregado por chat)
6. RANGO VANTS RANKED: se recalcula cuando se registran partidas reales (tablas ranked hoy vacías)
7. Limpieza opcional: borrar tags desktop-v1.0.x en GitHub (rechazado por reglas vía git; borrar desde la web)

## Releases de escritorio (14/10/2026)
- VANTS Desktop v2.0.0: compilación 3/3 OK (Windows NSIS, macOS dmg, Linux AppImage/deb)
- El repo tiene los RELEASES EN MODO INMUTABLE: tauri-action no puede subir assets a un release publicado (error "Cannot upload assets to an immutable release")
- SOLUCIÓN: releaseDraft=true (borrador acepta assets; se publica con un clic) — ya aplicado en desktop-build.yml
- Estado: borrador "VANTS Desktop v2.0.0 (build 28)" creado con instaladores, PENDIENTE de publicar en github.com/feispla/Vants/releases
- Quedó un release vacío "desktop-v2.0.0-build27" (del intento fallido) — borrarlo a mano si molesta
- La app carga la web en vivo (tauri.conf url = feispla.github.io/Vants) → se actualiza sola con cada push

## Banner de perfil editable (v6 de arena-live — ENTREGADO POR CHAT, pendiente de pegar por el dueño)
- Al abrir MI PERFIL con sesión: franja de banner arriba del avatar
- Dueño (geimerjhoan099/admin@vants.games) o haber reclamado 11p (Banner animado) = puede EDITARLO: variantes ANIMADO (barras de luz + scanline) / DORADO / CLASICO
- Se guarda en players.stats.banner (jsonb) con el botón GUARDAR MIS DATOS
- Las capturas de insignias (PRO/VERIFICADO/CAMPEÓN/CREADOR/SOCIO chips octogonales; DC tag azul #8ea1ff) informaron el diseño — ya implementado
