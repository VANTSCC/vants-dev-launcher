-- ============================================================
-- 25-agente.sql · AGENTE VANTS (control total de la plataforma)
-- ------------------------------------------------------------
-- Memoria persistente del agente (services/agent-service):
--   agent_runs      · cada ciclo de vigilancia (CI cron, API o CLI)
--   agent_events    · incidentes y hallazgos (dedupe_key evita repetir)
--   agent_comandos  · ordenes del dueno (Discord -> agente -> respuesta DM)
-- El bot de Discord lee estas tablas (commands/agente.py + agent_bridge.py)
-- y avisa por DM; si Discord no esta disponible, la memoria queda igual en
-- Neon y se consulta por API/CLI/resumen del workflow.
-- Idempotente: seguro de re-ejecutar (IF NOT EXISTS / DO $$ blocks).
-- ============================================================

-- 1) Runs del agente -----------------------------------------------
CREATE TABLE IF NOT EXISTS agent_runs (
  id            serial PRIMARY KEY,
  fuente        text NOT NULL DEFAULT 'ci',           -- ci | api | cli | discord
  modo          text NOT NULL DEFAULT 'ciclo',        -- ciclo | informe | comando
  comando       text,                                 -- texto libre si modo=comando
  estado_global text NOT NULL DEFAULT 'DESCONOCIDO',  -- UP | DEGRADED | DOWN | DESCONOCIDO
  hallazgos     jsonb NOT NULL DEFAULT '[]'::jsonb,   -- resultados de cada chequeo
  acciones      jsonb NOT NULL DEFAULT '[]'::jsonb,   -- acciones ejecutadas o propuestas
  resumen       text,
  error         text,
  started_at    timestamptz NOT NULL DEFAULT now(),
  finished_at   timestamptz
);
CREATE INDEX IF NOT EXISTS idx_agent_runs_started ON agent_runs (started_at DESC);

-- 2) Incidentes / hallazgos del agente ------------------------------
CREATE TABLE IF NOT EXISTS agent_events (
  id              serial PRIMARY KEY,
  dedupe_key      text NOT NULL UNIQUE,               -- evita duplicar el mismo hallazgo
  kind            text NOT NULL,                      -- web_down, workflow_fallo, release_inconsistente, ...
  severity        text NOT NULL DEFAULT 'info'        -- info | warn | error | critical
                  CHECK (severity IN ('info','warn','error','critical')),
  titulo          text NOT NULL,
  detalle         jsonb NOT NULL DEFAULT '{}'::jsonb,
  accion_sugerida text,
  estado          text NOT NULL DEFAULT 'abierto'     -- abierto | gestionando | resuelto | archivado
                  CHECK (estado IN ('abierto','gestionando','resuelto','archivado')),
  resolucion      text,
  notificado      boolean NOT NULL DEFAULT false,     -- el bot ya envio el DM
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  resolved_at     timestamptz
);
CREATE INDEX IF NOT EXISTS idx_agent_events_estado ON agent_events (estado, severity);
CREATE INDEX IF NOT EXISTS idx_agent_events_pend ON agent_events (notificado) WHERE notificado = false;

-- Reabrir un incidente conocido en vez de chocar con el UNIQUE:
-- si el dedupe_key existe pero estaba resuelto/archivado -> vuelve a 'abierto'.
DO $$ BEGIN
  CREATE OR REPLACE FUNCTION agent_reabrir_evento(p_dedupe text, p_titulo text, p_kind text,
      p_severity text, p_detalle jsonb, p_accion text)
  RETURNS integer LANGUAGE plpgsql AS $fn$
  DECLARE v_id integer;
  BEGIN
    INSERT INTO agent_events (dedupe_key, kind, severity, titulo, detalle, accion_sugerida)
    VALUES (p_dedupe, p_kind, p_severity, p_titulo, p_detalle, p_accion)
    ON CONFLICT (dedupe_key) DO UPDATE
      SET estado = 'abierto',
          notificado = CASE WHEN agent_events.estado IN ('resuelto','archivado')
                            THEN false ELSE agent_events.notificado END,
          titulo = EXCLUDED.titulo,
          severity = EXCLUDED.severity,
          detalle = EXCLUDED.detalle,
          accion_sugerida = EXCLUDED.accion_sugerida,
          resolucion = NULL,
          resolved_at = NULL,
          updated_at = now()
      WHERE agent_events.estado IN ('resuelto','archivado');
    SELECT id INTO v_id FROM agent_events WHERE dedupe_key = p_dedupe;
    RETURN v_id;
  END $fn$;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3) Comandos del dueno hacia el agente ------------------------------
-- Ruta sin servidor siempre disponible: Discord (/agente comando) -> tabla ->
-- el proximo ciclo del agente la procesa -> respuesta -> el bot la envia por DM.
CREATE TABLE IF NOT EXISTS agent_comandos (
  id          serial PRIMARY KEY,
  texto       text NOT NULL,
  creado_por  text,                                   -- discord user id o 'api'
  estado      text NOT NULL DEFAULT 'pendiente'       -- pendiente | hecho | error
              CHECK (estado IN ('pendiente','hecho','error')),
  respuesta   text,
  entregado   boolean NOT NULL DEFAULT false,         -- el bot ya envio la respuesta por DM
  created_at  timestamptz NOT NULL DEFAULT now(),
  respondido_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_agent_comandos_pend ON agent_comandos (estado) WHERE estado = 'pendiente';
CREATE INDEX IF NOT EXISTS idx_agent_comandos_resp ON agent_comandos (entregado) WHERE entregado = false;

-- 4) Vista resumen (para /agente estado y paneles) --------------------
CREATE OR REPLACE VIEW agent_resumen AS
SELECT
  (SELECT count(*) FROM agent_events WHERE estado = 'abierto')                       AS incidentes_abiertos,
  (SELECT count(*) FROM agent_events WHERE estado = 'abierto' AND severity IN ('error','critical')) AS incidentes_graves,
  (SELECT count(*) FROM agent_comandos WHERE estado = 'pendiente')                    AS comandos_pendientes,
  (SELECT count(*) FROM web_events WHERE processed = false)                           AS web_events_pendientes,
  (SELECT estado_global FROM agent_runs ORDER BY id DESC LIMIT 1)                     AS ultimo_estado,
  (SELECT started_at  FROM agent_runs ORDER BY id DESC LIMIT 1)                       AS ultimo_run_en,
  (SELECT resumen     FROM agent_runs ORDER BY id DESC LIMIT 1)                       AS ultimo_resumen;

-- 5) Semilla de ajustes del agente (el panel admin puede apagarlo) ----
INSERT INTO bot_settings (key, enabled) VALUES ('agente', true)
ON CONFLICT (key) DO NOTHING;
