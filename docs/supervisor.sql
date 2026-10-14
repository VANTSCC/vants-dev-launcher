-- ============================================================================
-- VANTS SUPERVISOR BOT v1.0 — tabla de eventos de la web
-- Ejecutar en el SQL Editor de Neon (proyecto square-surf-41242074,
-- rama br-sweet-shape-b42xhogj, base neondb). Ver docs/SUPERVISOR.md.
-- Idempotente: se puede ejecutar varias veces sin efecto duplicado.
-- ============================================================================

CREATE TABLE IF NOT EXISTS web_events (
  id               bigserial PRIMARY KEY,
  event_id         text UNIQUE NOT NULL,              -- id del evento (lo genera el SDK)
  kind             text NOT NULL,                     -- LOGIN_OK | LOGIN_FAILED | JS_ERROR | NETWORK_ERROR | PAGE_VIEW
  severity         text NOT NULL CHECK (severity IN ('info','warn','error','critical')),
  page             text NOT NULL,                     -- arena | panel
  session_id       text,                              -- agrupa eventos de una misma visita
  url              text,
  referrer         text,
  ip               text,
  user_agent       text,
  payload          jsonb NOT NULL DEFAULT '{}'::jsonb,-- campos propios del tipo de evento
  processed        boolean NOT NULL DEFAULT false,    -- false = pendiente de enviar por DM
  delivery_status  text,                              -- dm_enviado | sin_dm | reintentar | failed | skipped
  discord_attempts integer NOT NULL DEFAULT 0,
  error            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  processed_at     timestamptz
);

-- Cola del bot: solo los pendientes (índice parcial)
CREATE INDEX IF NOT EXISTS web_events_pendientes_idx
  ON web_events (created_at) WHERE processed = false;

-- Análisis posterior (join con los event_id del footer de cada embed)
CREATE INDEX IF NOT EXISTS web_events_kind_idx
  ON web_events (kind, created_at DESC);

-- Interruptor del supervisor en el panel admin (bot_settings; apagar = no enviar DMs)
INSERT INTO bot_settings (key, enabled)
VALUES ('supervisor', true)
ON CONFLICT (key) DO NOTHING;
