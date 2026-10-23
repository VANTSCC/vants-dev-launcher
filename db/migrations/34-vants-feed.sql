-- ============================================================
-- 34 · VANTS-BUS: feed de eventos para la web
--
-- El Worker "vants-consumer-playvants" (cron cada minuto) consume
-- el bus con la identidad playvants-web y deja aquí los eventos ya
-- ordenados y listos para renderizar: últimos resultados, torneos
-- abiertos, clips, sesiones de juego, alertas... La web los lee con
-- su conexión Neon existente, sin acoplarse al bus.
--
-- Idempotente. El worker aplica retención (borra feed con más de
-- FEED_RETENTION_DAYS días, 7 por defecto).
-- ============================================================

CREATE TABLE IF NOT EXISTS vants_feed (
  id          TEXT PRIMARY KEY,              -- mismo id del evento del bus
  type        TEXT        NOT NULL,
  source      TEXT        NOT NULL,
  ts          TIMESTAMPTZ NOT NULL,
  data        JSONB       NOT NULL DEFAULT '{}',
  consumed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vants_feed_ts   ON vants_feed (ts DESC);
CREATE INDEX IF NOT EXISTS idx_vants_feed_type ON vants_feed (type);

-- Privilegios mínimos para el rol del worker (authenticator)
GRANT USAGE ON SCHEMA public TO authenticator;
GRANT SELECT, INSERT, DELETE ON vants_feed TO authenticator;
