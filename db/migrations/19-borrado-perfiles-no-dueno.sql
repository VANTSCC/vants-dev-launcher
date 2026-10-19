-- ============================================================
-- 19-borrado-perfiles-no-dueno.sql — segunda pasada del borrado
-- (orden del dueño: "quita los viejos, quita y borra")
--
-- La 18 no encontró coincidencias: las identidades viejas
-- (feisplaa@ / geimerpedroza@) YA no tienen fila en players
-- (las unificó la migración 14). Los perfiles que sobraban son:
--   · fosst_2   · fosst1009@gmail.com  · sub google-oauth2|110255…
--   · joto_pez  · pezjoto3@gmail.com   · sub google-oauth2|108559…
--   (creados 2026-10-16 · 0 XP · sin verificar · sin compras)
--
-- Esta migración los borra a ELLOS y a sus restos, y deja en el
-- log (stdout) la lista final de jugadores para auditar.
-- JAMÁS toca la fila del dueño (feispla / geimerjhoan099).
-- Idempotente.
-- ============================================================

-- ---------- 0) DIAGNÓSTICO ANTES (stdout, visible en Actions) ----------
\echo '════ PLAYERS ANTES ════'
SELECT id, username, display_name, role, verified, xp,
       coalesce(auth0_sub,'—') AS sub, coalesce(email,'—') AS email
FROM players ORDER BY created_at ASC;

-- ---------- 1) Borrar perfiles que NO son del dueño ----------
DO $$
DECLARE n int;
BEGIN
  DELETE FROM players
  WHERE lower(coalesce(email,'')) IN ('fosst1009@gmail.com','pezjoto3@gmail.com')
     OR coalesce(auth0_sub,'') LIKE 'google-oauth2|110255%'
     OR coalesce(auth0_sub,'') LIKE 'google-oauth2|108559%';
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'players borradas (no-dueño): %', n;
END $$;

-- ---------- 2) Restos en tablas con auth0_sub (prefijos de sub) ----------
DO $$
DECLARE t text; n int;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'vants_links','vants_link_states','user_discord_links',
    'player_discord_accounts','user_game_accounts','player_steam_games',
    'player_game_activity','steam_login_state','audit_logs',
    'web_admin_identities','vant_sync_events','presence'
  ] LOOP
    IF to_regclass('public.' || t) IS NOT NULL
       AND EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = t AND column_name = 'auth0_sub') THEN
      EXECUTE format(
        'DELETE FROM %I WHERE auth0_sub LIKE %L OR auth0_sub LIKE %L',
        t, 'google-oauth2|110255%', 'google-oauth2|108559%');
      GET DIAGNOSTICS n = ROW_COUNT;
      IF n > 0 THEN RAISE NOTICE 'limpieza % : % fila(s)', t, n; END IF;
    END IF;
  END LOOP;
END $$;

-- ---------- 3) Vínculos que quedaron sin jugador ----------
DO $$
DECLARE n int;
BEGIN
  DELETE FROM vants_links
  WHERE player_id IS NULL
    AND auth0_sub IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM players p WHERE p.auth0_sub = vants_links.auth0_sub);
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'vants_links huérfanos borrados: %', n;
END $$;

-- ---------- 4) VERIFICACIÓN FINAL (stdout) ----------
\echo '════ PLAYERS DESPUÉS (esperado: SOLO feispla/FEIS owner) ════'
SELECT id, username, display_name, role, verified, xp,
       coalesce(auth0_sub,'—') AS sub, coalesce(email,'—') AS email
FROM players ORDER BY created_at ASC;

\echo '════ RESUMEN DE TABLAS CLAVE ════'
SELECT 'players' AS tabla, count(*) FROM players
UNION ALL SELECT 'vants_links', count(*) FROM vants_links
UNION ALL SELECT 'pass_progreso', count(*) FROM pass_progreso
UNION ALL SELECT 'faceit_matches', count(*) FROM faceit_matches;
