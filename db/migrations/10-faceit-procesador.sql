-- ============================================================
-- 10-faceit-procesador.sql
-- De eventos crudos FACEIT a XP + RANGO en la web.
-- ------------------------------------------------------------
-- Cadena completa:
--   FACEIT → worker (feispla/vants-faceit-webhook) → faceit_webhook_events
--   → faceit_procesar_eventos() (cron faceit-xp.yml, cada 10 min)
--   → faceit_aplicar_resultado() → XP (08) + RATING + stats de temporada
--
-- Regla de rango por partida FACEIT (misma escala de la web):
--   victoria  +0.015 rating   ·   empate +0.002   ·   derrota -0.012
--   clamp [0.50, 1.60] · sin rating = placement en 0.95 (ACERO base)
-- La XP sigue la regla de 08: +100 victoria, +25 empate, 0 derrota,
-- nivel = 1 + floor(xp/500). Idempotente: UNIQUE(faceit_match_id)
-- impide doble XP o doble movimiento de rating por la misma partida.
-- Juegos soportados: cs2 (y csgo se normaliza a cs2) y valorant.
-- ============================================================

-- ---------- 0) tipos reales de la base ----------
-- players.rating pasa a double precision en 12-players-rating-tipo.sql (ahí
-- se gestiona la vista leaderboard). Aquí solo se recalcula el espejo entero
-- de season_player_stats para no dejar basura de la escala antigua.
UPDATE season_player_stats
SET rank = coalesce(rank, '0.95')::numeric::text
WHERE rank IS NOT NULL AND rank !~ '^[0-9]*\.?[0-9]+$';

-- ---------- 1) stats de temporada tras una partida (con soporte empate) ----------
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
  SET rank = p_nuevo_rating::text, mmr = round(p_nuevo_rating * 100)::int
  WHERE player_id = p_player_id;
END;
$$;

-- ---------- 2) aplicar un resultado FACEIT a un jugador VANTS ----------
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

  SELECT xp INTO v_xp FROM players WHERE id = p_player_id;
  RETURN jsonb_build_object(
    'ok', true, 'nueva', true,
    'xp_ganada', reg->>'xp_ganada', 'xp_total', v_xp,
    'rating_antes', round(r_antes::numeric, 3), 'rating_despues', round(r_desp::numeric, 3),
    'mmr', round(r_desp * 100));
END;
$$;

-- ---------- 3) procesador de eventos pendientes ----------
CREATE OR REPLACE FUNCTION faceit_procesar_eventos(p_limite int DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ev record;
  v_match jsonb;
  v_mid text;
  v_game text;
  v_winner text;
  v_fin timestamptz;
  fac text;
  roster jsonb;
  r record;
  v_pid uuid;
  v_res text;
  v_procesadas int := 0;
  v_partidas int := 0;
BEGIN
  FOR ev IN
    SELECT id, payload
    FROM faceit_webhook_events
    WHERE processed = false AND event_type = 'match_status_finished'
    ORDER BY created_at
    LIMIT greatest(1, least(coalesce(p_limite, 50), 200))
  LOOP
    v_match := ev.payload->'payload';
    v_mid := coalesce(v_match->>'match_id', v_match->>'id');
    v_game := lower(coalesce(v_match->>'game', 'cs2'));
    IF v_game = 'csgo' THEN v_game := 'cs2'; END IF;
    v_winner := v_match->'results'->>'winner';
    BEGIN
      v_fin := to_timestamp((v_match->>'finished_at')::double precision);
    EXCEPTION WHEN OTHERS THEN v_fin := NULL; END;

    -- sin datos mínimos: se marca procesado para no trabar la cola
    IF v_mid IS NULL OR v_winner IS NULL OR v_game NOT IN ('cs2', 'valorant') THEN
      UPDATE faceit_webhook_events SET processed = true WHERE id = ev.id;
      v_procesadas := v_procesadas + 1;
      CONTINUE;
    END IF;

    -- buscar jugadores VANTS en los dos rosters (por player_id o nick)
    FOREACH fac IN ARRAY ARRAY['faction1', 'faction2'] LOOP
      roster := v_match->'teams'->fac->'roster';
      IF roster IS NULL OR jsonb_typeof(roster) <> 'array' THEN CONTINUE; END IF;
      FOR r IN SELECT je AS j FROM jsonb_array_elements(roster) je LOOP
        SELECT pl.id INTO v_pid
        FROM players pl
        JOIN vants_links vl ON vl.player_id = pl.id
        WHERE vl.platform = 'faceit'
          AND (vl.platform_user_id = r.j->>'player_id'
               OR lower(coalesce(vl.handle, '')) = lower(coalesce(r.j->>'nickname', '')))
        LIMIT 1;
        IF v_pid IS NULL THEN CONTINUE; END IF;

        v_res := CASE WHEN fac = v_winner THEN 'win' ELSE 'loss' END;
        PERFORM faceit_aplicar_resultado(v_pid, v_mid, v_game, v_res, v_fin, NULL);
        v_partidas := v_partidas + 1;
      END LOOP;
    END LOOP;

    UPDATE faceit_webhook_events SET processed = true WHERE id = ev.id;
    v_procesadas := v_procesadas + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'eventos_procesados', v_procesadas, 'partidas_aplicadas', v_partidas);
END;
$$;

-- ---------- 4) inventario final (log del workflow) ----------
SELECT relname AS tabla, n_live_tup AS filas_aprox
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY relname;
