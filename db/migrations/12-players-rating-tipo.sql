-- ============================================================
-- 12-players-rating-tipo.sql
-- Normaliza tipos de las tablas creadas a mano en Neon para el motor
-- de ranking/XP:
--   · players.rating: integer → double precision (escala 0.5–2.0 con
--     decimales: 0.95 ACERO … 1.30 VANTS). Sin vistas dependientes ✓
--   · season_player_stats.rank: NO se altera — la vista leaderboard del
--     bot depende de ella; faceit_stats_delta escribe el espejo como texto.
--   · red de seguridad en season_player_stats (tabla creada a mano):
--     id con default, columnas derivadas sin NOT NULL.
--   · faceit_stats_delta(): season_id es uuid (estaba declarado int).
-- Idempotente.
-- ============================================================

-- La vista leaderboard (del bot viejo, creada a mano en Neon) depende de
-- players.rating: Postgres no permite alterar el tipo con vistas colgando.
-- Se guarda su definición (pg_get_viewdef), se suelta, se altera y se recrea.
DO $$
DECLARE
  v_tipo  text;
  v_def   text;
BEGIN
  SELECT data_type INTO v_tipo
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'players' AND column_name = 'rating';

  IF v_tipo IS NOT NULL AND v_tipo <> 'double precision' THEN
    BEGIN
      SELECT pg_get_viewdef('public.leaderboard'::regclass, true) INTO v_def;
    EXCEPTION WHEN undefined_table THEN v_def := NULL; END;

    IF v_def IS NOT NULL THEN EXECUTE 'DROP VIEW public.leaderboard'; END IF;
    EXECUTE 'ALTER TABLE public.players ALTER COLUMN rating TYPE double precision USING rating::double precision';
    IF v_def IS NOT NULL THEN EXECUTE 'CREATE VIEW public.leaderboard AS ' || v_def; END IF;
  END IF;
END $$;

ALTER TABLE season_player_stats ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE season_player_stats ALTER COLUMN rank DROP NOT NULL;
ALTER TABLE season_player_stats ALTER COLUMN mmr DROP NOT NULL;
ALTER TABLE season_player_stats ALTER COLUMN season_id DROP NOT NULL;
ALTER TABLE season_player_stats ALTER COLUMN placement_done DROP NOT NULL;

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

  -- rank y mmr espejo del rating: la web los lee de acá.
  -- rank es text (depende de la vista leaderboard): se guarda como texto.
  UPDATE season_player_stats
  SET rank = p_nuevo_rating::text, mmr = round(p_nuevo_rating * 100)
  WHERE player_id = p_player_id;
END;
$$;

-- inventario final (log del workflow)
SELECT relname AS tabla, n_live_tup AS filas_aprox
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY relname;
