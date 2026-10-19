-- ============================================================
-- 28-plataforma-torneos.sql
-- PLATAFORMA DE TORNEOS (estilo strafe): catálogo público pt_*
-- ------------------------------------------------------------
-- Prefijo pt_ para NO chocar con el sistema de torneos existente
-- (tabla tournaments histórica + tournament_teams/matches del
-- bracket real, expuestas por el proxy vantsdata).
--   pt_games · pt_torneos · pt_teams · pt_matches · pt_articulos
--   (TournamentParticipant = tournament_teams existente, no se duplica)
--
-- REGLAS DE LA CASA:
--   · Idempotente y defensivo (re-ejecutable en cada push).
--   · RLS con lectura pública + escritura del OWNER.
--   · Seed SOLO claramente etiquetado is_demo=true y nombre "DEMO ·".
-- Reversible:
--   DROP TABLE IF EXISTS pt_articulos, pt_matches, pt_teams,
--          pt_torneos, pt_games CASCADE;
-- ============================================================

-- ---------- PT_GAMES ----------
CREATE TABLE IF NOT EXISTS pt_games (
  slug      text PRIMARY KEY,
  nombre    text NOT NULL,
  corto     text,
  activo    boolean NOT NULL DEFAULT true,
  orden     int NOT NULL DEFAULT 100,
  logo_url  text,
  color     text
);

INSERT INTO pt_games (slug, nombre, corto, activo, orden) VALUES
  ('valorant', 'VALORANT',        'VALORANT', true,  10),
  ('cs2',      'COUNTER-STRIKE 2','CS2',      true,  20),
  ('dota2',    'DOTA 2',          'DOTA 2',   true,  30),
  ('lol',      'LEAGUE OF LEGENDS','LOL',     false, 40),
  ('r6s',      'RAINBOW SIX SIEGE','R6',      false, 50),
  ('cod',      'CALL OF DUTY',    'COD',      false, 60)
ON CONFLICT (slug) DO NOTHING;

-- ---------- PT_TORNEOS ----------
CREATE TABLE IF NOT EXISTS pt_torneos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          text NOT NULL UNIQUE,
  source        text NOT NULL DEFAULT 'vants' CHECK (source IN ('vants','faceit','demo')),
  external_id   text,
  game_slug     text NOT NULL REFERENCES pt_games(slug) ON DELETE RESTRICT,
  nombre        text NOT NULL,
  descripcion   text,
  estado        text NOT NULL DEFAULT 'upcoming'
                CHECK (estado IN ('upcoming','ongoing','finished','cancelled')),
  major         boolean NOT NULL DEFAULT false,
  region        text,
  location_type text CHECK (location_type IN ('online','lan')),
  prize_value   numeric CHECK (prize_value IS NULL OR prize_value >= 0),
  prize_currency text NOT NULL DEFAULT 'USD',
  fee           numeric NOT NULL DEFAULT 0,
  max_teams     int,
  starts_at     timestamptz,
  ends_at       timestamptz,
  logo_url      text,
  banner_url    text,
  formato       text,
  reglas        text,
  is_demo       boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pt_torneos_fechas_ok
    CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at >= starts_at),
  CONSTRAINT pt_torneos_fuente_unica UNIQUE (source, external_id)
);
CREATE INDEX IF NOT EXISTS idx_pt_torneos_listado ON pt_torneos (game_slug, estado, starts_at);

-- ---------- PT_TEAMS ----------
CREATE TABLE IF NOT EXISTS pt_teams (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug       text NOT NULL UNIQUE,
  nombre     text NOT NULL,
  tag        text,
  game_slug  text REFERENCES pt_games(slug) ON DELETE SET NULL,
  region     text,
  logo_url   text,
  is_demo    boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------- PT_MATCHES ----------
CREATE TABLE IF NOT EXISTS pt_matches (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source        text NOT NULL DEFAULT 'vants' CHECK (source IN ('vants','faceit','demo')),
  external_id   text,
  game_slug     text NOT NULL REFERENCES pt_games(slug) ON DELETE RESTRICT,
  tournament_id uuid REFERENCES pt_torneos(id) ON DELETE SET NULL,
  equipo_a      text NOT NULL,
  equipo_b      text NOT NULL,
  score_a       int,
  score_b       int,
  estado        text NOT NULL DEFAULT 'upcoming'
                CHECK (estado IN ('upcoming','live','finished','cancelled')),
  best_of       int,
  empieza_at    timestamptz,
  termino_at    timestamptz,
  is_demo       boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pt_match_fuente_unica UNIQUE (source, external_id)
);
CREATE INDEX IF NOT EXISTS idx_pt_matches_listado ON pt_matches (game_slug, estado, empieza_at);

-- ---------- PT_ARTICULOS ----------
CREATE TABLE IF NOT EXISTS pt_articulos (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug         text NOT NULL UNIQUE,
  titulo       text NOT NULL,
  resumen      text,
  cuerpo       text NOT NULL,
  autor        text,
  game_slug    text REFERENCES pt_games(slug) ON DELETE SET NULL,
  estado       text NOT NULL DEFAULT 'published' CHECK (estado IN ('draft','published')),
  publicado_at timestamptz,
  is_demo      boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pt_articulos_publicados ON pt_articulos (estado, publicado_at DESC);

-- ============================================================
-- RLS + GRANTS (patrón 04/17)
-- ============================================================
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['pt_games','pt_torneos','pt_teams','pt_matches','pt_articulos'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', r);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', r || '_lectura', r);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING (true)', r || '_lectura', r);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', r || '_owner', r);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL USING (public.current_es_owner()) WITH CHECK (public.current_es_owner())',
      r || '_owner', r);
    BEGIN
      EXECUTE format('GRANT SELECT ON %I TO PUBLIC', r);
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO anon', r);
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO authenticated', r);
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO authenticator', r);
    EXCEPTION WHEN undefined_object THEN
      EXECUTE format('GRANT SELECT ON %I TO PUBLIC', r);
    END;
  END LOOP;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'RLS/grants parcialmente omitidos: %', SQLERRM;
END $$;

-- ============================================================
-- SEED DEMO (is_demo=true + "DEMO ·") — claramente ficticio
-- ============================================================
INSERT INTO pt_torneos
  (slug, source, external_id, game_slug, nombre, descripcion, estado, major, region,
   location_type, prize_value, fee, max_teams, starts_at, ends_at, formato, is_demo)
VALUES
  ('demo-copa-comunidad-s5','demo','demo-copa-comunidad-s5','valorant',
   'DEMO · Copa Comunidad S5','Torneo de demostración para validar la plataforma. Sustituir por un torneo real.',
   'upcoming', false, 'LATAM','online', 500, 0, 16,
   now() + interval '20 days', now() + interval '24 days', 'Eliminación simple · Bo1', true),
  ('demo-liga-nocturna-s5','demo','demo-liga-nocturna-s5','valorant',
   'DEMO · Liga Nocturna S5','Torneo de demostración en curso para validar la plataforma.',
   'ongoing', false, 'LATAM','online', 250, 0, 32,
   now() - interval '2 days', now() + interval '5 days', 'Liga suiza · Bo1', true),
  ('demo-stratos-major-s5','demo','demo-stratos-major-s5','cs2',
   'DEMO · Stratos Major S5','Torneo demo de CS2 con badge MAJOR para validar la plataforma.',
   'upcoming', true, 'EU','lan', 1000, 0, 24,
   now() + interval '28 days', now() + interval '31 days', 'Doble eliminación · Bo3', true),
  ('demo-copita-cs2-archivada','demo','demo-copita-cs2-archivada','cs2',
   'DEMO · Copita CS2 (archivo)','Torneo demo finalizado para poblar el archivo.',
   'finished', false, 'EU','online', 300, 0, 8,
   now() - interval '40 days', now() - interval '36 days', 'Eliminación simple · Bo1', true)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO pt_teams (slug, nombre, tag, game_slug, region, is_demo) VALUES
  ('demo-equipo-fenix','DEMO · Equipo Fénix','FNX','valorant','LATAM', true),
  ('demo-equipo-lobo','DEMO · Equipo Lobo','LBO','valorant','LATAM', true),
  ('demo-equipo-stratos','DEMO · Equipo Stratos','STS','cs2','EU', true),
  ('demo-equipo-nova','DEMO · Equipo Nova','NVA','cs2','EU', true)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO pt_matches
  (source, external_id, game_slug, tournament_id, equipo_a, equipo_b, estado, best_of, empieza_at, is_demo)
SELECT 'demo','demo-m1','valorant', t.id,'DEMO · Equipo Fénix','DEMO · Equipo Lobo','live',1, now() - interval '30 minutes', true
FROM pt_torneos t WHERE t.slug='demo-liga-nocturna-s5'
ON CONFLICT (source, external_id) DO NOTHING;

INSERT INTO pt_matches
  (source, external_id, game_slug, tournament_id, equipo_a, equipo_b, estado, best_of, empieza_at, is_demo)
SELECT 'demo','demo-m2','valorant', t.id,'DEMO · Equipo Lobo','DEMO · Equipo Fénix','upcoming',1, now() + interval '2 hours', true
FROM pt_torneos t WHERE t.slug='demo-copa-comunidad-s5'
ON CONFLICT (source, external_id) DO NOTHING;

INSERT INTO pt_matches
  (source, external_id, game_slug, equipo_a, equipo_b, score_a, score_b, estado, best_of, empieza_at, termino_at, is_demo)
VALUES ('demo','demo-m3','cs2','DEMO · Equipo Stratos','DEMO · Equipo Nova',2,1,'finished',3,
        now() - interval '1 day', now() - interval '22 hours', true)
ON CONFLICT (source, external_id) DO NOTHING;

INSERT INTO pt_articulos (slug, titulo, resumen, cuerpo, autor, game_slug, estado, publicado_at, is_demo) VALUES
  ('demo-como-participar','DEMO · Cómo participar en los torneos de VANTS',
   'Artículo de demostración que explica el flujo de inscripción de la plataforma.',
   E'Este artículo es una DEMOSTRACIÓN para validar el sistema de noticias.\n\nFlujo real de inscripción: crea tu cuenta, inscribe tu equipo desde la sección Torneos, espera la confirmación del organizador y juega. Los resultados se registran en el bracket y tu VANTS RATING se mueve con cada partida oficial.\n\nCuando el equipo publique su primer anuncio real, este artículo se sustituye o retira.',
   'VANTS','valorant','published', now() - interval '3 days', true),
  ('demo-calendario-s5','DEMO · Calendario de la Temporada 5',
   'Artículo de demostración con el calendario previsto de la temporada.',
   E'Este artículo es una DEMOSTRACIÓN para validar el sistema de noticias.\n\nLa Temporada 5 contempla copas mensuales, ligas nocturnas y un major de cierre. Fechas, premios y sedes se anuncian por Discord y en esta sección cuando se confirmen.',
   'VANTS','cs2','published', now() - interval '10 days', true)
ON CONFLICT (slug) DO NOTHING;

-- ---------- Inventario final (log del workflow) ----------
SELECT relname AS tabla, n_live_tup AS filas_aproximadas
FROM pg_stat_user_tables
WHERE schemaname = 'public' AND relname IN ('pt_games','pt_torneos','pt_teams','pt_matches','pt_articulos')
ORDER BY relname;
