-- ============================================================
-- 18-borrado-perfiles-viejos.sql — "quita los viejos, no bloque:
-- quita y borra" (orden del dueño, oct 2026)
--
-- OBJETIVO: que en la web y el launcher NO exista ningún perfil
-- duplicado. Solo sobrevive la identidad real del dueño:
--   sub   google-oauth2|103921098105477052247
--   email geimerjhoan099@gmail.com  (fila @feispla, visible FEIS)
--
-- Se borran (si existen) las filas de las dos cuentas Google
-- antiguas, en TODAS las tablas que las referencian:
--   1) feisplaa@gmail.com        → google-oauth2|111081745693230884193
--   2) geimerpedroza@gmail.com   → google-oauth2|112523840294808050599
--
-- Las cuentas siguen vivas SOLO dentro de Auth0 (ya bloqueadas);
-- el dueño las borrará desde el dashboard. Aquí se borra todo
-- rastro en la base de la aplicación.
--
-- Idempotente y seguro: nunca toca la fila del dueño real.
-- Deja diagnóstico legible en el log del workflow (NOTICE).
-- ============================================================

CREATE TEMP TABLE _subs_viejos (sub text PRIMARY KEY);
INSERT INTO _subs_viejos VALUES
  ('google-oauth2|111081745693230884193'),
  ('google-oauth2|112523840294808050599');

CREATE TEMP TABLE _emails_viejos (email text PRIMARY KEY);
INSERT INTO _emails_viejos VALUES
  ('feisplaa@gmail.com'),
  ('geimerpedroza@gmail.com');

-- ---------- 0) DIAGNÓSTICO ANTES (visible en logs de Actions) ----------
DO $$
DECLARE r record; n int;
BEGIN
  RAISE NOTICE '════ DIAGNÓSTICO players ANTES del borrado ════';
  FOR r IN SELECT id, username, display_name, role, verified, auth0_sub, email, created_at
           FROM players ORDER BY created_at ASC LOOP
    RAISE NOTICE 'player % | @% | "%." | rol % | verif % | sub % | email % | creado %',
      r.id, r.username, coalesce(r.display_name,''), r.role, r.verified,
      coalesce(r.auth0_sub,'—'), coalesce(r.email,'—'), r.created_at;
  END LOOP;
  SELECT count(*) INTO n FROM players;
  RAISE NOTICE 'total players ANTES: %', n;
END $$;

-- ---------- 1) Identificar filas a borrar (NUNCA el dueño real) ----------
-- (tabla TEMP del psql actual: sin ON COMMIT DROP, en autocommit
--  desaparecería al instante; muere sola al terminar la sesión)
CREATE TEMP TABLE _ids_borrar AS
SELECT p.id
FROM players p
WHERE (p.auth0_sub IN (SELECT sub FROM _subs_viejos))
   OR (lower(coalesce(p.email,'')) IN (SELECT email FROM _emails_viejos));

-- defensa extra: jamás la fila real
DELETE FROM _ids_borrar
WHERE id IN (SELECT id FROM players
             WHERE auth0_sub = 'google-oauth2|103921098105477052247'
                OR lower(coalesce(email,'')) = 'geimerjhoan099@gmail.com');

-- ---------- 2) Tablas con auth0_sub (vínculos y estados) ----------
DO $$
DECLARE t text; n int;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'vants_links','vants_link_states','user_discord_links',
    'player_discord_accounts','user_game_accounts','player_steam_games',
    'player_game_activity','steam_login_state','audit_logs',
    'web_admin_identities','vant_sync_events'
  ] LOOP
    IF to_regclass('public.' || t) IS NOT NULL
       AND EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = t AND column_name = 'auth0_sub') THEN
      EXECUTE format(
        'DELETE FROM %I WHERE auth0_sub IN (SELECT sub FROM _subs_viejos)', t);
      GET DIAGNOSTICS n = ROW_COUNT;
      RAISE NOTICE 'limpieza % por auth0_sub: % fila(s)', t, n;
    END IF;
  END LOOP;
END $$;

-- ---------- 3) Inscripciones de torneo huérfanas (17: SET NULL) ----------
DO $$
DECLARE n int;
BEGIN
  IF to_regclass('public.tournament_teams') IS NOT NULL THEN
    DELETE FROM tournament_teams WHERE player_id IN (SELECT id FROM _ids_borrar);
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE 'tournament_teams del dueño viejo borradas: %', n;
  END IF;
END $$;

-- ---------- 4) BORRAR las filas de players ----------
-- (las FKs hacen el resto: faceit_matches/pass_progreso/ranked/presence
--  en CASCADE; compras y teams quedan SET NULL)
DO $$
DECLARE n int;
BEGIN
  DELETE FROM players WHERE id IN (SELECT id FROM _ids_borrar);
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE '═══ players BORRADAS: % ═══', n;
END $$;

-- ---------- 5) Vínculos que quedaron sin dueño ----------
DO $$
DECLARE n int;
BEGIN
  IF to_regclass('public.vants_links') IS NOT NULL THEN
    DELETE FROM vants_links
    WHERE player_id IS NULL
      AND auth0_sub IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM players p WHERE p.auth0_sub = vants_links.auth0_sub);
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE 'vants_links huérfanos borrados: %', n;
  END IF;
END $$;

-- ---------- 6) VERIFICACIÓN FINAL ----------
DO $$
DECLARE r record; n int;
BEGIN
  RAISE NOTICE '════ VERIFICACIÓN players DESPUÉS ════';
  FOR r IN SELECT id, username, display_name, role, verified, auth0_sub, email
           FROM players ORDER BY created_at ASC LOOP
    RAISE NOTICE 'quedó % | @% | "%." | rol % | sub % | email %',
      r.id, r.username, coalesce(r.display_name,''), r.role,
      coalesce(r.auth0_sub,'—'), coalesce(r.email,'—');
  END LOOP;
  SELECT count(*) INTO n FROM players;
  RAISE NOTICE 'total players DESPUÉS: % (esperado: 1)', n;
  IF n <> 1 THEN
    RAISE NOTICE '⚠ Quedó más de un perfil — revisar el listado de arriba';
  END IF;
END $$;
