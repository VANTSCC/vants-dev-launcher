-- ============================================================
-- 06-limpieza-jugadores-anonimos.sql
-- REGLA PERMANENTE DE LA SALA DE JUGADORES (/// IDENTIDADES):
-- solo existen perfiles nacidos de un inicio de sesión real.
--
-- El workflow de GitHub (neon-migrate.yml) re-aplica este archivo
-- en cada push que toque db/migrations/*.sql, así que funciona
-- como autolimpieza permanente: cualquier fila SIN identidad
-- (creada por pruebas, por el antiguo panel admin o por siembras
-- manuales) se elimina. Los perfiles creados al iniciar sesión
-- siempre traen auth0_sub gracias al trigger trg_players_bind_auth0
-- (05-current-player.sql), por lo que jamás se tocan.
--
-- Se CONSERVA siempre:
--   · filas con auth0_sub        → perfil creado al iniciar sesión
--   · filas del dueño por email  → geimerjhoan099@gmail.com y
--     admin@vants.games (el trigger trg_players_owner_promote las
--     mantiene como OWNER + verificadas)
--
-- Se ELIMINA:
--   · filas anónimas (auth0_sub y email vacíos) y sus datos
--     dependientes (stats de temporada, cuentas de juego,
--     inscripciones de torneo).
--   · En vants_links NO se borra nada: solo se desligan
--     (player_id = NULL) para no perder OAuth ya verificado
--     (p. ej. el Discord del dueño).
-- purchases/entitlements ya se cuidan solas por FK
-- (ON DELETE SET NULL / CASCADE, ver 05-pagos.sql).
-- ============================================================

-- ---------- 1) ids de los jugadores anónimos (los que se van) ----------
DROP TABLE IF EXISTS tmp_jugadores_anonimos;
CREATE TEMP TABLE tmp_jugadores_anonimos (id uuid PRIMARY KEY);

INSERT INTO tmp_jugadores_anonimos (id)
SELECT id
FROM players
WHERE auth0_sub IS NULL
  AND lower(coalesce(email, '')) NOT IN ('geimerjhoan099@gmail.com', 'admin@vants.games');

-- ---------- 2) dependientes en tablas creadas a mano en Neon ----------
-- Esas tablas no están en db/migrations (se crearon en el SQL Editor),
-- así que el borrado es defensivo: si algo no existe, se avisa y sigue.
DO $$
DECLARE
  t text;
  n bigint;
BEGIN
  FOREACH t IN ARRAY ARRAY['season_player_stats', 'user_game_accounts', 'tournament_entries'] LOOP
    BEGIN
      EXECUTE format(
        'DELETE FROM %I WHERE player_id IN (SELECT id FROM tmp_jugadores_anonimos)',
        t
      );
      GET DIAGNOSTICS n = ROW_COUNT;
      RAISE NOTICE '%: % fila(s) de jugadores anónimos eliminadas', t, n;
    EXCEPTION
      WHEN undefined_table OR undefined_column THEN
        RAISE NOTICE '%: tabla o columna inexistente, se omite', t;
      WHEN OTHERS THEN
        RAISE NOTICE '%: omitida (%)', t, SQLERRM;
    END;
  END LOOP;
END $$;

-- ---------- 3) vants_links: solo desligar, no borrar ----------
DO $$
DECLARE n bigint;
BEGIN
  UPDATE vants_links
  SET player_id = NULL
  WHERE player_id IN (SELECT id FROM tmp_jugadores_anonimos);
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'vants_links: % vínculo(s) desligado(s) de filas anónimas', n;
EXCEPTION
  WHEN undefined_table THEN RAISE NOTICE 'vants_links: no existe, se omite';
END $$;

-- ---------- 4) borrar los jugadores anónimos ----------
DO $$
DECLARE n bigint;
BEGIN
  DELETE FROM players WHERE id IN (SELECT id FROM tmp_jugadores_anonimos);
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'players: % jugador(es) anónimo(s) eliminado(s)', n;
END $$;

DROP TABLE IF EXISTS tmp_jugadores_anonimos;

-- ---------- 5) el dueño siempre OWNER + verificado (idempotente) ----------
UPDATE players
SET role = 'owner', verified = true
WHERE lower(coalesce(email, '')) IN ('geimerjhoan099@gmail.com', 'admin@vants.games')
  AND (role IS DISTINCT FROM 'owner' OR verified IS DISTINCT FROM true);

-- ---------- 6) inventario final (queda en el log del workflow) ----------
SELECT username,
       display_name,
       role,
       verified,
       (auth0_sub IS NOT NULL) AS nacio_de_sesion,
       email
FROM players
ORDER BY created_at;

SELECT relname AS tabla, n_live_tup AS filas_aprox
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY relname;
