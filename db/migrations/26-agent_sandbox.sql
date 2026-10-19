-- ============================================================
-- MIGRACIÓN 26 · SANDBOX AGENT — almacenes de memoria autoalojados
-- El Agente VANTS gana:
--   1. agent_memoria         → memoria SEMÁNTICA (hechos, aprendizajes,
--                              preferencias del dueño; clave única, upsert)
--   2. agent_archivos        → el DISCO de la sandbox (ficheros/informes/
--                              artefactos que el agente escribe y releee)
--   3. agent_sandbox_execs   → auditoría de cada ejecución de la sandbox
--                              (comando, exit, salida, duración)
-- Lo que ya existía y se conserva (migración 25):
--   agent_runs (memoria EPISÓDICA) · agent_events (incidentes) ·
--   agent_comandos (órdenes Discord→Neon) · agent_resumen (vista)
-- Todo en el mismo Postgres Neon (autoalojado, tier gratuito): NADA
-- de Railway/Render ni servicios de pago.
-- ============================================================

-- 1) Memoria semántica ---------------------------------------
CREATE TABLE IF NOT EXISTS agent_memoria (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  clave        TEXT        NOT NULL,
  valor        TEXT        NOT NULL,
  tipo         TEXT        NOT NULL DEFAULT 'hecho',  -- hecho|aprendizaje|preferencia|nota
  importancia  INT         NOT NULL DEFAULT 3,        -- 1..5 (5 = no olvidar)
  expira_en    TIMESTAMPTZ,                           -- NULL = para siempre
  creado_por   TEXT        NOT NULL DEFAULT 'agente', -- agente|dueno|ciclo
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS agent_memoria_clave_idx ON agent_memoria (clave);
CREATE INDEX IF NOT EXISTS agent_memoria_importancia_idx ON agent_memoria (importancia DESC, updated_at DESC);

-- 2) Disco de la sandbox (ficheros de texto del agente) ------
CREATE TABLE IF NOT EXISTS agent_archivos (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ruta         TEXT        NOT NULL,                  -- p.ej. informes/2026-10-19.md
  contenido    TEXT        NOT NULL,
  bytes        INT         NOT NULL DEFAULT 0,
  sha256       TEXT,
  run_id       BIGINT,                                -- run (agent_runs) que lo creó
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS agent_archivos_ruta_idx ON agent_archivos (ruta);
CREATE INDEX IF NOT EXISTS agent_archivos_created_idx ON agent_archivos (created_at DESC);

-- 3) Auditoría de ejecuciones de la sandbox ------------------
CREATE TABLE IF NOT EXISTS agent_sandbox_execs (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  comando      TEXT        NOT NULL,
  exit_code    INT,
  stdout       TEXT,
  stderr       TEXT,
  duracion_ms  INT,
  run_id       BIGINT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agent_sandbox_execs_created_idx ON agent_sandbox_execs (created_at DESC);

-- Vista de resumen para /api/v1 y el informe del agente ------
CREATE OR REPLACE VIEW agent_memoria_resumen AS
SELECT
  (SELECT COUNT(*) FROM agent_memoria)        AS recuerdos,
  (SELECT COUNT(*) FROM agent_archivos)       AS archivos,
  (SELECT COALESCE(SUM(bytes), 0) FROM agent_archivos) AS bytes_totales,
  (SELECT COUNT(*) FROM agent_sandbox_execs)  AS ejecuciones;

-- Función: guardar/recuperar recuerdo con expiración respetada
CREATE OR REPLACE FUNCTION agent_recordar(
  p_clave TEXT, p_valor TEXT, p_tipo TEXT DEFAULT 'hecho',
  p_importancia INT DEFAULT 3, p_expira_en TIMESTAMPTZ DEFAULT NULL,
  p_creado_por TEXT DEFAULT 'agente'
) RETURNS BIGINT AS $fn$
INSERT INTO agent_memoria (clave, valor, tipo, importancia, expira_en, creado_por)
VALUES (p_clave, p_valor, p_tipo, GREATEST(1, LEAST(5, p_importancia)), p_expira_en, p_creado_por)
ON CONFLICT (clave) DO UPDATE
  SET valor = EXCLUDED.valor,
      tipo = EXCLUDED.tipo,
      importancia = EXCLUDED.importancia,
      expira_en = EXCLUDED.expira_en,
      updated_at = now()
RETURNING id
$fn$ LANGUAGE sql;

-- Limpieza opcional: borra ejecuciones de sandbox de más de 7 días
-- (llamar desde el ciclo; barato y evita crecimiento infinito)
CREATE OR REPLACE FUNCTION agent_podar_sandbox() RETURNS INT AS $fn$
DECLARE n INT;
BEGIN
  DELETE FROM agent_sandbox_execs WHERE created_at < now() - INTERVAL '7 days';
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END
$fn$ LANGUAGE plpgsql;
