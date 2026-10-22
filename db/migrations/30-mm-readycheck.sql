-- ============================================================
-- 30-mm-readycheck.sql
-- Fase 6 · Ready-check de la partida (nivel 2 del arranque).
-- ------------------------------------------------------------
-- Hoy mm_intentar_emparejar (migra 21) crea la partida y cada HUB
-- lanza el juego por su cuenta, sin confirmar que todos estén
-- presentes. Acá agregamos el ready-check:
--
--   · mm_matches.ready_deadline — fecha límite para confirmar; la
--     fija el emparejador en el mismo INSERT: now() + 120 s.
--   · mm_ready (match_id, sub, listo_at) — confirmaciones; PK
--     compuesta = un "listo" por participante (idempotente).
--   · mm_listo(match_id)        — participante confirma (JWT guard,
--                                 rechaza timeout/anulada).
--   · mm_estado_ready(match_id) — listos X/N + deadline + vencido
--                                 (solo participantes).
--   · mm_anular_si_timeout(match_id) — UNA VEZ vencido el deadline y
--     sin confirmación completa, cualquier participante anula la
--     partida (lazy: lo dispara el primer cliente que consulta).
--     Los tickets quedan 'matched' como historial; cada HUB se
--     re-encola SOLO (mm_encolar acepta de nuevo porque el índice
--     único parcial es sobre status='queued').
--   · mm_reportar se re-emite con guard explícito 'partida_anulada'.
--
-- Todos los guards exigen que el JWT (request.jwt.claim.sub) sea
-- participante del match — el ready-check es HUB-only a propósito:
-- el service y las neon-functions no lo necesitan.
-- ============================================================

-- ---------- 1) deadline en mm_matches ----------
ALTER TABLE mm_matches ADD COLUMN IF NOT EXISTS ready_deadline timestamptz;

-- ---------- 2) confirmaciones ----------
CREATE TABLE IF NOT EXISTS mm_ready (
  match_id uuid NOT NULL REFERENCES mm_matches(id) ON DELETE CASCADE,
  sub      text NOT NULL,
  listo_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (match_id, sub)
);

CREATE INDEX IF NOT EXISTS mm_ready_match_idx ON mm_ready (match_id);

-- ---------- 3) emparejador: fija el deadline al crear la partida ----------
-- Re-emisión de la migra 21 con UNA diferencia: el INSERT de
-- mm_matches incluye ready_deadline = now() + 120 s. Resto idéntico
-- (FIFO, SKIP LOCKED, tamaños duo=2 / team=10, reparto de lados).
CREATE OR REPLACE FUNCTION mm_intentar_emparejar(
  p_game   text,
  p_mode   text,
  p_region text
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_n   int := CASE WHEN p_mode = 'team' THEN 10 ELSE 2 END;
  v_id  uuid;
BEGIN
  -- 0) vencidos fuera (una pasada barata por llamada)
  UPDATE mm_tickets
  SET status = 'expired', updated_at = now()
  WHERE status = 'queued' AND expires_at < now();

  -- 1) emparejar si la cola completa el grupo
  WITH candidatos AS (
    SELECT ticket, sub, enqueued_at
    FROM mm_tickets
    WHERE status  = 'queued'
      AND game    = p_game
      AND mode    = p_mode
      AND region  = p_region
      AND expires_at >= now()
    ORDER BY enqueued_at
    LIMIT v_n
    FOR UPDATE SKIP LOCKED
  ),
  nuevo AS (
    INSERT INTO mm_matches (game, mode, region, ready_deadline)
    SELECT p_game, p_mode, p_region, now() + make_interval(secs => 120)
    FROM candidatos
    HAVING count(*) = v_n
    RETURNING id
  ),
  marcados AS (
    UPDATE mm_tickets t
    SET status = 'matched', match_id = n.id, updated_at = now()
    FROM candidatos c
    CROSS JOIN nuevo n
    WHERE t.ticket = c.ticket
    RETURNING t.ticket
  ),
  jugadores AS (
    INSERT INTO mm_match_players (match_id, sub, team)
    SELECT n.id,
           c.sub,
           CASE
             WHEN row_number() OVER (ORDER BY c.enqueued_at, c.ticket)
                  <= (CASE WHEN p_mode = 'team' THEN 5 ELSE 1 END)
             THEN 1 ELSE 2
           END
    FROM candidatos c
    CROSS JOIN nuevo n
  )
  SELECT id INTO v_id FROM nuevo;

  RETURN v_id;
END;
$$;

-- ---------- 4) confirmar ("estoy listo") ----------
CREATE OR REPLACE FUNCTION mm_listo(p_match_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m        record;
  v_total  int;
  v_listos int;
BEGIN
  IF mm_jwt_sub() IS NULL OR NOT EXISTS (
    SELECT 1 FROM mm_match_players
    WHERE match_id = p_match_id AND sub = mm_jwt_sub()
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_participante');
  END IF;

  SELECT * INTO m FROM mm_matches WHERE id = p_match_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_encontrado');
  END IF;
  IF m.status = 'anulado' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'partida_anulada');
  END IF;
  IF m.status <> 'propuesto' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'estado_invalido');
  END IF;
  IF m.ready_deadline IS NOT NULL AND now() > m.ready_deadline THEN
    RETURN jsonb_build_object('ok', false, 'error', 'timeout');
  END IF;

  INSERT INTO mm_ready (match_id, sub)
  VALUES (p_match_id, mm_jwt_sub())
  ON CONFLICT (match_id, sub) DO NOTHING;

  SELECT count(*) INTO v_total FROM mm_match_players WHERE match_id = p_match_id;
  SELECT count(*) INTO v_listos FROM mm_ready WHERE match_id = p_match_id;
  RETURN jsonb_build_object('ok', true, 'listos', v_listos, 'total', v_total,
                            'deadline', m.ready_deadline);
END;
$$;

-- ---------- 5) estado del ready-check (solo participantes) ----------
CREATE OR REPLACE FUNCTION mm_estado_ready(p_match_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m         record;
  v_total   int;
  v_listos  int;
  v_vencido boolean;
BEGIN
  IF mm_jwt_sub() IS NULL OR NOT EXISTS (
    SELECT 1 FROM mm_match_players
    WHERE match_id = p_match_id AND sub = mm_jwt_sub()
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_participante');
  END IF;

  SELECT * INTO m FROM mm_matches WHERE id = p_match_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_encontrado');
  END IF;

  SELECT count(*) INTO v_total FROM mm_match_players WHERE match_id = p_match_id;
  SELECT count(*) INTO v_listos FROM mm_ready WHERE match_id = p_match_id;
  v_vencido := (m.status = 'propuesto'
                AND m.ready_deadline IS NOT NULL
                AND now() > m.ready_deadline
                AND v_listos < v_total);

  RETURN jsonb_build_object('ok', true, 'status', m.status,
                            'listos', v_listos, 'total', v_total,
                            'deadline', m.ready_deadline, 'vencido', v_vencido);
END;
$$;

-- ---------- 6) anular si venció el deadline y faltaron ----------
-- Lazy: lo dispara el primer participante que consulta después del
-- deadline. Transaccional (FOR UPDATE): si dos clientes lo llaman a la
-- vez, el segundo ve status='anulado' y devuelve ya.anulado.
CREATE OR REPLACE FUNCTION mm_anular_si_timeout(p_match_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m        record;
  v_total  int;
  v_listos int;
BEGIN
  IF mm_jwt_sub() IS NULL OR NOT EXISTS (
    SELECT 1 FROM mm_match_players
    WHERE match_id = p_match_id AND sub = mm_jwt_sub()
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_participante');
  END IF;

  SELECT * INTO m FROM mm_matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_encontrado');
  END IF;
  IF m.status <> 'propuesto' THEN
    RETURN jsonb_build_object('ok', true, 'status', m.status,
                              'anulado', (m.status = 'anulado'));
  END IF;

  SELECT count(*) INTO v_total FROM mm_match_players WHERE match_id = p_match_id;
  SELECT count(*) INTO v_listos FROM mm_ready WHERE match_id = p_match_id;

  IF m.ready_deadline IS NULL OR now() <= m.ready_deadline THEN
    RETURN jsonb_build_object('ok', false, 'error', 'aun_vigente',
                              'listos', v_listos, 'total', v_total);
  END IF;
  IF v_listos >= v_total THEN
    RETURN jsonb_build_object('ok', false, 'error', 'todos_listos');
  END IF;

  UPDATE mm_matches
  SET status = 'anulado',
      verify_payload = jsonb_build_object(
        'motivo', 'ready_timeout', 'listos', v_listos, 'total', v_total, 'at', now()),
      updated_at = now()
  WHERE id = p_match_id;

  RETURN jsonb_build_object('ok', true, 'anulado', true,
                            'listos', v_listos, 'total', v_total);
END;
$$;

-- ---------- 7) reportar: guard explícito para anuladas ----------
-- Re-emisión de la migra 23 con UNA diferencia: si el match está
-- 'anulado' responde partida_anulada (antes caía en el genérico
-- ya_reportado, que confundía al jugador).
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
  IF m.status = 'anulado' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'partida_anulada');
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

-- ---------- inventario (log del workflow) ----------
SELECT p.proname, p.prokind
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname LIKE 'mm_%'
ORDER BY p.proname;
