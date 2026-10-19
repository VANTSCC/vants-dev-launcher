-- ============================================================
-- 27-rr-historial.sql
-- Fase 4 · Historial de cambios de RR en Neon (requisito del dueño):
--   MOTIVO · PARTIDA · TEMPORADA · FECHA — para TODO camino que mueve rating.
-- ------------------------------------------------------------
-- Una sola tabla alimenta el historial completo del jugador:
--   · faceit_aplicar_resultado()  → motivo 'faceit_partida' (migración 10)
--   · mm_aplicar_resultado()      → motivo 'match_interno'  (migración 22)
--   (futuro: ajustes manuales del dueño → motivo 'ajuste_manual')
-- RR = rating*100 (misma escala que rank/mmr espejo y que la web lee).
-- Idempotente a nivel tabla: UNIQUE (player_id, fuente, partida_id) — aunque
-- una función se llame dos veces, no duplica líneas de historial.
-- Idempotente a nivel migración: CREATE TABLE IF NOT EXISTS +
-- CREATE OR REPLACE FUNCTION (misma firma que 10 y 22).
-- ============================================================

-- ---------- 1) tabla del historial ----------
CREATE TABLE IF NOT EXISTS rr_historial (
  id         bigserial PRIMARY KEY,
  player_id  uuid NOT NULL,
  motivo     text NOT NULL,        -- 'faceit_partida' | 'match_interno' | 'ajuste_manual'
  fuente     text NOT NULL,        -- 'faceit' | 'interno' | 'manual'
  partida_id text NOT NULL DEFAULT '', -- faceit match id · uuid de mm_matches · '' en ajustes
  temporada  uuid,                 -- seasons.id activo al momento del cambio (NULL si no hay)
  game       text,
  mode       text,
  region     text,
  rr_before  integer NOT NULL,
  rr_after   integer NOT NULL,
  rr_delta   integer GENERATED ALWAYS AS (rr_after - rr_before) STORED,
  creado_en  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rr_historial_player_idx
  ON rr_historial (player_id, creado_en DESC);

CREATE UNIQUE INDEX IF NOT EXISTS rr_historial_unica_idx
  ON rr_historial (player_id, fuente, partida_id);

-- ---------- 2) temporada activa (defensivo: seasons puede no existir) ----------
CREATE OR REPLACE FUNCTION rr_temporada_actual()
RETURNS uuid
LANGUAGE plpgsql STABLE
SET search_path = public
AS $$
DECLARE v uuid;
BEGIN
  BEGIN
    SELECT id INTO v FROM seasons WHERE status = 'active' ORDER BY id DESC LIMIT 1;
  EXCEPTION WHEN undefined_table THEN v := NULL; END;
  RETURN v;
END;
$$;

-- ---------- 3) FACEIT: registrar el cambio de RR ----------
-- Misma firma y lógica que la migración 10; se añade el INSERT en rr_historial.
CREATE OR REPLACE FUNCTION faceit_aplicar_resultado(
  p_player_id uuid,
  p_faceit_match_id text,
  p_game text,
  p_result text,
  p_played_at timestamptz DEFAULT NULL,
  p_elo_delta integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  reg jsonb;
  r_antes double precision;
  r_desp double precision;
  v_xp int;
BEGIN
  IF p_result NOT IN ('win', 'loss', 'draw') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'resultado_invalido');
  END IF;

  SELECT coalesce(rating, 0.95) INTO r_antes FROM players WHERE id = p_player_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'jugador_inexistente');
  END IF;

  -- XP + historial + aviso Discord (idempotente por faceit_match_id)
  reg := faceit_registrar_partida(p_player_id, p_faceit_match_id, p_result, p_played_at, p_elo_delta, p_game);
  IF reg->>'ok' <> 'true' THEN RETURN reg; END IF;
  IF coalesce((reg->>'nueva')::boolean, false) <> true THEN
    RETURN jsonb_build_object('ok', true, 'nueva', false, 'match_id', p_faceit_match_id);
  END IF;

  -- movimiento de rango
  r_desp := greatest(0.50, least(1.60, r_antes + CASE p_result
    WHEN 'win' THEN 0.015
    WHEN 'draw' THEN 0.002
    ELSE -0.012 END));
  UPDATE players SET rating = r_desp, updated_at = now() WHERE id = p_player_id;

  PERFORM faceit_stats_delta(p_player_id, p_result, r_desp);

  -- ★ historial RR (motivo · partida · temporada · fecha)
  INSERT INTO rr_historial
    (player_id, motivo, fuente, partida_id, temporada, game, rr_before, rr_after)
  VALUES
    (p_player_id, 'faceit_partida', 'faceit', coalesce(p_faceit_match_id, ''),
     rr_temporada_actual(), p_game, round(r_antes * 100)::int, round(r_desp * 100)::int)
  ON CONFLICT (player_id, fuente, partida_id) DO NOTHING;

  SELECT xp INTO v_xp FROM players WHERE id = p_player_id;
  RETURN jsonb_build_object(
    'ok', true, 'nueva', true,
    'xp_ganada', reg->>'xp_ganada', 'xp_total', v_xp,
    'rating_antes', round(r_antes::numeric, 3), 'rating_despues', round(r_desp::numeric, 3),
    'mmr', round(r_desp * 100));
END;
$$;

-- ---------- 4) match interno: registrar el cambio de RR ----------
-- Misma función que la migración 22; se añade el INSERT en rr_historial.
CREATE OR REPLACE FUNCTION mm_aplicar_resultado(p_match_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m            record;
  v_res        text;
  r_antes      double precision;
  r_desp       double precision;
  v_aplicados  int := 0;
  v_omitidos   int := 0;
  reg          record;
BEGIN
  SELECT * INTO m FROM mm_matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_encontrado');
  END IF;

  IF m.status = 'verificado' THEN
    RETURN jsonb_build_object('ok', true, 'ya', true);
  END IF;
  IF m.status <> 'reportado' OR m.score_a IS NULL OR m.score_b IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'estado_invalido');
  END IF;

  FOR reg IN
    SELECT mp.sub, mp.team, p.id AS player_id, p.rating
    FROM mm_match_players mp
    LEFT JOIN players p ON p.auth0_sub = mp.sub
    WHERE mp.match_id = p_match_id
    ORDER BY mp.team, mp.sub
  LOOP
    -- sin perfil VANTS vinculado: no se puede aplicar RR a nadie inventado
    IF reg.player_id IS NULL THEN
      v_omitidos := v_omitidos + 1;
      CONTINUE;
    END IF;

    v_res := CASE
      WHEN reg.team = 1 THEN
        CASE WHEN m.score_a > m.score_b THEN 'win'
             WHEN m.score_a < m.score_b THEN 'loss'
             ELSE 'draw' END
      ELSE
        CASE WHEN m.score_b > m.score_a THEN 'win'
             WHEN m.score_b < m.score_a THEN 'loss'
             ELSE 'draw' END
    END;

    SELECT coalesce(reg.rating, 0.95) INTO r_antes;
    r_desp := greatest(0.50, least(1.60, r_antes + CASE v_res
      WHEN 'win' THEN 0.015
      WHEN 'draw' THEN 0.002
      ELSE -0.012 END));

    UPDATE players SET rating = r_desp, updated_at = now() WHERE id = reg.player_id;
    UPDATE mm_match_players
    SET rr_before = round(r_antes * 100)::int, rr_after = round(r_desp * 100)::int
    WHERE match_id = p_match_id AND sub = reg.sub;

    -- wins/losses de temporada + espejo rank/mmr (mismo camino que FACEIT)
    PERFORM faceit_stats_delta(reg.player_id, v_res, r_desp);

    -- ★ historial RR (motivo · partida · temporada · fecha)
    INSERT INTO rr_historial
      (player_id, motivo, fuente, partida_id, temporada, game, mode, region, rr_before, rr_after)
    VALUES
      (reg.player_id, 'match_interno', 'interno', p_match_id::text,
       rr_temporada_actual(), m.game, m.mode, m.region,
       round(r_antes * 100)::int, round(r_desp * 100)::int)
    ON CONFLICT (player_id, fuente, partida_id) DO NOTHING;

    v_aplicados := v_aplicados + 1;
  END LOOP;

  UPDATE mm_matches
  SET status = 'verificado',
      verify_source = 'auto',
      verify_payload = jsonb_build_object(
        'aplicados', v_aplicados,
        'omitidos', v_omitidos,
        'regla', 'win +0.015 / draw +0.002 / loss -0.012, clamp [0.50,1.60]',
        'at', now()),
      updated_at = now()
  WHERE id = p_match_id;

  RETURN jsonb_build_object('ok', true, 'aplicados', v_aplicados, 'omitidos', v_omitidos);
END;
$$;

-- ---------- 5) historial por jugador (consulta del service / web) ----------
-- Historial RR COMPLETO del jugador: cambios FACEIT + matches internos,
-- con motivo, partida, temporada y fecha (lo pedido) + datos del match.
CREATE OR REPLACE VIEW rr_historial_jugador AS
SELECT
  h.id,
  h.player_id,
  p.username,
  coalesce(p.display_name, p.username) AS nombre,
  h.motivo,
  h.fuente,
  h.partida_id,
  h.temporada,
  h.game,
  h.mode,
  h.region,
  h.rr_before,
  h.rr_after,
  h.rr_delta,
  CASE
    WHEN h.rr_delta > 0 THEN 'win'
    WHEN h.rr_delta < 0 THEN 'loss'
    ELSE 'draw'
  END AS resultado,
  h.creado_en AS fecha
FROM rr_historial h
JOIN players p ON p.id = h.player_id
ORDER BY h.creado_en DESC;

-- ---------- 6) resumen por jugador (último RR, saldo de cambios) ----------
CREATE OR REPLACE VIEW rr_resumen AS
SELECT
  p.id   AS player_id,
  p.username,
  count(h.id)                        AS cambios,
  count(h.id) FILTER (WHERE h.rr_delta > 0) AS subidas,
  count(h.id) FILTER (WHERE h.rr_delta < 0) AS bajadas,
  coalesce(max(h.rr_after), round(p.rating * 100)::int) AS rr_actual,
  max(h.creado_en)                   AS ultimo_cambio
FROM players p
LEFT JOIN rr_historial h ON h.player_id = p.id
GROUP BY p.id, p.username, p.rating;

-- ---------- 7) inventario (log del workflow) ----------
SELECT relname AS tabla, n_live_tup AS filas_aprox
FROM pg_stat_user_tables
WHERE schemaname = 'public' AND relname IN ('rr_historial', 'players', 'mm_matches')
ORDER BY relname;
