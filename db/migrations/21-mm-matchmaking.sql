-- ============================================================
-- 21-mm-matchmaking.sql
-- Fase 4 · Competición real: matchmaking con persistencia.
-- ------------------------------------------------------------
-- El matchmaking-service (services/matchmaking-service) deja la cola
-- en memoria y la persiste acá, para que sobreviva reinicios y para
-- que el emparejamiento sea transaccional (FOR UPDATE SKIP LOCKED).
--
-- Tablas (prefijo mm_ para no chocar con nada existente):
--   mm_tickets        un jugador esperando partida (1 activo por jugador
--                     y juego: índice único parcial = prevención duplicados)
--   mm_matches        una partida propuesta por el emparejador
--   mm_match_players  participantes con lado (team 1|2) y RR antes/después
--
-- Estados:
--   ticket: queued → matched | cancelled | expired
--   match : propuesto → reportado → verificado | anulado
--           (verificado = siguiente incremento: contraste FACEIT + RR)
--
-- Tamaños de partida: mode 'duo' → 2 jugadores (1v1), 'team' → 10 (5v5).
-- El emparejador (mm_intentar_emparejar) es atómico: toma los primeros
-- N de la cola FIFO sin bloquear a otros emparejadores concurrentes
-- (SKIP LOCKED) y crea la partida solo si hay exactamente N.
-- ============================================================

-- ---------- 1) tickets de cola ----------
CREATE TABLE IF NOT EXISTS mm_tickets (
  ticket      text PRIMARY KEY,
  sub         text NOT NULL,                -- identidad Auth0 verificada
  game        text NOT NULL,
  mode        text NOT NULL DEFAULT 'duo',
  region      text NOT NULL DEFAULT 'EU',
  status      text NOT NULL DEFAULT 'queued'
              CHECK (status IN ('queued','matched','cancelled','expired')),
  match_id    uuid,
  enqueued_at timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Prevención de duplicados: un solo ticket activo por jugador y juego.
CREATE UNIQUE INDEX IF NOT EXISTS mm_tickets_uniq_activos
  ON mm_tickets (sub, game)
  WHERE status = 'queued';

-- Cola FIFO por juego/modo/región (solo activos).
CREATE INDEX IF NOT EXISTS mm_tickets_cola_idx
  ON mm_tickets (game, mode, region, enqueued_at)
  WHERE status = 'queued';

-- Limpieza rápida de vencidos.
CREATE INDEX IF NOT EXISTS mm_tickets_vencidos_idx
  ON mm_tickets (expires_at)
  WHERE status = 'queued';

-- ---------- 2) partidas propuestas ----------
CREATE TABLE IF NOT EXISTS mm_matches (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game           text NOT NULL,
  mode           text NOT NULL DEFAULT 'duo',
  region         text NOT NULL DEFAULT 'EU',
  status         text NOT NULL DEFAULT 'propuesto'
                 CHECK (status IN ('propuesto','reportado','verificado','anulado')),
  score_a        integer,
  score_b        integer,
  report_sub     text,                    -- quién reportó primero
  report_at      timestamptz,
  verify_source  text,                    -- faceit | manual | (futuro)
  verify_payload jsonb,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mm_matches_abiertos_idx
  ON mm_matches (status, created_at);

-- ---------- 3) participantes ----------
CREATE TABLE IF NOT EXISTS mm_match_players (
  match_id  uuid NOT NULL REFERENCES mm_matches(id) ON DELETE CASCADE,
  sub       text NOT NULL,
  team      smallint NOT NULL DEFAULT 1 CHECK (team IN (1,2)),
  rr_before integer,
  rr_after  integer,
  PRIMARY KEY (match_id, sub)
);

CREATE INDEX IF NOT EXISTS mm_match_players_sub_idx
  ON mm_match_players (sub);

-- ---------- 4) emparejador atómico ----------
-- Toma los primeros N tickets vivos (FIFO) del grupo, crea la partida
-- y marca los tickets 'matched'. Si hay menos de N, no hace nada
-- (devuelve NULL). Concurrente-seguro: SKIP LOCKED.
CREATE OR REPLACE FUNCTION mm_intentar_emparejar(
  p_game   text,
  p_mode   text,
  p_region text
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_n   int := CASE WHEN p_mode = 'team' THEN 10 ELSE 2 END;
  v_id  uuid;
BEGIN
  -- 0) vencidos fuera (una pasada barata por llamada)
  UPDATE mm_tickets
  SET status = 'expired', updated_at = now()
  WHERE status = 'queued' AND expires_at < now();

  -- 1) emparejar si la cola completa el grupo
  WITH candidatos AS (
    SELECT ticket, sub, enqueued_at
    FROM mm_tickets
    WHERE status  = 'queued'
      AND game    = p_game
      AND mode    = p_mode
      AND region  = p_region
      AND expires_at >= now()
    ORDER BY enqueued_at
    LIMIT v_n
    FOR UPDATE SKIP LOCKED
  ),
  nuevo AS (
    INSERT INTO mm_matches (game, mode, region)
    SELECT p_game, p_mode, p_region
    FROM candidatos
    HAVING count(*) = v_n
    RETURNING id
  ),
  marcados AS (
    UPDATE mm_tickets t
    SET status = 'matched', match_id = n.id, updated_at = now()
    FROM candidatos c
    CROSS JOIN nuevo n
    WHERE t.ticket = c.ticket
    RETURNING t.ticket
  ),
  jugadores AS (
    INSERT INTO mm_match_players (match_id, sub, team)
    SELECT n.id,
           c.sub,
           CASE
             WHEN row_number() OVER (ORDER BY c.enqueued_at, c.ticket)
                  <= (CASE WHEN p_mode = 'team' THEN 5 ELSE 1 END)
             THEN 1 ELSE 2
           END
    FROM candidatos c
    CROSS JOIN nuevo n
  )
  SELECT id INTO v_id FROM nuevo;

  RETURN v_id;
END;
$$;

-- ---------- 5) inventario (log del workflow) ----------
SELECT relname AS tabla, n_live_tup AS filas_aprox
FROM pg_stat_user_tables
WHERE schemaname = 'public' AND relname LIKE 'mm_%'
ORDER BY relname;
