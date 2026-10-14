-- ============================================================
-- VANTS — Migración del PASE COMPETITIVO a datos reales en Neon
-- ------------------------------------------------------------
-- Ejecutar en el SQL Editor de Neon (database: neondb), una sola vez.
-- Crea: tabla de progreso por jugador + catálogo de recompensas +
--        funciones controladas (estado y reclamo con validación servidor).
-- Reversible: DROP FUNCTION pass_reclamar(text); DROP FUNCTION pass_estado();
--             DROP TABLE pass_recompensas; DROP TABLE pass_progreso;
-- ============================================================

-- 1) Progreso del pase: UNA fila por jugador, ligada a su cuenta
CREATE TABLE IF NOT EXISTS pass_progreso (
  player_id uuid PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  nivel int NOT NULL DEFAULT 7,
  xp int NOT NULL DEFAULT 1780,
  xp_max int NOT NULL DEFAULT 2000,
  premium boolean NOT NULL DEFAULT false,
  reclamadas jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE pass_progreso ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pass_propia ON pass_progreso;
CREATE POLICY pass_propia ON pass_progreso
  USING (player_id = current_player_id())
  WITH CHECK (player_id = current_player_id());

-- 2) Catálogo de recompensas (controlado en la base, no en el navegador)
CREATE TABLE IF NOT EXISTS pass_recompensas (
  key text PRIMARY KEY,
  nivel int NOT NULL,
  premium boolean NOT NULL DEFAULT false,
  xp int,
  tipo text NOT NULL,
  nombre text NOT NULL
);
INSERT INTO pass_recompensas (key, nivel, premium, xp, tipo, nombre) VALUES
  ('1f', 1, false, NULL, 'TÍTULO',   'Título: RETADOR'),
  ('2f', 2, false, 100,  'BOOST',    'Boost +100 XP'),
  ('3p', 3, true,  NULL, 'CHARM',    'Charm: Mira Dorada'),
  ('4f', 4, false, NULL, 'TARJETA',  'Tarjeta: FUNDICIÓN'),
  ('5p', 5, true,  NULL, 'UTILIDAD', 'Reroll de fixture'),
  ('6f', 6, false, 250,  'BOOST',    'Boost +250 XP'),
  ('7f', 7, false, NULL, 'PARCHE',   'Parche de equipo'),
  ('8p', 8, true,  NULL, 'TÍTULO',   'Título: ASCENDIDO'),
  ('9f', 9, false, 400,  'BOOST',    'Boost +400 XP'),
  ('10p',10, true, NULL, 'CUPÓN',    '-50% inscripción'),
  ('11p',11, true, NULL, 'BANNER',   'Banner animado'),
  ('12p',12, true, NULL, 'PLACA',    'Placa de temporada S4')
ON CONFLICT (key) DO NOTHING;

-- 3) Estado del pase (crea la fila la primera vez; premium automático para owner/admin)
CREATE OR REPLACE FUNCTION pass_estado()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  pid uuid; prog pass_progreso; v_role text;
BEGIN
  pid := current_player_id();
  IF pid IS NULL THEN RETURN jsonb_build_object('error', 'sin_sesion'); END IF;
  INSERT INTO pass_progreso (player_id) VALUES (pid) ON CONFLICT (player_id) DO NOTHING;
  SELECT role INTO v_role FROM players WHERE id = pid;
  IF v_role IN ('owner','admin') THEN
    UPDATE pass_progreso SET premium = true WHERE player_id = pid;
  END IF;
  SELECT * INTO prog FROM pass_progreso WHERE player_id = pid;
  RETURN jsonb_build_object(
    'nivel', prog.nivel, 'xp', prog.xp, 'xp_max', prog.xp_max,
    'premium', prog.premium OR v_role IN ('owner','admin'),
    'reclamadas', prog.reclamadas, 'rol', COALESCE(v_role,'free')
  );
END $$;

-- 4) Reclamo CONTROLADO en el servidor: valida nivel, premium y duplicados,
--    suma XP, sube de nivel y registra todo en la base.
CREATE OR REPLACE FUNCTION pass_reclamar(p_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  pid uuid; prog pass_progreso; rw pass_recompensas;
  nuevo_xp int; nuevo_nivel int; nuevo_xpmax int; nuevas jsonb; v_role text;
BEGIN
  pid := current_player_id();
  IF pid IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'sin_sesion'); END IF;
  INSERT INTO pass_progreso (player_id) VALUES (pid) ON CONFLICT (player_id) DO NOTHING;
  SELECT * INTO prog FROM pass_progreso WHERE player_id = pid;
  SELECT * INTO rw FROM pass_recompensas WHERE key = p_key;
  IF rw.key IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'no_existe'); END IF;
  IF prog.reclamadas ? p_key THEN RETURN jsonb_build_object('ok', false, 'error', 'ya_reclamada'); END IF;
  IF prog.nivel < rw.nivel THEN RETURN jsonb_build_object('ok', false, 'error', 'nivel_insuficiente', 'nivel', rw.nivel); END IF;
  IF rw.premium AND NOT prog.premium THEN RETURN jsonb_build_object('ok', false, 'error', 'requiere_premium'); END IF;

  nuevas := prog.reclamadas || to_jsonb(p_key);
  nuevo_xp := prog.xp + COALESCE(rw.xp, 0);
  nuevo_nivel := prog.nivel; nuevo_xpmax := prog.xp_max;
  WHILE nuevo_xp >= nuevo_xpmax LOOP
    nuevo_xp := nuevo_xp - nuevo_xpmax;
    nuevo_nivel := nuevo_nivel + 1;
    nuevo_xpmax := (round((nuevo_xpmax * 1.15) / 50) * 50)::int;
  END LOOP;
  UPDATE pass_progreso SET reclamadas = nuevas, xp = nuevo_xp, nivel = nuevo_nivel,
         xp_max = nuevo_xpmax, updated_at = now() WHERE player_id = pid;
  RETURN jsonb_build_object('ok', true, 'nivel', nuevo_nivel, 'xp', nuevo_xp,
         'xp_max', nuevo_xpmax, 'reclamadas', nuevas, 'xp_ganado', COALESCE(rw.xp, 0));
END $$;

GRANT EXECUTE ON FUNCTION pass_estado() TO PUBLIC;
GRANT EXECUTE ON FUNCTION pass_reclamar(text) TO PUBLIC;
