-- ============================================================
-- 22-mm-rr.sql
-- Fase 4 · Cierre del ciclo: resultado reportado → RR aplicado.
-- ------------------------------------------------------------
-- El reporte de un match interno (mm_matches.status='reportado',
-- service v0.5.0) llama a mm_aplicar_resultado(match_id):
--   · Determina ganador por score_a (team 1) vs score_b (team 2).
--   · Aplica la MISMA regla de rango que FACEIT (migración 10):
--       victoria +0.015 · empate +0.002 · derrota -0.012
--       clamp [0.50, 1.60] · sin rating = placement 0.95
--   · Reutiliza faceit_stats_delta() para wins/losses de temporada
--     y el espejo rank/mmr (scale *100, igual que la web lee).
--   · Guarda rr_before/rr_after (RR entero = rating*100) por
--     participante → historial RR del jugador.
--   · Marca el match 'verificado' con verify_source='auto'.
-- Idempotente: solo transiciona desde 'reportado' (llamar dos veces
-- no duplica RR; segunda llamada responde {ok, ya:true}).
-- ============================================================

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

-- ---------- historial RR por jugador (para GET /history del service) ----------
-- Vista simple: cada match en que el jugador participó, con su lado y RR.
CREATE OR REPLACE VIEW mm_historial AS
SELECT
  mp.sub,
  m.id        AS match_id,
  m.game,
  m.mode,
  m.region,
  m.status,
  m.score_a,
  m.score_b,
  mp.team,
  mp.rr_before,
  mp.rr_after,
  (mp.rr_after - mp.rr_before) AS rr_delta,
  CASE
    WHEN mp.rr_after > mp.rr_before THEN 'win'
    WHEN mp.rr_after < mp.rr_before THEN 'loss'
    WHEN mp.rr_after IS NOT NULL THEN 'draw'
    ELSE NULL
  END          AS resultado,
  m.created_at AS played_at
FROM mm_match_players mp
JOIN mm_matches m ON m.id = mp.match_id
ORDER BY m.created_at DESC;

-- ---------- inventario (log del workflow) ----------
SELECT relname AS tabla, n_live_tup AS filas_aprox
FROM pg_stat_user_tables
WHERE schemaname = 'public' AND relname LIKE 'mm_%'
ORDER BY relname;
