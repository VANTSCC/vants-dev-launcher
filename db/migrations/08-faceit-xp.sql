-- ============================================================
-- VANTS — Migración 08 · Motor de EXPERIENCIA FACEIT (XP → nivel)
-- ------------------------------------------------------------
-- El bot (bot/faceit_xp.py) y el workflow faceit-xp.yml registran las
-- partidas de FACEIT vía faceit_registrar_partida(); la web muestra la
-- XP/nivel en la barra de rango del perfil (arena.js / arena-live.js).
-- Idempotente: UNIQUE(faceit_match_id) evita doble XP.
-- Escala: +100 XP por victoria, +25 por empate, 0 por derrota.
--         Nivel = 1 + floor(xp / 500)  (500 XP por nivel).
-- Reversible: ALTER TABLE players DROP COLUMN xp;
--             DROP TABLE faceit_matches; DROP FUNCTION faceit_registrar_partida(...);
-- ============================================================

-- 1) XP acumulada del jugador (se muestra en la web junto al rango)
ALTER TABLE players ADD COLUMN IF NOT EXISTS xp integer NOT NULL DEFAULT 0;
COMMENT ON COLUMN players.xp IS
  'Experiencia FACEIT acumulada: +100 por victoria, +25 por empate. Nivel = 1 + floor(xp/500).';

-- 2) Partidas FACEIT ya procesadas (una fila por partida; el guid queda de referencia)
CREATE TABLE IF NOT EXISTS faceit_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  faceit_match_id text NOT NULL UNIQUE,
  faceit_guid text,
  game text NOT NULL DEFAULT 'cs2',
  result text NOT NULL CHECK (result IN ('win', 'loss', 'draw')),
  xp_awarded integer NOT NULL DEFAULT 0,
  elo_delta integer,
  played_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'faceit'
);
CREATE INDEX IF NOT EXISTS faceit_matches_player_idx ON faceit_matches(player_id, played_at DESC);

ALTER TABLE faceit_matches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS faceit_matches_lectura ON faceit_matches;
CREATE POLICY faceit_matches_lectura ON faceit_matches FOR SELECT USING (true);
-- Lectura pública (historial); la escritura es del motor (conexión dueña).
GRANT SELECT ON faceit_matches TO PUBLIC;

-- 3) Registro idempotente de una partida FACEIT.
--    Lo llaman el workflow (psql) y el bot con la conexión dueña: sin grant
--    EXECUTE público a propósito (nadie desde la web puede forjar XP).
CREATE OR REPLACE FUNCTION faceit_registrar_partida(
  p_player_id uuid,
  p_faceit_match_id text,
  p_result text,
  p_played_at timestamptz DEFAULT NULL,
  p_elo_delta integer DEFAULT NULL,
  p_game text DEFAULT 'cs2'
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_xp integer;
  v_nueva boolean := false;
  v_total integer;
  v_nivel integer;
  v_username text;
BEGIN
  IF p_result NOT IN ('win', 'loss', 'draw') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'resultado_invalido');
  END IF;
  IF p_faceit_match_id IS NULL OR btrim(p_faceit_match_id) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'match_id_vacio');
  END IF;

  v_xp := CASE p_result WHEN 'win' THEN 100 WHEN 'draw' THEN 25 ELSE 0 END;

  INSERT INTO faceit_matches
    (player_id, faceit_match_id, faceit_guid, game, result, xp_awarded, elo_delta, played_at)
  VALUES
    (p_player_id, btrim(p_faceit_match_id), NULL, lower(coalesce(p_game, 'cs2')),
     p_result, v_xp, p_elo_delta, coalesce(p_played_at, now()))
  ON CONFLICT (faceit_match_id) DO NOTHING;
  IF FOUND THEN v_nueva := true; END IF;

  IF v_nueva AND v_xp > 0 THEN
    UPDATE players SET xp = xp + v_xp, updated_at = now() WHERE id = p_player_id;

    -- Cola de Discord (discord-notify la publica a 'ranked' cuando se dispare;
    -- el payload lleva todo lo que el embed necesita).
    SELECT username INTO v_username FROM players WHERE id = p_player_id;
    -- Aviso a Discord (best-effort: la tabla real tiene id bigint sin
    -- relación con el match id de FACEIT). Adaptativo: si id tiene default
    -- va sin id; si no, se usa un hash numérico estable del match id.
    BEGIN
      BEGIN
        INSERT INTO vant_sync_events (event_type, payload)
        SELECT 'faceit_victoria', jsonb_build_object(
          'player', coalesce(v_username, p_player_id::text),
          'xp', v_xp,
          'xp_total', (SELECT xp FROM players WHERE id = p_player_id),
          'faceit_match_id', btrim(p_faceit_match_id),
          'result', p_result)
        WHERE NOT EXISTS (
          SELECT 1 FROM vant_sync_events
          WHERE event_type = 'faceit_victoria'
            AND payload->>'faceit_match_id' = btrim(p_faceit_match_id));
      EXCEPTION WHEN not_null_violation THEN
        INSERT INTO vant_sync_events (id, event_type, payload)
        SELECT (('x' || substr(md5('faceit_' || btrim(p_faceit_match_id)), 1, 16))::bit(64)::bigint), 'faceit_victoria', jsonb_build_object(
          'player', coalesce(v_username, p_player_id::text),
          'xp', v_xp,
          'xp_total', (SELECT xp FROM players WHERE id = p_player_id),
          'faceit_match_id', btrim(p_faceit_match_id),
          'result', p_result)
        WHERE NOT EXISTS (
          SELECT 1 FROM vant_sync_events
          WHERE event_type = 'faceit_victoria'
            AND payload->>'faceit_match_id' = btrim(p_faceit_match_id));
      END;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'aviso Discord omitido: %', SQLERRM;
    END;
  END IF;

  SELECT xp INTO v_total FROM players WHERE id = p_player_id;
  v_nivel := 1 + floor(coalesce(v_total, 0)::numeric / 500);
  RETURN jsonb_build_object(
    'ok', true,
    'nueva', v_nueva,
    'xp_ganada', CASE WHEN v_nueva THEN v_xp ELSE 0 END,
    'xp_total', v_total,
    'nivel', v_nivel::int);
END $$;

-- 4) La barra SIN RANGO de la web pasa a EXPERIENCIA cuando xp > 0:
--    arena-live.js (rangoRealHTML) y arena.js (rangoPublicoHTML, leaderboard).
