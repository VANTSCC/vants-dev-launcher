-- ============================================================================
-- 05 · Pagos — compras y entitlements reales (Stripe)
-- ----------------------------------------------------------------------------
-- Ejecutar en el SQL Editor de Neon (database: neondb). Idempotente.
-- Crea: purchases (una fila por pago confirmado) y entitlements (lo que el
--        jugador tiene activo: plan PRO/CREATOR, pase premium, fee de torneo).
--        audit_logs por si todavía no existe (el webhook escribe en ella).
-- La función stripe-webhook escribe con su DATABASE_URL (rol dueño: ignora RLS);
-- la web lee SOLO sus entitlements con el JWT de Auth0 vía Data API.
-- Reversible: DROP TABLE purchases; DROP TABLE entitlements; DROP TABLE audit_logs;
-- ============================================================================

-- 0) sub de Auth0 del JWT actual (misma función que usa la migración 04)
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

-- 1) purchases — historial de pagos confirmados por Stripe (solo el webhook escribe)
CREATE TABLE IF NOT EXISTS purchases (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id        uuid REFERENCES players(id) ON DELETE SET NULL,
  auth0_sub        text,
  product          text NOT NULL,
  tier             text,
  amount_cents     integer NOT NULL DEFAULT 0,
  currency         text NOT NULL DEFAULT 'EUR',
  payment_provider text NOT NULL DEFAULT 'stripe',
  payment_status   text NOT NULL DEFAULT 'paid',
  external_id      text UNIQUE,
  period           text CHECK (period IN ('mo','yr','one_time') OR period IS NULL),
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS purchases_player_idx ON purchases(player_id, created_at DESC);
-- Compatibilidad con una purchases ya existente: columnas nuevas sin romper nada
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS auth0_sub text;
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS period text;

ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;
-- Sin políticas: la web no lee compras ajenas; el webhook entra por conexión directa.

-- 2) entitlements — lo que el jugador tiene activo (la web lee solo lo suyo)
CREATE TABLE IF NOT EXISTS entitlements (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id        uuid REFERENCES players(id) ON DELETE CASCADE,
  auth0_sub        text,
  entitlement_type text NOT NULL DEFAULT 'plan',
  tier             text NOT NULL,
  source           text NOT NULL DEFAULT 'purchase',
  is_active        boolean NOT NULL DEFAULT true,
  expires_at       timestamptz,
  external_id      text,
  period           text CHECK (period IN ('mo','yr','one_time') OR period IS NULL),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (player_id, entitlement_type, tier)
);
CREATE INDEX IF NOT EXISTS entitlements_player_idx ON entitlements(player_id, is_active);
-- Compatibilidad con una entitlements ya existente:
ALTER TABLE entitlements ADD COLUMN IF NOT EXISTS auth0_sub text;
ALTER TABLE entitlements ADD COLUMN IF NOT EXISTS external_id text;
ALTER TABLE entitlements ADD COLUMN IF NOT EXISTS period text;
ALTER TABLE entitlements ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- El índice único que usa el webhook para el upsert (tolera si ya existe)
DO $$ BEGIN
  CREATE UNIQUE INDEX entitlements_player_type_tier_uidx
    ON entitlements (player_id, entitlement_type, tier);
EXCEPTION WHEN duplicate_table THEN NULL; WHEN others THEN NULL; END $$;

ALTER TABLE entitlements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS entitlements_lectura_propia ON entitlements;
CREATE POLICY entitlements_lectura_propia ON entitlements FOR SELECT
  USING (auth0_sub = current_auth0_sub());

DO $$ DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon','authenticated','authenticator'] LOOP
    BEGIN
      EXECUTE format('GRANT SELECT ON entitlements TO %I', r);
    EXCEPTION WHEN undefined_object THEN NULL;
    END;
  END LOOP;
END $$;

-- 3) audit_logs — registro del sistema (el webhook escribe; la web no la toca)
CREATE TABLE IF NOT EXISTS audit_logs (
  id         bigserial PRIMARY KEY,
  actor_type text NOT NULL DEFAULT 'system',
  actor_id   text,
  action     text NOT NULL,
  metadata   jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;