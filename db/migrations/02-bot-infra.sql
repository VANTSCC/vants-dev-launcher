-- ============================================================================
-- 02 · Infraestructura del bot y la sincronización (defensiva)
-- Crea SOLO las tablas que falten; si ya existen no las toca (IF NOT EXISTS).
-- Columnas derivadas del uso real: bot/alerts.py, bot/supervisor.py,
-- neon-functions/discord-notify/index.ts y panel.html.
-- ============================================================================

-- Latido del bot (el panel admin lo usa para el estado)
CREATE TABLE IF NOT EXISTS bot_heartbeat (
  id         text PRIMARY KEY,
  last_seen  timestamptz NOT NULL DEFAULT now(),
  latency_ms integer,
  guilds     integer NOT NULL DEFAULT 0,
  version    text
);

-- Interruptores del bot (el panel admin los gestiona)
CREATE TABLE IF NOT EXISTS bot_settings (
  key     text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT true
);

-- Canal de Discord por categoría de alerta
CREATE TABLE IF NOT EXISTS discord_channels (
  category   text PRIMARY KEY,
  channel_id text NOT NULL
);

-- Cola de alertas del bot (UNIQUE evita duplicados)
CREATE TABLE IF NOT EXISTS bot_alerts (
  id         bigserial PRIMARY KEY,
  kind       text NOT NULL,
  ref_id     text NOT NULL,
  category   text,
  payload    jsonb NOT NULL DEFAULT '{}'::jsonb,
  status     text NOT NULL DEFAULT 'pending',
  attempts   integer NOT NULL DEFAULT 0,
  sent_at    timestamptz,
  channel_id text,
  message_id text,
  error      text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, ref_id)
);

-- Eventos de sincronización web → Discord (discord-notify)
CREATE TABLE IF NOT EXISTS vant_sync_events (
  id               text PRIMARY KEY,
  event_type       text NOT NULL,
  payload          jsonb NOT NULL DEFAULT '{}'::jsonb,
  processed        boolean NOT NULL DEFAULT false,
  processed_at     timestamptz,
  discord_attempts integer NOT NULL DEFAULT 0,
  discord_status   text,
  discord_error    text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vant_sync_events_pendientes_idx
  ON vant_sync_events (created_at) WHERE processed = false;
