-- ============================================================
-- VANTS — Migración de CONECTORES DE CUENTAS (redes sociales)
-- ------------------------------------------------------------
-- Ejecutar en el SQL Editor de Neon (database: neondb), una sola vez.
-- Crea: vants_links (un vínculo por jugador y plataforma) y
--        vants_link_states (estados OAuth de un solo uso, interno del linker).
-- La identidad del jugador es el "sub" del JWT de Auth0.
-- Reversible: DROP TABLE vants_link_states; DROP TABLE vants_links;
--             DROP FUNCTION current_auth0_sub();
-- ============================================================

-- 0) sub de Auth0 del JWT actual (el Data API inyecta el JWT en request.jwt.claims)
CREATE OR REPLACE FUNCTION current_auth0_sub() RETURNS text
LANGUAGE plpgsql STABLE AS $$
DECLARE c text;
BEGIN
  c := current_setting('request.jwt.claims', true);
  IF c IS NOT NULL AND c <> '' THEN
    BEGIN
      RETURN nullif(jsonb_extract_path_text(c::jsonb, 'sub'), '');
    EXCEPTION WHEN OTHERS THEN
      RETURN nullif(current_setting('request.jwt.claim.sub', true), '');
    END;
  END IF;
  RETURN nullif(current_setting('request.jwt.claim.sub', true), '');
END $$;

-- 1) Vínculos jugador <-> red social / cuenta de juego
CREATE TABLE IF NOT EXISTS vants_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth0_sub text NOT NULL,
  player_id uuid REFERENCES players(id) ON DELETE SET NULL,
  platform text NOT NULL CHECK (platform IN
    ('discord','twitch','kick','youtube','tiktok','x','riot','steam','faceit')),
  handle text NOT NULL,
  platform_user_id text,
  avatar_url text,
  verified boolean NOT NULL DEFAULT false,
  connected_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (auth0_sub, platform)
);
CREATE INDEX IF NOT EXISTS vants_links_player_idx ON vants_links(player_id);
CREATE INDEX IF NOT EXISTS vants_links_platform_idx ON vants_links(platform);

ALTER TABLE vants_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS vants_links_lectura ON vants_links;
CREATE POLICY vants_links_lectura ON vants_links FOR SELECT USING (true);
DROP POLICY IF EXISTS vants_links_alta_propia ON vants_links;
CREATE POLICY vants_links_alta_propia ON vants_links FOR INSERT
  WITH CHECK (auth0_sub = current_auth0_sub());
DROP POLICY IF EXISTS vants_links_edicion_propia ON vants_links;
CREATE POLICY vants_links_edicion_propia ON vants_links FOR UPDATE
  USING (auth0_sub = current_auth0_sub())
  WITH CHECK (auth0_sub = current_auth0_sub());
DROP POLICY IF EXISTS vants_links_baja_propia ON vants_links;
CREATE POLICY vants_links_baja_propia ON vants_links FOR DELETE
  USING (auth0_sub = current_auth0_sub());

-- Permisos del Data API: lectura para todos, escritura solo con sesión
DO $$ DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon','authenticated','authenticator'] LOOP
    BEGIN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON vants_links TO %I', r);
    EXCEPTION WHEN undefined_object THEN NULL;
    END;
  END LOOP;
  BEGIN GRANT SELECT ON vants_links TO public; EXCEPTION WHEN undefined_object THEN NULL; END;
END $$;

-- Red de seguridad (igual que db/migrations/04-vants-links.sql): el grant
-- amplio elimina el "permission denied" aunque el rol del Data API cambie;
-- RLS (policies por sub de Auth0) sigue siendo la puerta real.
GRANT SELECT, INSERT, UPDATE, DELETE ON vants_links TO PUBLIC;

-- 2) Estados OAuth de un solo uso (los escribe/lee solo la función "linker"
--    con su conexión directa; sin políticas a propósito: el Data API no la toca)
CREATE TABLE IF NOT EXISTS vants_link_states (
  state text PRIMARY KEY,
  auth0_sub text NOT NULL,
  platform text NOT NULL,
  return_to text NOT NULL,
  code_verifier text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE vants_link_states ENABLE ROW LEVEL SECURITY;
