-- ============================================================
-- 05-current-player.sql
-- Arregla el error de creación/visualización del perfil:
-- la web llama a la función SQL current_player_id() (en
-- /rpc/current_player_id) pero nunca estaba definida, y el
-- POST a /players no viajaba con ninguna identidad de Auth0,
-- por lo que Neon no podía asociar el perfil a la sesión.
--
-- Este script (idempotente, correrlo en Neon → SQL Editor):
--   1. Agrega columnas de identidad a players (auth0_sub, email).
--   2. Define current_player_id() resolviendo por auth0_sub,
--      por vínculo en vants_links o por email del JWT.
--   3. Define current_auth0_sub() si falta (por si 01 no corrió).
--   4. Trigger que rellena auth0_sub/email automáticamente.
--   5. Trigger que asciende a OWNER al dueño del sitio.
--   6. RLS de players: cualquiera lee, cada uno edita lo suyo.
--   7. Grants de ejecución para el rol authenticated.
-- ============================================================

-- ---------- 0) current_auth0_sub() (por si falta) ----------
CREATE OR REPLACE FUNCTION current_auth0_sub()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NULLIF(
    current_setting('request.jwt.claims', true)::jsonb ->> 'sub',
    ''
  );
$$;

-- ---------- 1) Columnas de identidad en players ----------
ALTER TABLE players
  ADD COLUMN IF NOT EXISTS auth0_sub text,
  ADD COLUMN IF NOT EXISTS email text;

CREATE UNIQUE INDEX IF NOT EXISTS players_auth0_sub_uidx
  ON players (auth0_sub) WHERE auth0_sub IS NOT NULL;
CREATE INDEX IF NOT EXISTS players_email_idx
  ON players (lower(email)) WHERE email IS NOT NULL;

-- ---------- 2) current_player_id(): LA FUNCIÓN QUE FALTABA ----------
-- Prioridad: (a) vínculo directo auth0_sub → (b) vants_links más
-- reciente → (c) email del JWT → (d) NULL (crear perfil).
CREATE OR REPLACE FUNCTION current_player_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT p.id FROM players p
      WHERE p.auth0_sub = current_auth0_sub()
      LIMIT 1),
    (SELECT l.player_id FROM vants_links l
      WHERE l.auth0_sub = current_auth0_sub()
        AND l.player_id IS NOT NULL
      ORDER BY l.connected_at DESC NULLS LAST
      LIMIT 1),
    (SELECT p.id FROM players p
      WHERE p.email IS NOT NULL
        AND lower(p.email) = lower(coalesce(
              current_setting('request.jwt.claims', true)::jsonb ->> 'email',
              ''))
      LIMIT 1),
    NULL::uuid
  );
$$;

-- ---------- 3) Trigger: autorrellenar identidad ----------
CREATE OR REPLACE FUNCTION players_bind_auth0()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub   text := current_setting('request.jwt.claims', true)::jsonb ->> 'sub';
  v_email text := current_setting('request.jwt.claims', true)::jsonb ->> 'email';
BEGIN
  IF NEW.auth0_sub IS NULL AND v_sub IS NOT NULL THEN
    -- si otro perfil ya usa este sub, la fila existente gana:
    -- este insert queda anónimo en lugar de robar la identidad.
    IF NOT EXISTS (SELECT 1 FROM players WHERE auth0_sub = v_sub AND id <> NEW.id) THEN
      NEW.auth0_sub := v_sub;
    END IF;
  END IF;
  IF NEW.email IS NULL AND v_email IS NOT NULL THEN
    NEW.email := v_email;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_players_bind_auth0 ON players;
CREATE TRIGGER trg_players_bind_auth0
  BEFORE INSERT OR UPDATE OF auth0_sub, email ON players
  FOR EACH ROW EXECUTE FUNCTION players_bind_auth0();

-- ---------- 4) Trigger: el dueño del sitio siempre es OWNER ----------
CREATE OR REPLACE FUNCTION players_owner_promote()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF lower(coalesce(NEW.email,'')) IN ('geimerjhoan099@gmail.com','admin@vants.games')
     OR lower(coalesce(NEW.username,'')) = 'geimerpedroza' THEN
    NEW.role := 'owner';
    NEW.verified := true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_players_owner_promote ON players;
CREATE TRIGGER trg_players_owner_promote
  BEFORE INSERT OR UPDATE OF email, username ON players
  FOR EACH ROW EXECUTE FUNCTION players_owner_promote();

-- ---------- 5) RLS de players ----------
ALTER TABLE players ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='players' AND policyname='players_lectura_publica') THEN
    CREATE POLICY players_lectura_publica ON players
      FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='players' AND policyname='players_crear_propio') THEN
    CREATE POLICY players_crear_propio ON players
      FOR INSERT WITH CHECK (
        current_auth0_sub() IS NOT NULL
        AND (auth0_sub = current_auth0_sub() OR auth0_sub IS NULL)
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='players' AND policyname='players_editar_propio') THEN
    CREATE POLICY players_editar_propio ON players
      FOR UPDATE USING (
        auth0_sub = current_auth0_sub()
        OR role = 'owner'
        OR lower(coalesce(email,'')) IN ('geimerjhoan099@gmail.com','admin@vants.games')
      );
  END IF;
END $$;

-- ---------- 6) Grants ----------
-- Neon no tiene necesariamente los roles anon/authenticated (son de Supabase):
-- se concede por rol con captura de undefined_object, como en 04-vants-links.sql.
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon','authenticated','authenticator'] LOOP
    BEGIN
      EXECUTE format('GRANT EXECUTE ON FUNCTION current_player_id() TO %I', r);
      EXECUTE format('GRANT EXECUTE ON FUNCTION current_auth0_sub() TO %I', r);
      EXECUTE format('GRANT SELECT, INSERT, UPDATE ON TABLE players TO %I', r);
    EXCEPTION WHEN undefined_object THEN NULL;
    END;
  END LOOP;
  GRANT EXECUTE ON FUNCTION current_player_id() TO PUBLIC;
  GRANT EXECUTE ON FUNCTION current_auth0_sub() TO PUBLIC;
  GRANT SELECT ON TABLE players TO PUBLIC;
END $$;

-- Red de seguridad (patrón 04-vants-links): RLS de players es la puerta real;
-- el grant amplio evita "permission denied" aunque el rol del Data API varíe.
GRANT SELECT, INSERT, UPDATE ON TABLE players TO PUBLIC;

-- Fin: con esto /rpc/current_player_id responde, crear perfil
-- queda ligado a la sesión de Auth0 y el perfil correcto se
-- muestra siempre. docs/migracion-pase.sql puede usar la función.
