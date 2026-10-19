-- ============================================================
-- 24-mm-invites.sql
-- Fase 5 · Invitaciones del HUB: "convoca a un amigo a la cola".
-- ------------------------------------------------------------
-- Diseño (honesto con el plan): una invitación NO es un lobby —
-- es una convocatoria a la cola con los mismos parámetros
-- (juego · modo · región). Flujo:
--   A invita a B (por email del perfil)  → mm_invitar
--   B ve la invitación en su HUB         → mm_invites_pendientes
--   B acepta                             → mm_responder_invite
--     └─ B queda ENCOLADO con los parámetros de la invitación
--        (reusa mm_encolar de la migración 23: una sola fuente
--        de verdad, sin duplicar emparejamiento)
--   A ve la aceptación en "enviadas" y se encola también
--   El matchmaking atómico (mm_intentar_emparejar, migración 21)
--   los empareja cuando ambos están en cola.
-- Idéntico a la 23: funciones SECURITY DEFINER + guard de
-- identidad mm_jwt_sub() (el argumento del dueño debe coincidir
-- con el claim sub del JWT de PostgREST). Solo expiry 10 min,
-- un solo pendiente por pareja y juego, y respuestas cerradas.
-- ============================================================

-- ---------- tabla ----------
CREATE TABLE IF NOT EXISTS mm_invites (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_sub   text NOT NULL,
  from_name  text,
  to_sub     text NOT NULL,
  game       text NOT NULL,
  mode       text NOT NULL CHECK (mode IN ('duo','team')),
  region     text NOT NULL DEFAULT 'EU',
  status     text NOT NULL DEFAULT 'pendiente'
             CHECK (status IN ('pendiente','aceptada','rechazada','cancelada','expirada')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '10 minutes',
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mm_invites_distintos CHECK (to_sub <> from_sub)
);

CREATE INDEX IF NOT EXISTS mm_invites_to_pend_idx
  ON mm_invites (to_sub, status) WHERE status = 'pendiente';
CREATE INDEX IF NOT EXISTS mm_invites_from_pend_idx
  ON mm_invites (from_sub, status) WHERE status = 'pendiente';

-- ---------- 1) invitar (el remitente es el JWT, destino por email) ----------
CREATE OR REPLACE FUNCTION mm_invitar(
  p_to_email text,
  p_game     text,
  p_mode     text,
  p_region   text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from     text;
  v_from_id  uuid;
  v_to       text;
  v_ya       uuid;
  v_id       uuid;
BEGIN
  v_from := mm_jwt_sub();
  IF v_from IS NULL OR btrim(v_from) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'sin_sesion');
  END IF;

  IF p_game IS NULL OR btrim(p_game) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'game_requerido');
  END IF;
  IF p_mode NOT IN ('duo', 'team') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'mode_invalido');
  END IF;
  IF p_to_email IS NULL OR btrim(p_to_email) = '' OR position('@' in p_to_email) < 2 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'email_invalido');
  END IF;

  -- remitente con perfil VANTS
  SELECT id INTO v_from_id FROM players WHERE auth0_sub = v_from LIMIT 1;
  IF v_from_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_elegible');
  END IF;

  -- destino: perfil con ese email
  SELECT auth0_sub INTO v_to FROM players
  WHERE lower(email) = lower(btrim(p_to_email)) AND auth0_sub IS NOT NULL
  LIMIT 1;
  IF v_to IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'destino_no_encontrado');
  END IF;
  IF v_to = v_from THEN
    RETURN jsonb_build_object('ok', false, 'error', 'destino_es_tu_email');
  END IF;

  -- vencidos fuera (limpieza barata en cada llamada)
  UPDATE mm_invites SET status = 'expirada', updated_at = now()
  WHERE status = 'pendiente' AND expires_at < now();

  -- un solo pendiente por pareja+juego (prevención de duplicados)
  SELECT id INTO v_ya FROM mm_invites
  WHERE from_sub = v_from AND to_sub = v_to AND game = btrim(p_game) AND status = 'pendiente'
  LIMIT 1;
  IF v_ya IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'reutilizada', true, 'id', v_ya);
  END IF;

  INSERT INTO mm_invites (from_sub, from_name, to_sub, game, mode, region)
  VALUES (v_from,
          coalesce((SELECT display_name FROM players WHERE id = v_from_id),
                   (SELECT username FROM players WHERE id = v_from_id), 'jugador'),
          v_to, btrim(p_game), p_mode,
          coalesce(nullif(btrim(coalesce(p_region, '')), ''), 'EU'))
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'reutilizada', false, 'id', v_id,
                            'to_sub', v_to, 'expires_at',
                            (SELECT expires_at FROM mm_invites WHERE id = v_id));
END;
$$;

-- ---------- 2) invitaciones propias (recibidas + enviadas) ----------
CREATE OR REPLACE FUNCTION mm_invites_pendientes(p_limite int DEFAULT 20)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me text;
  v_rec jsonb;
  v_env jsonb;
BEGIN
  v_me := mm_jwt_sub();
  IF v_me IS NULL OR btrim(v_me) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'sin_sesion');
  END IF;

  -- limpieza de vencidos (mía y ajena: barato por índice parcial)
  UPDATE mm_invites SET status = 'expirada', updated_at = now()
  WHERE status = 'pendiente' AND expires_at < now();

  SELECT coalesce(jsonb_agg(x), '[]'::jsonb) INTO v_rec
  FROM (
    SELECT id, from_name AS from_nombre, game, mode, region, created_at, expires_at
    FROM mm_invites
    WHERE to_sub = v_me AND status = 'pendiente' AND expires_at >= now()
    ORDER BY created_at DESC
    LIMIT greatest(1, least(coalesce(p_limite, 20), 50))
  ) x;

  SELECT coalesce(jsonb_agg(x), '[]'::jsonb) INTO v_env
  FROM (
    SELECT id, to_sub, game, mode, region, status, created_at, expires_at
    FROM mm_invites
    WHERE from_sub = v_me AND status IN ('pendiente','aceptada')
      AND created_at > now() - interval '1 hour'
    ORDER BY created_at DESC
    LIMIT greatest(1, least(coalesce(p_limite, 20), 50))
  ) x;

  RETURN jsonb_build_object('ok', true, 'recibidas', v_rec, 'enviadas', v_env);
END;
$$;

-- ---------- 3) responder (aceptar = encolarme con sus parámetros) ----------
CREATE OR REPLACE FUNCTION mm_responder_invite(p_id uuid, p_aceptar boolean)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me  text;
  inv   record;
  res   jsonb;
BEGIN
  v_me := mm_jwt_sub();
  IF v_me IS NULL OR btrim(v_me) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'sin_sesion');
  END IF;

  SELECT * INTO inv FROM mm_invites WHERE id = p_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_encontrado');
  END IF;

  -- destino: aceptar/rechazar; remitente: solo cancelar
  IF inv.to_sub = v_me THEN
    IF inv.status <> 'pendiente' OR inv.expires_at < now() THEN
      UPDATE mm_invites SET status = 'expirada', updated_at = now()
      WHERE id = p_id AND status = 'pendiente';
      RETURN jsonb_build_object('ok', false, 'error', 'ya_no_vigente');
    END IF;

    IF NOT p_aceptar THEN
      UPDATE mm_invites SET status = 'rechazada', updated_at = now() WHERE id = p_id;
      RETURN jsonb_build_object('ok', true, 'status', 'rechazada');
    END IF;

    UPDATE mm_invites SET status = 'aceptada', updated_at = now() WHERE id = p_id;
    -- una sola fuente de verdad: el ticket nace por mm_encolar (migración 23)
    res := mm_encolar(v_me, inv.game, inv.mode, inv.region, NULL);
    RETURN jsonb_build_object('ok', true, 'status', 'aceptada',
                              'game', inv.game, 'mode', inv.mode, 'region', inv.region,
                              'cola', res);
  ELSIF inv.from_sub = v_me THEN
    IF p_aceptar THEN
      RETURN jsonb_build_object('ok', false, 'error', 'solo_el_destino_acepta');
    END IF;
    IF inv.status <> 'pendiente' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'ya_no_pendiente');
    END IF;
    UPDATE mm_invites SET status = 'cancelada', updated_at = now() WHERE id = p_id;
    RETURN jsonb_build_object('ok', true, 'status', 'cancelada');
  ELSE
    RETURN jsonb_build_object('ok', false, 'error', 'no_te_concierna');
  END IF;
END;
$$;

-- ---------- inventario (log del workflow) ----------
SELECT p.proname
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname IN ('mm_invitar','mm_invites_pendientes','mm_responder_invite')
ORDER BY p.proname;
