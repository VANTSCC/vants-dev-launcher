-- ============================================================
-- 17-torneos-presencia.sql
-- TORNEOS REALES CON BRACKET EN MOVIMIENTO + PRESENCIA EN VIVO
-- ------------------------------------------------------------
-- A) tournament_teams  · inscripciones REALES persistidas en la base
--    (hasta hoy quedaban en localStorage / Discord). Estado:
--    pendiente → confirmado (lo confirma el OWNER vía Worker).
--    Cuando el torneo completa 8 equipos confirmados, el bracket
--    se SIEMBRA SOLO (bracket_sembrar vía trigger).
--
-- B) tournament_matches · llaves q/s/f + inferiores l1/l2/lf.
--    El trigger bracket_avanza mueve GANADORES a la siguiente ronda
--    y perdedores a llaves inferiores en cuanto se confirma un
--    resultado: el bracket "está siempre en movimiento".
--
-- C) presence · quién está EN LÍNEA / JUGANDO ahora mismo.
--    La web y la app de Windows laten cada 60 s con el JWT de la
--    sesión (RLS: cada jugador escribe SOLO su fila). Ventana de
--    visibilidad: 2 minutos (si deja de latir, desaparece).
--
-- Vistas públicas (lectura sin PII): v_en_vivo, v_torneo_equipos,
-- v_torneo_bracket. El Data API de Neon las expone igual que las
-- tablas; los grants replican el patrón de 04-vants-links.sql.
--
-- Idempotente y defensivo (el workflow lo re-ejecuta en cada push).
-- Reversible:
--   DROP VIEW IF EXISTS v_en_vivo, v_torneo_equipos, v_torneo_bracket;
--   DROP TABLE IF EXISTS presence, tournament_matches, tournament_teams CASCADE;
--   DROP FUNCTION IF EXISTS bracket_avanza, bracket_sembrar,
--          tt_quiza_sembrar, presence_touch, current_es_owner;
-- ============================================================

-- ---------- helper: ¿la sesión actual es del OWNER? ----------
CREATE OR REPLACE FUNCTION current_es_owner() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM players
    WHERE id = current_player_id() AND role = 'owner'
  );
$$;

-- ============================================================
-- A) EQUIPOS INSCRITOS
-- ============================================================
CREATE TABLE IF NOT EXISTS tournament_teams (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id text   NOT NULL,
  game          text   NOT NULL DEFAULT 'valorant',
  name          text   NOT NULL,
  tag           text   NOT NULL,
  captain       text,
  region        text,
  auth0_sub     text,
  player_id     uuid REFERENCES players(id) ON DELETE SET NULL,
  status        text   NOT NULL DEFAULT 'pendiente'
                CHECK (status IN ('pendiente','confirmado','rechazado')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tt_nombre_ok CHECK (char_length(btrim(name)) BETWEEN 2 AND 32),
  CONSTRAINT tt_tag_ok    CHECK (char_length(btrim(tag))  BETWEEN 2 AND 4)
);
-- Un equipo por nombre (insensible a mayúsculas) en cada torneo
CREATE UNIQUE INDEX IF NOT EXISTS tt_nombre_unico
  ON tournament_teams (tournament_id, lower(btrim(name)));
CREATE INDEX IF NOT EXISTS tt_torneo_estado_idx
  ON tournament_teams (tournament_id, status, created_at);
CREATE INDEX IF NOT EXISTS tt_sub_idx
  ON tournament_teams (auth0_sub);

ALTER TABLE tournament_teams ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tt_lectura ON tournament_teams;
CREATE POLICY tt_lectura ON tournament_teams FOR SELECT USING (true);
DROP POLICY IF EXISTS tt_alta_propia ON tournament_teams;
CREATE POLICY tt_alta_propia ON tournament_teams FOR INSERT
  WITH CHECK (auth0_sub = current_auth0_sub());
DROP POLICY IF EXISTS tt_dueño_lee_propias ON tournament_teams;
CREATE POLICY tt_dueño_lee_propias ON tournament_teams FOR SELECT
  USING (auth0_sub = current_auth0_sub() OR current_es_owner());
DROP POLICY IF EXISTS tt_gestion_owner ON tournament_teams;
CREATE POLICY tt_gestion_owner ON tournament_teams FOR UPDATE
  USING (current_es_owner()) WITH CHECK (current_es_owner());
DROP POLICY IF EXISTS tt_baja_propia ON tournament_teams;
CREATE POLICY tt_baja_propia ON tournament_teams FOR DELETE
  USING (auth0_sub = current_auth0_sub() OR current_es_owner());

-- ============================================================
-- B) LLAVES DEL TORNEO (q/s/f + inferiores l1/l2/lf)
-- ============================================================
-- Defensa: una tournament_matches LEGACY (creada por un sistema
-- anterior, SIN la columna ronda y VACÍA) bloquea este esquema.
-- Solo se elimina si es la versión vieja (sin 'ronda'); si ya
-- existe con el esquema nuevo, se respeta con todos sus datos.
DO $$
BEGIN
  IF to_regclass('public.tournament_matches') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_name = 'tournament_matches'
                       AND column_name = 'ronda') THEN
    DROP TABLE tournament_matches CASCADE;
    RAISE NOTICE 'tournament_matches legacy (sin columna ronda) eliminada';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS tournament_matches (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id text NOT NULL,
  game          text NOT NULL DEFAULT 'valorant',
  ronda         text NOT NULL CHECK (ronda IN ('q','s','f','l1','l2','lf')),
  slot          int  NOT NULL DEFAULT 0 CHECK (slot BETWEEN 0 AND 3),
  team_a        text,
  team_b        text,
  score_a       int,
  score_b       int,
  estado        text NOT NULL DEFAULT 'pendiente'
                CHECK (estado IN ('pendiente','en_curso','final')),
  ganador       text,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, ronda, slot)
);
CREATE INDEX IF NOT EXISTS tm_torneo_idx
  ON tournament_matches (tournament_id, ronda, slot);

ALTER TABLE tournament_matches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tm_lectura ON tournament_matches;
CREATE POLICY tm_lectura ON tournament_matches FOR SELECT USING (true);
DROP POLICY IF EXISTS tm_gestion_owner ON tournament_matches;
CREATE POLICY tm_gestion_owner ON tournament_matches FOR UPDATE
  USING (current_es_owner()) WITH CHECK (current_es_owner());
DROP POLICY IF EXISTS tm_alta_owner ON tournament_matches;
CREATE POLICY tm_alta_owner ON tournament_matches FOR INSERT
  WITH CHECK (current_es_owner());
DROP POLICY IF EXISTS tm_baja_owner ON tournament_matches;
CREATE POLICY tm_baja_owner ON tournament_matches FOR DELETE
  USING (current_es_owner());

-- ---- AUTO-AVANCE: el ganador sube, el perdedor cae a inferiores ----
CREATE OR REPLACE FUNCTION bracket_avanza() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_ganador text;
  v_perdedor text;
  v_slot int;
  v_side text;
BEGIN
  IF NEW.estado = 'final' AND NEW.ganador IS NOT NULL
     AND (OLD.estado IS DISTINCT FROM 'final' OR OLD.ganador IS DISTINCT FROM NEW.ganador) THEN

    v_ganador  := NEW.ganador;
    v_perdedor := CASE WHEN NEW.ganador = NEW.team_a THEN NEW.team_b ELSE NEW.team_a END;
    v_slot := NEW.slot / 2;                       -- 0,1→0 · 2,3→1
    v_side := CASE WHEN NEW.slot % 2 = 0 THEN 'a' ELSE 'b' END;

    IF NEW.ronda = 'q' THEN
      -- ganador → semis (q0/q1→s0 · q2/q3→s1); perdedor → inferiores R1
      UPDATE tournament_matches SET
          team_a = CASE WHEN 'a' = v_side THEN v_ganador ELSE team_a END,
          team_b = CASE WHEN 'b' = v_side THEN v_ganador ELSE team_b END,
          updated_at = now()
        WHERE tournament_id = NEW.tournament_id AND ronda = 's' AND slot = v_slot;
      UPDATE tournament_matches SET
          team_a = CASE WHEN 'a' = v_side THEN v_perdedor ELSE team_a END,
          team_b = CASE WHEN 'b' = v_side THEN v_perdedor ELSE team_b END,
          updated_at = now()
        WHERE tournament_id = NEW.tournament_id AND ronda = 'l1' AND slot = v_slot;

    ELSIF NEW.ronda = 's' THEN
      -- ganador → gran final (s0→a · s1→b); perdedor → inferiores R2
      UPDATE tournament_matches SET
          team_a = CASE WHEN NEW.slot = 0 THEN v_ganador ELSE team_a END,
          team_b = CASE WHEN NEW.slot = 1 THEN v_ganador ELSE team_b END,
          updated_at = now()
        WHERE tournament_id = NEW.tournament_id AND ronda = 'f' AND slot = 0;
      UPDATE tournament_matches SET
          team_a = v_perdedor, updated_at = now()
        WHERE tournament_id = NEW.tournament_id AND ronda = 'l2' AND slot = NEW.slot;

    ELSIF NEW.ronda = 'l1' THEN
      -- ganador → inferiores R2 (l1 i → l2 i lado b)
      UPDATE tournament_matches SET
          team_b = v_ganador, updated_at = now()
        WHERE tournament_id = NEW.tournament_id AND ronda = 'l2' AND slot = NEW.slot;

    ELSIF NEW.ronda = 'l2' THEN
      -- ganadores de R2 → final inferior (l2 0/1 → lbf a/b)
      UPDATE tournament_matches SET
          team_a = CASE WHEN NEW.slot = 0 THEN v_ganador ELSE team_a END,
          team_b = CASE WHEN NEW.slot = 1 THEN v_ganador ELSE team_b END,
          updated_at = now()
        WHERE tournament_id = NEW.tournament_id AND ronda = 'lf' AND slot = 0;

    ELSIF NEW.ronda = 'lf' THEN
      -- el ganador de inferiores entra a la GRAN FINAL solo si el cupo b
      -- sigue libre (el owner puede ajustar a mano si no)
      UPDATE tournament_matches SET
          team_b = v_ganador, updated_at = now()
        WHERE tournament_id = NEW.tournament_id AND ronda = 'f' AND slot = 0
          AND team_b IS NULL;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tm_avanza ON tournament_matches;
CREATE TRIGGER tm_avanza AFTER UPDATE ON tournament_matches
  FOR EACH ROW EXECUTE FUNCTION bracket_avanza();

-- ---- SIEMBRA AUTOMÁTICA del bracket con 8 equipos confirmados ----
CREATE OR REPLACE FUNCTION bracket_sembrar(p_tournament text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  v_equipos text[];
  i int;
  v_juego text;
BEGIN
  -- ya sembrado → no se toca (idempotente)
  IF EXISTS (SELECT 1 FROM tournament_matches WHERE tournament_id = p_tournament AND ronda = 'q') THEN
    RETURN;
  END IF;
  SELECT array_agg(name ORDER BY created_at) INTO v_equipos
    FROM (SELECT name, created_at FROM tournament_teams
           WHERE tournament_id = p_tournament AND status = 'confirmado'
           ORDER BY created_at LIMIT 8) t;
  IF v_equipos IS NULL OR array_length(v_equipos, 1) < 8 THEN
    RETURN; -- el bracket honesto: sin 8 confirmados no hay llaves
  END IF;
  SELECT min(game) INTO v_juego FROM tournament_teams WHERE tournament_id = p_tournament;
  FOR i IN 0..7 LOOP
    INSERT INTO tournament_matches (tournament_id, game, ronda, slot, team_a, team_b)
    VALUES (
      p_tournament, coalesce(v_juego,'valorant'), 'q', i / 2,
      CASE WHEN i % 2 = 0 THEN v_equipos[i + 1] END,
      CASE WHEN i % 2 = 1 THEN v_equipos[i + 1] END
    )
    ON CONFLICT (tournament_id, ronda, slot) DO NOTHING;
  END LOOP;
  INSERT INTO tournament_matches (tournament_id, game, ronda, slot) VALUES
    (p_tournament, coalesce(v_juego,'valorant'), 's', 0),
    (p_tournament, coalesce(v_juego,'valorant'), 's', 1),
    (p_tournament, coalesce(v_juego,'valorant'), 'f', 0),
    (p_tournament, coalesce(v_juego,'valorant'), 'l1', 0),
    (p_tournament, coalesce(v_juego,'valorant'), 'l1', 1),
    (p_tournament, coalesce(v_juego,'valorant'), 'l2', 0),
    (p_tournament, coalesce(v_juego,'valorant'), 'l2', 1),
    (p_tournament, coalesce(v_juego,'valorant'), 'lf', 0)
  ON CONFLICT (tournament_id, ronda, slot) DO NOTHING;
END $$;

CREATE OR REPLACE FUNCTION tt_quiza_sembrar() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_torneo text;
BEGIN
  SELECT tournament_id INTO v_torneo FROM tournament_teams
    WHERE status = 'confirmado'
    GROUP BY tournament_id
    HAVING count(*) = 8
    ORDER BY max(created_at) DESC
    LIMIT 1;
  IF v_torneo IS NOT NULL THEN
    PERFORM bracket_sembrar(v_torneo);
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS tt_sembrar ON tournament_teams;
CREATE TRIGGER tt_sembrar AFTER INSERT OR UPDATE OF status ON tournament_teams
  FOR EACH STATEMENT EXECUTE FUNCTION tt_quiza_sembrar();

-- ============================================================
-- C) PRESENCIA EN VIVO (¿quién está conectado / jugando?)
-- ============================================================
CREATE TABLE IF NOT EXISTS presence (
  player_id   uuid PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  estado      text NOT NULL DEFAULT 'online'
              CHECK (estado IN ('online','jugando','ausente')),
  juego       text,
  actualizado timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE presence ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pres_lectura ON presence;
CREATE POLICY pres_lectura ON presence FOR SELECT USING (true);
DROP POLICY IF EXISTS pres_alta_propia ON presence;
CREATE POLICY pres_alta_propia ON presence FOR INSERT
  WITH CHECK (player_id = current_player_id());
DROP POLICY IF EXISTS pres_edicion_propia ON presence;
CREATE POLICY pres_edicion_propia ON presence FOR UPDATE
  USING (player_id = current_player_id())
  WITH CHECK (player_id = current_player_id());
DROP POLICY IF EXISTS pres_baja_propia ON presence;
CREATE POLICY pres_baja_propia ON presence FOR DELETE
  USING (player_id = current_player_id());

CREATE OR REPLACE FUNCTION presence_touch() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.actualizado := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS pres_touch ON presence;
CREATE TRIGGER pres_touch BEFORE UPDATE ON presence
  FOR EACH ROW EXECUTE FUNCTION presence_touch();

-- ============================================================
-- VISTAS PÚBLICAS (sin PII: sin email, sin sub completo)
-- ============================================================
CREATE OR REPLACE VIEW v_en_vivo AS
SELECT pr.player_id,
       p.username, p.display_name, p.avatar_url, p.country, p.region,
       p.role, p.verified, p.rating,
       s.mmr,
       pr.estado, pr.juego, pr.actualizado
FROM presence pr
JOIN players p ON p.id = pr.player_id
LEFT JOIN LATERAL (
  SELECT mmr FROM season_player_stats
    WHERE player_id = pr.player_id
    ORDER BY created_at DESC NULLS LAST LIMIT 1
) s ON true
WHERE pr.actualizado > now() - interval '120 seconds'
  AND pr.estado <> 'ausente';

CREATE OR REPLACE VIEW v_torneo_equipos AS
SELECT id, tournament_id, game, name, tag, captain, region, status, created_at
FROM tournament_teams
WHERE status <> 'rechazado';

CREATE OR REPLACE VIEW v_torneo_bracket AS
SELECT tournament_id, game, ronda, slot, team_a, team_b,
       score_a, score_b, estado, ganador, updated_at
FROM tournament_matches;

-- ============================================================
-- GRANTS (patrón 04: RLS es la puerta real, el grant amplio
-- solo elimina el "permission denied" del Data API)
-- ============================================================
DO $$ DECLARE r text; BEGIN
  FOREACH r IN ARRAY ARRAY['anon','authenticated','authenticator'] LOOP
    BEGIN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON tournament_teams TO %I', r);
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON tournament_matches TO %I', r);
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON presence TO %I', r);
      EXECUTE format('GRANT SELECT ON v_en_vivo TO %I', r);
      EXECUTE format('GRANT SELECT ON v_torneo_equipos TO %I', r);
      EXECUTE format('GRANT SELECT ON v_torneo_bracket TO %I', r);
    EXCEPTION WHEN undefined_object THEN NULL;
    END;
  END LOOP;
END $$;

DO $$ BEGIN
  GRANT SELECT, INSERT, UPDATE, DELETE ON tournament_teams TO PUBLIC;
  GRANT SELECT, INSERT, UPDATE, DELETE ON tournament_matches TO PUBLIC;
  GRANT SELECT, INSERT, UPDATE, DELETE ON presence TO PUBLIC;
  GRANT SELECT ON v_en_vivo TO PUBLIC;
  GRANT SELECT ON v_torneo_equipos TO PUBLIC;
  GRANT SELECT ON v_torneo_bracket TO PUBLIC;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

-- La función de siembra la dispara el trigger (propietaria de las tablas)
GRANT EXECUTE ON FUNCTION bracket_sembrar(text) TO PUBLIC;
