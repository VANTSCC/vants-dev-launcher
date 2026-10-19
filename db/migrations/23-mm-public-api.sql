-- ============================================================
-- 23-mm-public-api.sql
-- Fase 4/5 · API pública del matchmaking para clientes directos.
-- ------------------------------------------------------------
-- El matchmaking-service (Fastify) y el HUB de escritorio (Electron)
-- comparten ESTA capa atómica en SQL — una sola fuente de verdad:
--   mm_encolar(sub, game, mode, region, ttl)        → ticket (reutiliza vivo)
--   mm_ticket_estado(ticket)                        → posición/estado/match
--   mm_salir(ticket)                                → salir de la cola
--   mm_reportar(match_id, sub, score_a, score_b)    → reporta + aplica RR
--   mm_historial_de(sub, limite)                    → historial RR propio
-- Las funciones son SECURITY DEFINER (mman escribe en varias tablas);
-- el guard de identidad exige que el argumento p_sub coincida con el
-- claim `sub` del JWT que trae PostgREST (request.jwt.claim.sub). Las
-- llamadas del service (conexión directa, sin JWT) no llevan ese GUC
-- y pasan porque ya validaron el Bearer por su cuenta.
-- ============================================================

-- ---------- helper: identidad del JWT actual (o NULL si no hay) ----------
CREATE OR REPLACE FUNCTION mm_jwt_sub()
RETURNS text
LANGUAGE plpgsql STABLE
SET search_path = public
AS $$
DECLARE v text;
BEGIN
  BEGIN
    v := current_setting('request.jwt.claim.sub', true);
  EXCEPTION WHEN OTHERS THEN v := NULL; END;
  RETURN v;
END;
$$;

-- ---------- 1) encolar (reutiliza ticket vivo; NO duplica) ----------
CREATE OR REPLACE FUNCTION mm_encolar(
  p_sub    text,
  p_game   text,
  p_mode   text,
  p_region text,
  p_ttl_seg int DEFAULT 600
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ticket      text;
  v_reus        boolean := false;
  v_expira      timestamptz;
  v_jugador     uuid;
BEGIN
  -- identidad: si viene un JWT, el sub del argumento debe ser el propio
  IF mm_jwt_sub() IS NOT NULL AND mm_jwt_sub() <> p_sub THEN
    RETURN jsonb_build_object('ok', false, 'error', 'sub_ajeno');
  END IF;

  IF p_game IS NULL OR btrim(p_game) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'game_requerido');
  END IF;
  IF p_mode NOT IN ('duo', 'team') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'mode_invalido');
  END IF;

  -- elegibilidad: perfil VANTS vinculado a ese sub
  SELECT id INTO v_jugador FROM players WHERE auth0_sub = p_sub LIMIT 1;
  IF v_jugador IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_elegible');
  END IF;

  -- vencidos propios fuera (libera el ticket si expiró)
  UPDATE mm_tickets SET status = 'expired', updated_at = now()
  WHERE sub = p_sub AND status = 'queued' AND expires_at < now();

  -- ticket vivo para el mismo juego → reutilizar (prevención duplicados)
  SELECT ticket INTO v_ticket FROM mm_tickets
  WHERE sub = p_sub AND game = p_game AND status = 'queued' AND expires_at >= now()
  LIMIT 1;
  IF v_ticket IS NOT NULL THEN
    v_reus := true;
  ELSE
    v_ticket := 'MM-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
    v_expira := now() + make_interval(secs => greatest(60, least(coalesce(p_ttl_seg, 600), 3600)));
    INSERT INTO mm_tickets (ticket, sub, game, mode, region, expires_at)
    VALUES (v_ticket, p_sub, btrim(p_game), p_mode,
            coalesce(nullif(btrim(coalesce(p_region, '')), ''), 'EU'), v_expira)
    ON CONFLICT (sub, game) WHERE status = 'queued' DO NOTHING;
    IF NOT FOUND THEN -- carrera con otro INSERT: reutilizar el que ganó
      SELECT ticket INTO v_ticket FROM mm_tickets
      WHERE sub = p_sub AND game = p_game AND status = 'queued' LIMIT 1;
      v_reus := true;
    END IF;
  END IF;

  SELECT expires_at INTO v_expira FROM mm_tickets WHERE ticket = v_ticket;
  RETURN jsonb_build_object('ok', true, 'ticket', v_ticket,
                            'reutilizado', v_reus, 'expires_at', v_expira);
END;
$$;

-- ---------- 2) estado del ticket (solo el dueño) ----------
CREATE OR REPLACE FUNCTION mm_ticket_estado(p_ticket text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t record;
  v_pos int;
BEGIN
  SELECT * INTO t FROM mm_tickets WHERE ticket = p_ticket;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_encontrado');
  END IF;
  IF mm_jwt_sub() IS NOT NULL AND mm_jwt_sub() <> t.sub THEN
    RETURN jsonb_build_object('ok', false, 'error', 'ticket_ajeno');
  END IF;

  IF t.status = 'queued' AND t.expires_at < now() THEN
    RETURN jsonb_build_object('ok', true, 'status', 'expired', 'match_id', NULL, 'position', 0);
  END IF;

  IF t.status = 'queued' THEN
    SELECT count(*)::int + 1 INTO v_pos
    FROM mm_tickets o
    WHERE o.status = 'queued' AND o.game = t.game AND o.mode = t.mode
      AND o.region = t.region AND o.enqueued_at < t.enqueued_at;
    RETURN jsonb_build_object('ok', true, 'status', 'queued', 'position', v_pos,
                              'match_id', NULL, 'expires_at', t.expires_at);
  END IF;

  RETURN jsonb_build_object('ok', true, 'status', t.status,
                            'match_id', t.match_id, 'position', 0);
END;
$$;

-- ---------- 3) salir de la cola (solo el dueño) ----------
CREATE OR REPLACE FUNCTION mm_salir(p_ticket text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE t record;
BEGIN
  SELECT * INTO t FROM mm_tickets WHERE ticket = p_ticket;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_encontrado');
  END IF;
  IF mm_jwt_sub() IS NOT NULL AND mm_jwt_sub() <> t.sub THEN
    RETURN jsonb_build_object('ok', false, 'error', 'ticket_ajeno');
  END IF;
  UPDATE mm_tickets SET status = 'cancelled', updated_at = now()
  WHERE ticket = p_ticket AND status = 'queued';
  RETURN jsonb_build_object('ok', true, 'removed', (t.status = 'queued'));
END;
$$;

-- ---------- 4) reportar resultado + aplicar RR (solo participante) ----------
CREATE OR REPLACE FUNCTION mm_reportar(
  p_match_id uuid,
  p_sub      text,
  p_score_a  int,
  p_score_b  int
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m  record;
  v_participa boolean;
  res jsonb;
BEGIN
  IF mm_jwt_sub() IS NOT NULL AND mm_jwt_sub() <> p_sub THEN
    RETURN jsonb_build_object('ok', false, 'error', 'sub_ajeno');
  END IF;
  IF p_score_a IS NULL OR p_score_b IS NULL OR p_score_a < 0 OR p_score_b < 0
     OR p_score_a + p_score_b = 0
     OR p_score_a <> floor(p_score_a) OR p_score_b <> floor(p_score_b) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'score_invalido');
  END IF;

  SELECT * INTO m FROM mm_matches WHERE id = p_match_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_encontrado');
  END IF;
  IF m.status <> 'propuesto' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'ya_reportado');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM mm_match_players WHERE match_id = p_match_id AND sub = p_sub
  ) INTO v_participa;
  IF NOT v_participa THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_participante');
  END IF;

  UPDATE mm_matches
  SET status = 'reportado', score_a = p_score_a, score_b = p_score_b,
      report_sub = p_sub, report_at = now(), updated_at = now()
  WHERE id = p_match_id AND status = 'propuesto';

  res := mm_aplicar_resultado(p_match_id);
  RETURN jsonb_build_object('ok', true, 'verificado', coalesce(res->>'ok', 'false'),
                            'rr', res);
END;
$$;

-- ---------- 5) historial RR propio ----------
CREATE OR REPLACE FUNCTION mm_historial_de(p_sub text, p_limite int DEFAULT 50)
RETURNS SETOF mm_historial
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF mm_jwt_sub() IS NOT NULL AND mm_jwt_sub() <> p_sub THEN
    RETURN; -- sin filas si piden otro sub con JWT
  END IF;
  RETURN QUERY
  SELECT h.* FROM mm_historial h WHERE h.sub = p_sub
  LIMIT greatest(1, least(coalesce(p_limite, 50), 100));
END;
$$;

-- ---------- inventario (log del workflow) ----------
SELECT p.proname, p.prokind
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname LIKE 'mm_%'
ORDER BY p.proname;
