-- ============================================================
-- 29-pt-players.sql
-- PLATAFORMA DE TORNEOS · JUGADORES (fase que faltaba de F7/F9)
-- ------------------------------------------------------------
-- pt_players completa el catálogo pt_*: fichas de jugador con
-- slug, juego, equipo (soft-ref pt_teams.slug), rol y país.
-- Sin esta tabla no existen /api/players/:slug ni ficha de jugador.
--
-- REGLAS DE LA CASA:
--   · Idempotente y defensivo (re-ejecutable en cada push).
--   · RLS con lectura pública + escritura del OWNER (patrón migra 28).
--   · Seed SOLO claramente etiquetado is_demo=true y nombre "DEMO ·".
--   · NUNCA datos personales: solo perfil público competitivo
--     (nombre en juego, rol, país). Sin email/auth/contacto.
-- Reversible:
--   DROP TABLE IF EXISTS pt_players CASCADE;
-- ============================================================

CREATE TABLE IF NOT EXISTS pt_players (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text NOT NULL UNIQUE,
  source      text NOT NULL DEFAULT 'vants' CHECK (source IN ('vants','faceit','demo')),
  external_id text,
  nombre      text NOT NULL,
  game_slug   text REFERENCES pt_games(slug) ON DELETE SET NULL,
  team_slug   text,                      -- soft-ref pt_teams.slug (sin FK para no acoplar el ciclo de vida)
  rol         text,
  pais        text,
  bio         text,
  avatar_url  text,
  is_demo     boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pt_players_fuente_unica UNIQUE (source, external_id)
);
CREATE INDEX IF NOT EXISTS idx_pt_players_equipo ON pt_players (team_slug);
CREATE INDEX IF NOT EXISTS idx_pt_players_juego  ON pt_players (game_slug);

-- ============================================================
-- RLS + GRANTS (mismo patrón que migra 28)
-- ============================================================
DO $$
BEGIN
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', 'pt_players');
  EXECUTE format('DROP POLICY IF EXISTS %I ON %I', 'pt_players_lectura', 'pt_players');
  EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING (true)', 'pt_players_lectura', 'pt_players');
  EXECUTE format('DROP POLICY IF EXISTS %I ON %I', 'pt_players_owner', 'pt_players');
  EXECUTE format(
    'CREATE POLICY %I ON %I FOR ALL USING (public.current_es_owner()) WITH CHECK (public.current_es_owner())',
    'pt_players_owner', 'pt_players');
  BEGIN
    EXECUTE format('GRANT SELECT ON %I TO PUBLIC', 'pt_players');
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO anon', 'pt_players');
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO authenticated', 'pt_players');
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO authenticator', 'pt_players');
  EXCEPTION WHEN undefined_object THEN
    EXECUTE format('GRANT SELECT ON %I TO PUBLIC', 'pt_players');
  END;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'RLS/grants parcialmente omitidos: %', SQLERRM;
END $$;

-- ============================================================
-- SEED DEMO (is_demo=true + "DEMO ·") — plantillas de 5 jugadores
-- para cada equipo demo existente (migra 28). Ficticio a propósito.
-- ============================================================
INSERT INTO pt_players (slug, source, external_id, nombre, game_slug, team_slug, rol, pais, is_demo) VALUES
  ('demo-jugador-alex','demo','demo-p1','DEMO · Alex «Fx» Morales','valorant','demo-equipo-fenix','IGL','VE',true),
  ('demo-jugador-kira','demo','demo-p2','DEMO · Kira «K9» Rojas','valorant','demo-equipo-fenix','Duelista','MX',true),
  ('demo-jugador-tavo','demo','demo-p3','DEMO · Tavo «TV» Núñez','valorant','demo-equipo-fenix','Controlador','CO',true),
  ('demo-jugador-mila','demo','demo-p4','DEMO · Mila «ML» Torres','valorant','demo-equipo-fenix','Sentinela','AR',true),
  ('demo-jugador-reno','demo','demo-p5','DEMO · Reno «RN» Silva','valorant','demo-equipo-fenix','Flexible','CL',true),
  ('demo-jugador-bruno','demo','demo-p6','DEMO · Bruno «B7» Cano','valorant','demo-equipo-lobo','IGL','PE',true),
  ('demo-jugador-dani','demo','demo-p7','DEMO · Dani «DN» Vera','valorant','demo-equipo-lobo','Duelista','EC',true),
  ('demo-jugador-gael','demo','demo-p8','DEMO · Gael «GL» Ríos','valorant','demo-equipo-lobo','Controlador','MX',true),
  ('demo-jugador-iris','demo','demo-p9','DEMO · Iris «IR» Paz','valorant','demo-equipo-lobo','Sentinela','BO',true),
  ('demo-jugador-jony','demo','demo-p10','DEMO · Jony «JY» Mesa','valorant','demo-equipo-lobo','Flexible','UY',true),
  ('demo-jugador-koldo','demo','demo-p11','DEMO · Koldo «KD» Sáez','cs2','demo-equipo-stratos','IGL','ES',true),
  ('demo-jugador-lena','demo','demo-p12','DEMO · Lena «LN» Vidal','cs2','demo-equipo-stratos','AWPer','ES',true),
  ('demo-jugador-marco','demo','demo-p13','DEMO · Marco «MC» Duarte','cs2','demo-equipo-stratos','Entry','PT',true),
  ('demo-jugador-nico','demo','demo-p14','DEMO · Nico «NC» Bauza','cs2','demo-equipo-stratos','Lurker','UY',true),
  ('demo-jugador-olga','demo','demo-p15','DEMO · Olga «OG» Ferrer','cs2','demo-equipo-stratos','Support','AR',true),
  ('demo-jugador-pau','demo','demo-p16','DEMO · Pau «P4» Gil','cs2','demo-equipo-nova','IGL','ES',true),
  ('demo-jugador-quim','demo','demo-p17','DEMO · Quim «QM» Sala','cs2','demo-equipo-nova','AWPer','MX',true),
  ('demo-jugador-raul','demo','demo-p18','DEMO · Raúl «R2» Ibáñez','cs2','demo-equipo-nova','Entry','CL',true),
  ('demo-jugador-sara','demo','demo-p19','DEMO · Sara «SR» Leiva','cs2','demo-equipo-nova','Lurker','CO',true),
  ('demo-jugador-tito','demo','demo-p20','DEMO · Tito «T5» Campos','cs2','demo-equipo-nova','Support','PE',true)
ON CONFLICT (slug) DO NOTHING;

-- ---------- Inventario final (log del workflow) ----------
SELECT relname AS tabla, n_live_tup AS filas_aproximadas
FROM pg_stat_user_tables
WHERE schemaname = 'public' AND relname IN ('pt_players')
ORDER BY relname;
