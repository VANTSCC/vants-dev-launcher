-- ============================================================
-- 31-mm-cola-contador.sql
-- Fase 6 · La cola deja de ser una caja negra.
-- ------------------------------------------------------------
-- Problema real reportado por el equipo: un jugador entra a
-- TEAM·5v5 y la cola "no sale" — el emparejador (migra 21/30)
-- exige exactamente N jugadores vivos del mismo juego+modo+región
-- (team=10, duo=2) y el HUB solo mostraba "posición N", así que
-- nadie sabe cuántos faltan. Peor: con comunidad pequeña la cola
-- 5v5 no llena nunca y el ticket muere a los 10 min (TTL) sin
-- explicación visible.
--
-- Solución: mm_ticket_estado re-emitido con DOS campos nuevos en
-- el branch 'queued':
--   · cola_total  — tickets VIVOS en la misma cola (incluye el
--                   propio). Filtra expires_at >= now() para no
--                   contar zombis (los vencidos solo se limpian en
--                   mm_intentar_emparejar, lazy).
--   · necesarios  — N del modo (2 / 10): el cliente calcula
--                   "faltan" sin hardcodear reglas.
-- Extra (corrección de honestidad): la posición FIFO ahora también
-- ignora tickets vencidos en su conteo — antes un vencido no
-- barrido inflaba la posición.
--
-- Sin cambios de firma: mismo nombre, mismo argumento, mismo
-- contrato jsonb — PostgREST, el service y las neon-functions no
-- se enteran (campos extra son aditivos).
-- ============================================================

CREATE OR REPLACE FUNCTION mm_ticket_estado(p_ticket text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t       record;
  v_pos   int;
  v_cola  int;
  v_nec   int;
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
    v_nec := CASE WHEN t.mode = 'team' THEN 10 ELSE 2 END;

    -- cola viva completa (el propio ticket incluido): lo que ve el
    -- emparejador cuando evalúa HAVING count(*) = v_n
    SELECT count(*)::int INTO v_cola
    FROM mm_tickets o
    WHERE o.status = 'queued' AND o.game = t.game AND o.mode = t.mode
      AND o.region = t.region AND o.expires_at >= now();

    -- posición FIFO: solo tickets vivos DELANTE del propio
    SELECT count(*)::int + 1 INTO v_pos
    FROM mm_tickets o
    WHERE o.status = 'queued' AND o.game = t.game AND o.mode = t.mode
      AND o.region = t.region AND o.enqueued_at < t.enqueued_at
      AND o.expires_at >= now();

    RETURN jsonb_build_object('ok', true, 'status', 'queued',
                              'position', v_pos,
                              'cola_total', least(v_cola, v_nec),
                              'necesarios', v_nec,
                              'match_id', NULL, 'expires_at', t.expires_at);
  END IF;

  RETURN jsonb_build_object('ok', true, 'status', t.status,
                            'match_id', t.match_id, 'position', 0);
END;
$$;

-- ---------- inventario (log del workflow) ----------
SELECT p.proname, p.prokind
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname LIKE 'mm_%'
ORDER BY p.proname;
