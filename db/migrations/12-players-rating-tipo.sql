-- ============================================================
-- 12-players-rating-tipo.sql
-- Normaliza tipos de las tablas creadas a mano en Neon para que el
-- motor de ranking/XP funcione con números reales:
--   · players.rating            integer → double precision
--     (la escala de la web es 0.5–2.0 con decimales: 0.95 ACERO … 1.30 VANTS)
--   · season_player_stats.rank  text    → double precision
--     (espejo del rating que lee la web; la tabla estaba vacía, sin riesgo)
--   · faceit_stats_delta(): season_id era uuid y estaba declarado int
-- Idempotente: los ALTER ya aplicados no hacen nada y la función es
-- CREATE OR REPLACE.
-- ============================================================

ALTER TABLE players ALTER COLUMN rating TYPE double precision USING rating::double precision;
ALTER TABLE season_player_stats ALTER COLUMN rank TYPE double precision USING NULLIF(btrim(rank), '')::double precision;

CREATE OR REPLACE FUNCTION faceit_stats_delta(p_player_id uuid, p_result text, p_nuevo_rating double precision)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_season uuid;
  v_row boolean;
BEGIN
  BEGIN
    SELECT id INTO v_season FROM seasons WHERE status = 'active' ORDER BY id DESC LIMIT 1;
  EXCEPTION WHEN undefined_table THEN v_season := NULL; END;

  SELECT true INTO v_row FROM season_player_stats WHERE player_id = p_player_id;
  IF v_row IS NOT TRUE THEN
    INSERT INTO season_player_stats (player_id, season_id, wins, losses)
    VALUES (p_player_id, v_season, 0, 0);
  END IF;

  IF p_result = 'win' THEN
    UPDATE season_player_stats SET wins = coalesce(wins, 0) + 1 WHERE player_id = p_player_id;
  ELSIF p_result = 'loss' THEN
    UPDATE season_player_stats SET losses = coalesce(losses, 0) + 1 WHERE player_id = p_player_id;
  END IF;

  -- rank y mmr espejo del rating: la web los lee de acá
  UPDATE season_player_stats
  SET rank = p_nuevo_rating, mmr = round(p_nuevo_rating * 100)
  WHERE player_id = p_player_id;
END;
$$;

-- inventario final (log del workflow)
SELECT relname AS tabla, n_live_tup AS filas_aprox
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY relname;
