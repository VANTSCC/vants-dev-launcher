-- ============================================================
-- 14-unificacion-dueno.sql
-- UN SOLO PERFIL para el dueño del sitio.
--
-- Contexto: el dueño inició sesión con 3 cuentas Google propias
-- (verificado en Auth0: feisplaa@gmail.com, geimerpedroza@gmail.com
-- y geimerjhoan099@gmail.com — esta última es la real actual).
-- Cada sesión podía dejar su propia fila en players → perfiles
-- duplicados ("PERFIL DE JUGADOR" vs "CUENTA REAL VANTS").
--
-- Esta migración (idempotente; la re-aplica neon-migrate.yml):
--   1. Reúne las filas del dueño (sus 3 subs, sus 3 emails y el
--      username viejo geimerpedroza).
--   2. Elige LA REAL: prioridad sub de sesión real → email real →
--      sub viejo → fila más antigua.
--   3. Liga la fila real a la identidad real (sub + email; el
--      trigger 05 la mantiene OWNER + verificada).
--   4. Limpia las demás (fantasmas): datos dependientes, desliga
--      vants_links y borra la fila (cascadas en series/faceit/pase).
--      Si una FK resistiera, la fila se ARCHIVA (zz_fantasma_*,
--      degradada, sin sub/email) en vez de frenar la migración.
-- No toca a otros jugadores ni la fila admin@vants.games.
-- ============================================================

-- ---------- 1) filas candidatas del dueño ----------
DROP TABLE IF EXISTS tmp_dueno_filas;
CREATE TEMP TABLE tmp_dueno_filas AS
SELECT id, username, display_name, email, auth0_sub, role, rating, created_at,
       (auth0_sub = 'google-oauth2|103921098105477052247') AS es_sub_real,
       (lower(coalesce(email, '')) = 'geimerjhoan099@gmail.com') AS es_email_real,
       (auth0_sub = 'google-oauth2|112523840294808050599') AS es_sub_viejo
FROM players
WHERE auth0_sub IN ('google-oauth2|103921098105477052247',
                    'google-oauth2|112523840294808050599',
                    'google-oauth2|111081745693230884193')
   OR lower(coalesce(email, '')) IN ('geimerjhoan099@gmail.com',
                                     'geimerpedroza@gmail.com',
                                     'feisplaa@gmail.com')
   OR lower(coalesce(username, '')) = 'geimerpedroza';

-- ---------- 2) la fila real y las fantasmas ----------
DROP TABLE IF EXISTS tmp_dueno_real;
CREATE TEMP TABLE tmp_dueno_real AS
SELECT id FROM tmp_dueno_filas
ORDER BY es_sub_real DESC, es_email_real DESC, es_sub_viejo DESC, created_at ASC
LIMIT 1;

DROP TABLE IF EXISTS tmp_dueno_fantasma;
CREATE TEMP TABLE tmp_dueno_fantasma AS
SELECT id FROM tmp_dueno_filas
WHERE id NOT IN (SELECT id FROM tmp_dueno_real);

-- ---------- 3) la fila real queda ligada a la cuenta real ----------
-- (si ya estaba ligada, no-op; el trigger trg_players_owner_promote
--  la deja OWNER + verified al tocar el email)
UPDATE players p
SET auth0_sub = 'google-oauth2|103921098105477052247',
    email = 'geimerjhoan099@gmail.com'
FROM tmp_dueno_real r
WHERE p.id = r.id
  AND (p.auth0_sub IS DISTINCT FROM 'google-oauth2|103921098105477052247'
       OR p.email IS DISTINCT FROM 'geimerjhoan099@gmail.com');

-- ---------- 4) datos dependientes de los fantasmas ----------
DO $$
DECLARE t text; n bigint;
BEGIN
  FOREACH t IN ARRAY ARRAY['season_player_stats', 'user_game_accounts',
                           'tournament_entries', 'pass_progreso'] LOOP
    BEGIN
      EXECUTE format(
        'DELETE FROM %I WHERE player_id IN (SELECT id FROM tmp_dueno_fantasma)', t);
      GET DIAGNOSTICS n = ROW_COUNT;
      RAISE NOTICE '%: % fila(s) fantasma eliminada(s)', t, n;
    EXCEPTION
      WHEN undefined_table OR undefined_column THEN RAISE NOTICE '%: inexistente, se omite', t;
      WHEN OTHERS THEN RAISE NOTICE '%: omitida (%)', t, SQLERRM;
    END;
  END LOOP;
END $$;

-- vants_links: solo desligar (igual que 06; no se pierde OAuth verificado)
DO $$
DECLARE n bigint;
BEGIN
  UPDATE vants_links SET player_id = NULL
  WHERE player_id IN (SELECT id FROM tmp_dueno_fantasma);
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'vants_links: % vínculo(s) de fantasmas desligado(s)', n;
EXCEPTION
  WHEN undefined_table THEN RAISE NOTICE 'vants_links: no existe, se omite';
END $$;

-- ---------- 5) borrar fantasmas; si una FK resiste, archivar ----------
DO $$
DECLARE r record; n bigint;
BEGIN
  FOR r IN SELECT f.id, coalesce(p.username, 'jugador') AS u
           FROM tmp_dueno_fantasma f LEFT JOIN players p ON p.id = f.id LOOP
    BEGIN
      DELETE FROM players WHERE id = r.id;
      GET DIAGNOSTICS n = ROW_COUNT;
      RAISE NOTICE 'fantasma %: eliminado (% fila)', r.u, n;
    EXCEPTION WHEN OTHERS THEN
      BEGIN
        UPDATE players SET
          username = 'zz_fantasma_' || left(r.id::text, 8),
          display_name = 'FANTASMA UNIFICADO',
          auth0_sub = NULL,
          email = NULL,
          role = 'jugador',
          verified = false
        WHERE id = r.id;
        RAISE NOTICE 'fantasma %: archivado (FK resistió: %)', r.u, SQLERRM;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'fantasma %: intacto (%)', r.u, SQLERRM;
      END;
    END;
  END LOOP;
END $$;

-- ---------- 6) el dueño siempre OWNER + verificado (idempotente) ----------
UPDATE players
SET role = 'owner', verified = true
WHERE lower(coalesce(email, '')) = 'geimerjhoan099@gmail.com'
  AND (role IS DISTINCT FROM 'owner' OR verified IS DISTINCT FROM true);

-- ---------- 7) inventario final (queda en el log del workflow) ----------
SELECT username, display_name, role, verified, rating,
       (auth0_sub IS NOT NULL) AS nacio_de_sesion, email
FROM players
ORDER BY created_at;
