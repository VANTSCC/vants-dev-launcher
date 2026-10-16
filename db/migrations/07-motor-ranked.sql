-- ============================================================
-- 07-motor-ranked.sql
-- MOTOR VANTS RANKED: series reportadas + Elo real.
-- ------------------------------------------------------------
-- Hasta hoy players.rating / season_player_stats se mostraban
-- pero nadie los escribía: el rango era un dato muerto.
-- Este archivo crea el mecanismo para subir (o bajar) de rango:
--
--   1) Tabla series_ranked: una fila por serie reportada.
--   2) reportar_serie(rival, gano, mapa)  → serie pendiente.
--   3) confirmar_serie(serie)             → SOLO el rival (o el
--      dueño) la confirma y ahí se aplica el Elo: rating nuevo
--      en players, wins/losses/mmr/rank en season_player_stats.
--   4) rechazar_serie(serie)              → el rival la rechaza.
--   5) mis_series()                       → series por confirmar.
--
-- Escala de rating (la MISMA que dibuja la web):
--   0.95 ACERO · 1.00 TITANIO · 1.05 OBSIDIANA · 1.11 CROMO ·
--   1.17 PLASMA · 1.24 ÉTER · 1.30 VANTS (apex)
-- Sin rating = SIN RANGO (placements). La primera serie confirmada
-- coloca al jugador alrededor de 0.95 y desde ahí sube o baja.
--
-- Idempotente y defensivo (el workflow lo re-ejecuta en cada push).
-- Reversible: DROP TABLE series_ranked; DROP FUNCTION reportar_serie,
-- confirmar_serie, rechazar_serie, mis_series;
-- ============================================================

-- ---------- 1) tabla de series ----------
CREATE TABLE IF NOT EXISTS series_ranked (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  retador_id              uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  rival_id                uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  reportado_por           uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  gano_retador            boolean NOT NULL,
  mapa                    text,
  estado                  text NOT NULL DEFAULT 'pendiente'
                          CHECK (estado IN ('pendiente','confirmada','rechazada')),
  rating_retador_antes    double precision,
  rating_retador_despues  double precision,
  rating_rival_antes      double precision,
  rating_rival_despues    double precision,
  creado_at               timestamptz NOT NULL DEFAULT now(),
  cerrado_at              timestamptz,
  CONSTRAINT serie_valida CHECK (retador_id <> rival_id)
);
CREATE INDEX IF NOT EXISTS series_pend_rival_idx
  ON series_ranked (rival_id) WHERE estado = 'pendiente';
CREATE INDEX IF NOT EXISTS series_pend_retador_idx
  ON series_ranked (retador_id) WHERE estado = 'pendiente';
CREATE INDEX IF NOT EXISTS series_cerrado_idx
  ON series_ranked (LEAST(retador_id, rival_id), cerrado_at DESC);

ALTER TABLE series_ranked ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='series_ranked' AND policyname='series_leer_participantes') THEN
    CREATE POLICY series_leer_participantes ON series_ranked
      FOR SELECT USING (
        retador_id = current_player_id()
        OR rival_id = current_player_id()
        OR current_player_id() IN (SELECT id FROM players WHERE role = 'owner')
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='series_ranked' AND policyname='series_reportar_con_sesion') THEN
    CREATE POLICY series_reportar_con_sesion ON series_ranked
      FOR INSERT WITH CHECK (
        current_auth0_sub() IS NOT NULL
        AND reportado_por = current_player_id()
      );
  END IF;
  /* UPDATE y DELETE: solo por las funciones SECURITY DEFINER (nadie
     edita una serie directamente desde el navegador) */
END $$;

-- ---------- 2) utilidad: ¿el jugador actual es el dueño? ----------
CREATE OR REPLACE FUNCTION _es_dueno(p_pid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM players
    WHERE id = p_pid
      AND (
        role = 'owner'
        OR lower(coalesce(email, '')) IN ('geimerjhoan099@gmail.com', 'admin@vants.games')
      )
  );
$$;

-- ---------- 3) REPORTAR SERIE ----------
CREATE OR REPLACE FUNCTION reportar_serie(p_rival text, p_gano boolean, p_mapa text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pid  uuid;
  rid  uuid;
  sid  uuid;
  v_mapa text;
BEGIN
  pid := current_player_id();
  IF pid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'sin_sesion');
  END IF;

  SELECT id INTO rid
  FROM players
  WHERE lower(coalesce(username, '')) = lower(trim(coalesce(p_rival, '')))
     OR lower(coalesce(display_name, '')) = lower(trim(coalesce(p_rival, '')))
  ORDER BY (auth0_sub IS NOT NULL) DESC, created_at
  LIMIT 1;

  IF rid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'rival_no_encontrado', 'rival', p_rival);
  END IF;
  IF rid = pid THEN
    RETURN jsonb_build_object('ok', false, 'error', 'mismo_jugador');
  END IF;

  /* el rival debe haber entrado alguna vez con sesión: si no, la
     serie quedaría pendiente para siempre (nadie puede confirmarla) */
  IF NOT EXISTS (SELECT 1 FROM players WHERE id = rid AND auth0_sub IS NOT NULL) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'rival_sin_sesion', 'rival', p_rival);
  END IF;

  IF EXISTS (
    SELECT 1 FROM series_ranked s
    WHERE s.estado = 'pendiente'
      AND ((s.retador_id = pid AND s.rival_id = rid)
        OR (s.retador_id = rid AND s.rival_id = pid))
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'serie_ya_pendiente');
  END IF;

  /* enfriamiento: la misma pareja no puede farmear series seguidas */
  IF EXISTS (
    SELECT 1 FROM series_ranked s
    WHERE s.estado = 'confirmada'
      AND s.cerrado_at > now() - interval '15 minutes'
      AND ((s.retador_id = pid AND s.rival_id = rid)
        OR (s.retador_id = rid AND s.rival_id = pid))
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'enfriamiento');
  END IF;

  v_mapa := NULLIF(regexp_replace(coalesce(p_mapa, ''), '[^A-Za-z0-9 _\-]', '', 'g'), '');
  IF length(v_mapa) > 30 THEN v_mapa := left(v_mapa, 30); END IF;

  INSERT INTO series_ranked (retador_id, rival_id, reportado_por, gano_retador, mapa)
  VALUES (pid, rid, pid, coalesce(p_gano, true), v_mapa)
  RETURNING id INTO sid;

  RETURN jsonb_build_object('ok', true, 'serie', sid, 'estado', 'pendiente');
END;
$$;

-- ---------- 4) aplicar Elo a una serie confirmada (interno) ----------
CREATE OR REPLACE FUNCTION _aplicar_elo(p_serie uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s        series_ranked;
  r1       double precision;
  r2       double precision;
  n1       double precision;
  n2       double precision;
  e1       double precision;
  d        double precision;
  ganador  text;
BEGIN
  SELECT * INTO s FROM series_ranked WHERE id = p_serie FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'serie_inexistente'); END IF;
  IF s.estado <> 'pendiente' THEN RETURN jsonb_build_object('ok', false, 'error', 'estado_invalido'); END IF;

  /* placements: quien no tiene rating entra por la base 0.95 (ACERO) */
  SELECT coalesce(rating, 0.95) INTO r1 FROM players WHERE id = s.retador_id;
  SELECT coalesce(rating, 0.95) INTO r2 FROM players WHERE id = s.rival_id;

  e1 := 1.0 / (1.0 + power(10.0, (r2 - r1) / 0.25));
  d  := 0.045 * ((CASE WHEN s.gano_retador THEN 1.0 ELSE 0.0 END) - e1);
  IF abs(d) < 0.008 THEN d := sign(d) * 0.008; END IF;

  n1 := greatest(0.50, least(1.60, r1 + d));
  n2 := greatest(0.50, least(1.60, r2 - d));

  UPDATE players SET rating = n1, updated_at = now() WHERE id = s.retador_id;
  UPDATE players SET rating = n2, updated_at = now() WHERE id = s.rival_id;

  -- stats de temporada (tabla creada a mano en Neon: defensivo)
  BEGIN
    PERFORM _stats_tras_serie(s.retador_id, s.gano_retador, n1);
    PERFORM _stats_tras_serie(s.rival_id, NOT s.gano_retador, n2);
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'season_player_stats omitida (%)', SQLERRM;
  END;

  UPDATE series_ranked
  SET estado = 'confirmada',
      cerrado_at = now(),
      rating_retador_antes = r1,   rating_retador_despues = n1,
      rating_rival_antes = r2,     rating_rival_despues = n2
  WHERE id = s.id;

  ganador := CASE WHEN s.gano_retador THEN 'retador' ELSE 'rival' END;
  RETURN jsonb_build_object(
    'ok', true,
    'ganador', ganador,
    'rating_retador', round(n1::numeric, 3),
    'rating_rival', round(n2::numeric, 3),
    'mmr_retador', round(n1 * 100),
    'mmr_rival', round(n2 * 100)
  );
END;
$$;

-- ---------- 5) stats de temporada tras una serie ----------
CREATE OR REPLACE FUNCTION _stats_tras_serie(p_pid uuid, p_gano boolean, p_nuevo_rating double precision)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_season uuid; /* seasons.id es uuid en la base real */
  v_wins int;
  v_losses int;
  v_row boolean;
BEGIN
  BEGIN
    SELECT id INTO v_season FROM seasons WHERE status = 'active' ORDER BY id DESC LIMIT 1;
  EXCEPTION WHEN undefined_table THEN v_season := NULL; END;

  SELECT true INTO v_row FROM season_player_stats WHERE player_id = p_pid;
  IF v_row IS TRUE THEN
    IF p_gano THEN
      UPDATE season_player_stats
      SET wins = coalesce(wins, 0) + 1
      WHERE player_id = p_pid;
    ELSE
      UPDATE season_player_stats
      SET losses = coalesce(losses, 0) + 1
      WHERE player_id = p_pid;
    END IF;
  ELSE
    INSERT INTO season_player_stats (player_id, season_id, wins, losses)
    VALUES (p_pid, v_season, CASE WHEN p_gano THEN 1 ELSE 0 END, CASE WHEN p_gano THEN 0 ELSE 1 END);
  END IF;

  /* rank y mmr siempre espejo del rating: la web los lee de acá
     (rank es text y mmr integer en la base real — casts explícitos) */
  UPDATE season_player_stats
  SET rank = p_nuevo_rating::text,
      mmr = round(p_nuevo_rating * 100)::int
  WHERE player_id = p_pid;
END;
$$;

-- ---------- 6) CONFIRMAR SERIE (solo el rival o el dueño) ----------
CREATE OR REPLACE FUNCTION confirmar_serie(p_serie uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pid uuid;
  s series_ranked;
BEGIN
  pid := current_player_id();
  IF pid IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'sin_sesion'); END IF;

  SELECT * INTO s FROM series_ranked WHERE id = p_serie;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'serie_inexistente'); END IF;
  IF s.estado <> 'pendiente' THEN RETURN jsonb_build_object('ok', false, 'error', 'estado_invalido'); END IF;

  IF pid <> s.rival_id AND NOT _es_dueno(pid) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'solo_el_rival');
  END IF;

  RETURN _aplicar_elo(p_serie);
END;
$$;

-- ---------- 7) RECHAZAR SERIE (solo el rival o el dueño) ----------
CREATE OR REPLACE FUNCTION rechazar_serie(p_serie uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pid uuid;
  s series_ranked;
BEGIN
  pid := current_player_id();
  IF pid IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'sin_sesion'); END IF;

  SELECT * INTO s FROM series_ranked WHERE id = p_serie FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'serie_inexistente'); END IF;
  IF s.estado <> 'pendiente' THEN RETURN jsonb_build_object('ok', false, 'error', 'estado_invalido'); END IF;

  IF pid <> s.rival_id AND pid <> s.retador_id AND NOT _es_dueno(pid) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'sin_permiso');
  END IF;

  UPDATE series_ranked SET estado = 'rechazada', cerrado_at = now() WHERE id = p_serie;
  RETURN jsonb_build_object('ok', true, 'estado', 'rechazada');
END;
$$;

-- ---------- 8) MIS SERIES (pendientes por confirmar + historial) ----------
CREATE OR REPLACE FUNCTION mis_series()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pid uuid;
  por_confirmar jsonb;
  recientes jsonb;
BEGIN
  pid := current_player_id();
  IF pid IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'sin_sesion'); END IF;

  SELECT coalesce(jsonb_agg(x ORDER BY (x->>'creado_at')), '[]'::jsonb) INTO por_confirmar
  FROM (
    SELECT jsonb_build_object(
      'serie', s.id,
      'rol', CASE WHEN s.rival_id = pid THEN 'rival' ELSE 'retador' END,
      'rival', (SELECT coalesce(display_name, username) FROM players WHERE id = s.retador_id),
      'gano_retador', s.gano_retador,
      'mapa', s.mapa,
      'creado_at', s.creado_at
    ) AS x
    FROM series_ranked s
    WHERE s.estado = 'pendiente' AND s.rival_id = pid
  ) t;

  SELECT coalesce(jsonb_agg(x ORDER BY (x->>'cerrado') DESC), '[]'::jsonb) INTO recientes
  FROM (
    SELECT jsonb_build_object(
      'estado', s.estado,
      'rival', (SELECT coalesce(display_name, username) FROM players p
                WHERE p.id = CASE WHEN s.retador_id = pid THEN s.rival_id ELSE s.retador_id END),
      'gane', CASE WHEN s.retador_id = pid THEN s.gano_retador ELSE NOT s.gano_retador END,
      'mmr_antes', round(CASE WHEN s.retador_id = pid THEN s.rating_retador_antes ELSE s.rating_rival_antes END * 100),
      'mmr_despues', round(CASE WHEN s.retador_id = pid THEN s.rating_retador_despues ELSE s.rating_rival_despues END * 100),
      'mapa', s.mapa,
      'cerrado', s.cerrado_at
    ) AS x
    FROM series_ranked s
    WHERE s.estado = 'confirmada' AND (s.retador_id = pid OR s.rival_id = pid)
    ORDER BY s.cerrado_at DESC
    LIMIT 8
  ) t;

  RETURN jsonb_build_object('ok', true, 'por_confirmar', por_confirmar, 'recientes', recientes);
END;
$$;

-- ---------- 9) grants (mismo patrón defensivo que 05) ----------
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated', 'authenticator'] LOOP
    BEGIN
      EXECUTE format('GRANT EXECUTE ON FUNCTION reportar_serie(text, boolean, text) TO %I', r);
      EXECUTE format('GRANT EXECUTE ON FUNCTION confirmar_serie(uuid) TO %I', r);
      EXECUTE format('GRANT EXECUTE ON FUNCTION rechazar_serie(uuid) TO %I', r);
      EXECUTE format('GRANT EXECUTE ON FUNCTION mis_series() TO %I', r);
    EXCEPTION WHEN undefined_object THEN NULL;
    END;
  END LOOP;
  GRANT EXECUTE ON FUNCTION reportar_serie(text, boolean, text) TO PUBLIC;
  GRANT EXECUTE ON FUNCTION confirmar_serie(uuid) TO PUBLIC;
  GRANT EXECUTE ON FUNCTION rechazar_serie(uuid) TO PUBLIC;
  GRANT EXECUTE ON FUNCTION mis_series() TO PUBLIC;
END $$;

-- ---------- 10) inventario final (log del workflow) ----------
SELECT relname AS tabla, n_live_tup AS filas_aprox
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY relname;
