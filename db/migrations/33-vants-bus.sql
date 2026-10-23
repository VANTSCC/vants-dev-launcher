-- ============================================================
-- 33 · VANTS-BUS: tablas del bus de eventos central
--
-- El bus (Worker vants-bus en Cloudflare) guarda aquí los eventos
-- del contrato VANTS (match.finished, clip.published, alert.detected,
-- …) para que web, launcher y agentes consuman por cursor.
--
-- Idempotente. Los eventos son inmutables: solo INSERT/SELECT/DELETE
-- por retención (cron diario del Worker, 30 días por defecto).
--
-- El Worker se conecta con el rol "authenticator" (el mismo del
-- inicio de sesión Auth0 / NeonAuth), que NO es owner: se le otorgan
-- los privilegios mínimos solo sobre estas tablas del bus. Las tablas
-- de Auth0 y del resto del esquema quedan intactas.
-- ============================================================

-- Registro inmutable de eventos (ordenable por id tipo evt_<ulid>)
CREATE TABLE IF NOT EXISTS vants_events (
  id         TEXT PRIMARY KEY,
  type       TEXT        NOT NULL,
  source     TEXT        NOT NULL,
  ts         TIMESTAMPTZ NOT NULL DEFAULT now(),
  data       JSONB       NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vants_events_ts   ON vants_events (ts DESC);
CREATE INDEX IF NOT EXISTS idx_vants_events_type ON vants_events (type);
CREATE INDEX IF NOT EXISTS idx_vants_events_src  ON vants_events (source);

-- Cursor de consumo por proyecto (?save_cursor=1 en el bus)
CREATE TABLE IF NOT EXISTS vants_consumers (
  project_id TEXT PRIMARY KEY,
  cursor     TEXT        NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Deduplicación de webhooks FACEIT (la usa el puente del webhook v3;
-- se incluye aquí para crearla de una vez en la rama production)
CREATE TABLE IF NOT EXISTS vants_bus_dedup (
  event_id TEXT PRIMARY KEY,
  seen_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Privilegios mínimos para el rol del bus (authenticator) y los roles
-- de sesión de NeonAuth. Ningún otro objeto del esquema queda expuesto.
GRANT USAGE ON SCHEMA public TO authenticator;
GRANT SELECT, INSERT, UPDATE, DELETE ON vants_events   TO authenticator;
GRANT SELECT, INSERT, UPDATE, DELETE ON vants_consumers TO authenticator;
GRANT SELECT, INSERT, DELETE          ON vants_bus_dedup TO authenticator;
