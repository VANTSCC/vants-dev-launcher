-- ============================================================
-- 32-mm-invitar-nick.sql
-- Fase 6 · Invitaciones que sí encuentran gente.
-- ------------------------------------------------------------
-- Diagnóstico real (workflow neon-migrate, 2026-10-22): en
-- producción hay 1 solo perfil (feispla / gei***gmail.com) y 0
-- invitaciones. El usuario tipeó feispla@hotmail.com →
-- destino_no_encontrado. Causas estructurales de "no deja invitar":
--
--   1. El email del perfil lo llena el JWT de Auth0 (migra 05/20) y
--      NO es el email que la gente cree tener en VANTS → el lookup
--      por email no encuentra a nadie.
--   2. Con comunidad chica, nadie sabe el email de cuenta del otro;
--      sí sabe el NICK.
--   3. Si dos cuentas comparten email (principal + alt), LIMIT 1 sin
--      ORDER BY elegía una fila al azar — podía ser el propio
--      remitente → falso "destino_es_tu_email".
--
-- Fix (misma firma, misma tabla, resto del flujo intacto):
--   · El destino se busca por EMAIL **o NICK** (username /
--     display_name), case-insensitive y trim.
--   · Regla por input: con '@' → email; sin '@' → nick.
--   · El remitente SIEMPRE excluido del lookup; si el único match
--     era él → destino_es_tu_email (mensaje claro en el HUB).
--   · Si varios perfiles hacen match → el más reciente (creado_at
--     DESC), determinista.
-- ============================================================

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
  v_q        text;
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

  -- destino buscado: email (con @) o nick (sin @) — mínimo 2 caracteres
  v_q := lower(btrim(coalesce(p_to_email, '')));
  IF v_q = '' OR length(v_q) < 2 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'email_invalido');
  END IF;

  -- remitente con perfil VANTS
  SELECT id INTO v_from_id FROM players WHERE auth0_sub = v_from LIMIT 1;
  IF v_from_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_elegible');
  END IF;

  -- ---------- resolución del destino ----------
  IF position('@' in v_q) > 0 THEN
    -- email: excluyo al remitente; si varias cuentas comparten el
    -- email (principal + alt), gana el perfil más reciente.
    SELECT auth0_sub INTO v_to FROM players
    WHERE lower(btrim(email)) = v_q
      AND auth0_sub IS NOT NULL AND auth0_sub <> v_from
    ORDER BY created_at DESC
    LIMIT 1;
    IF v_to IS NULL AND EXISTS (
      SELECT 1 FROM players
      WHERE lower(btrim(email)) = v_q AND auth0_sub = v_from
    ) THEN
      -- el único con ese email soy yo
      RETURN jsonb_build_object('ok', false, 'error', 'destino_es_tu_email');
    END IF;
  ELSE
    -- nick: username o display_name, case-insensitive; excluyo al
    -- remitente; empate → perfil más reciente.
    SELECT auth0_sub INTO v_to FROM players
    WHERE (lower(btrim(username)) = v_q OR lower(btrim(display_name)) = v_q)
      AND auth0_sub IS NOT NULL AND auth0_sub <> v_from
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;

  IF v_to IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'destino_no_encontrado');
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

-- ---------- inventario (log del workflow) ----------
SELECT p.proname
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname IN ('mm_invitar','mm_invites_pendientes','mm_responder_invite')
ORDER BY p.proname;
