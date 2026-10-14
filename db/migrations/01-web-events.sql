-- ============================================================================
-- 01 · web_events — eventos del Supervisor Bot (SDK de la web → collector)
-- Idempotente: seguro de ejecutar las veces que sea necesario.
-- Fuente: docs/supervisor.sql
-- ============================================================================

CREATE TABLE IF NOT EXISTS web_events (
  id               bigserial PRIMARY KEY,
  event_id         text UNIQUE NOT NULL,
  kind             text NOT NULL,
  severity         text NOT NULL CHECK (severity IN ('info','warn','error','critical')),
  page             text NOT NULL,
  session_id       text,
  url              text,
  referrer         text,
  ip               text,
  user_agent       text,
  payload          jsonb NOT NULL DEFAULT '{}'::jsonb,
  processed        boolean NOT NULL DEFAULT false,
  delivery_status  text,
  discord_attempts integer NOT NULL DEFAULT 0,
  error            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  processed_at     timestamptz
);

CREATE INDEX IF NOT EXISTS web_events_pendientes_idx
  ON web_events (created_at) WHERE processed = false;

CREATE INDEX IF NOT EXISTS web_events_kind_idx
  ON web_events (kind, created_at DESC);

INSERT INTO bot_settings (key, enabled)
VALUES ('supervisor', true)
ON CONFLICT (key) DO NOTHING;
