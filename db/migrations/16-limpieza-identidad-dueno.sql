-- ============================================================
-- 16-limpieza-identidad-dueno.sql — Task 31 ("el otro perfil")
--
-- Diagnóstico: la base ya tiene UNA sola fila del dueño (sub
-- google-oauth2|103921…), pero quedaron dos restos de la era de
-- perfiles duplicados:
--   1) El trigger players_owner_promote (migración 05) todavía
--      promovía a owner por username = 'geimerpedroza' (nombre de
--      una fila borrada). Cualquier UPDATE futuro de username/email
--      podía volver a enganchar identidad fantasma.
--   2) El nombre visible de la fila real quedó FEISPLA mientras el
--      dueño usa FEIS (lo que él mismo puso en Ajustes de cuenta).
--      Se alinea display_name con lo que él escribió; el @handle
--      estable (username) no se toca.
-- Idempotente: CREATE OR REPLACE + UPDATE con WHERE.
-- ============================================================

-- 1) Trigger de owner SOLO por identidad real (email de la cuenta
--    verificada). Se elimina la mención a 'geimerpedroza'.
CREATE OR REPLACE FUNCTION players_owner_promote()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF lower(coalesce(NEW.email,'')) IN ('geimerjhoan099@gmail.com','admin@vants.games') THEN
    NEW.role := 'owner';
    NEW.verified := true;
  END IF;
  RETURN NEW;
END;
$$;

-- 2) Nombre visible de la fila real = el que el dueño puso en Ajustes.
UPDATE players
SET display_name = 'FEIS'
WHERE lower(coalesce(email,'')) = 'geimerjhoan099@gmail.com'
  AND coalesce(display_name,'') <> 'FEIS';
