-- ============================================================
-- 09-faceit-webhook-events.sql
-- Tabla receptora del worker de FACEIT (repo feispla/vants-faceit-webhook).
-- ------------------------------------------------------------
-- El worker hace:
--   INSERT INTO faceit_webhook_events (event_type, payload)
--   VALUES ($1, $2::jsonb)
-- con su conexión directa (env.DATABASE_URL) tras validar el header
-- X-VANTS-FACEIT-SECRET. Si esta tabla no existe, cada evento real
-- de FACEIT termina en 500 y se pierde — por eso queda creada acá,
-- en el pipeline, y no a mano.
--
-- Sin acceso público: los eventos crudos son privados (el worker usa
-- la conexión dueña). El procesador de XP (faceit_registrar_partida,
-- migración 08) leerá las filas pendientes.
-- ============================================================

CREATE TABLE IF NOT EXISTS faceit_webhook_events (
  id         bigserial PRIMARY KEY,
  event_type text,
  payload    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed  boolean NOT NULL DEFAULT false
);

-- Red de seguridad si la tabla ya existía con otra forma (creada a mano):
ALTER TABLE faceit_webhook_events ADD COLUMN IF NOT EXISTS processed boolean NOT NULL DEFAULT false;
ALTER TABLE faceit_webhook_events ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

-- Índice de pendientes (solo si la columna existe de verdad)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'faceit_webhook_events' AND column_name = 'processed'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS faceit_webhook_pend_idx ON faceit_webhook_events (created_at) WHERE processed = false';
  END IF;
END $$;

-- Inventario final (log del workflow)
SELECT relname AS tabla, n_live_tup AS filas_aprox
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY relname;
