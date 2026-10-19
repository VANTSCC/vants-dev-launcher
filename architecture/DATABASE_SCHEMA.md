# DATABASE_SCHEMA — Esquema de la plataforma de torneos (migración 28)

Patrón del repo: migraciones idempotentes, RLS con policies de lectura pública y escritura
protegida, GRANT triple (`anon`, `authenticated`, `authenticator` + `PUBLIC`), vistas públicas
de lectura. Reutiliza `players`, `tournament_teams` (participantes), `tournament_matches`
(bracket), `seasons`, `presence`.

## Entidades nuevas

### games (catálogo de juegos del hub)
```sql
CREATE TABLE IF NOT EXISTS games (
  slug        text PRIMARY KEY,              -- 'valorant','cs2','dota2','lol','r6s','cod'…
  nombre      text NOT NULL,
  corto       text,                          -- 'VALORANT','CS2'
  activo      boolean NOT NULL DEFAULT true,
  orden       int  NOT NULL DEFAULT 100,
  logo_url    text,                          -- asset propio bajo /assets/brand (opcional)
  color       text                           -- color de acento del juego (opcional)
);
```

### tournaments (catálogo/torneos publicables)
```sql
CREATE TABLE IF NOT EXISTS tournaments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text NOT NULL UNIQUE,          -- 'copa-comunidad-s4' (estable, URL)
  source      text NOT NULL DEFAULT 'vants'  -- 'vants' | 'faceit' | 'demo'
              CHECK (source IN ('vants','faceit','demo')),
  external_id text,                          -- id del proveedor externo (FACEIT id…)
  game_slug   text NOT NULL REFERENCES games(slug) ON DELETE RESTRICT,
  nombre      text NOT NULL,
  descripcion text,
  estado      text NOT NULL DEFAULT 'upcoming'
              CHECK (estado IN ('upcoming','ongoing','finished','cancelled')),
  major       boolean NOT NULL DEFAULT false,
  region      text,                          -- 'EU','NA','LATAM','WA','EA','…'
  location_type text CHECK (location_type IN ('online','lan')),
  prize_value numeric CHECK (prize_value IS NULL OR prize_value >= 0),
  prize_currency text DEFAULT 'USD',
  fee         numeric DEFAULT 0,
  max_teams   int,
  starts_at   timestamptz,
  ends_at     timestamptz,
  logo_url    text,
  banner_url  text,
  formato     text,                          -- 'Eliminación simple 8 equipos', …
  reglas      text,
  is_demo     boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT torneos_fechas_ok CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at >= starts_at),
  CONSTRAINT torneos_fuente_unica UNIQUE (source, external_id)
);
CREATE INDEX IF NOT EXISTS idx_torneos_listado ON tournaments (game_slug, estado, starts_at);
CREATE INDEX IF NOT EXISTS idx_torneos_busqueda ON tournaments USING gin (to_tsvector('spanish', nombre));
```
`TournamentParticipant` = `tournament_teams` existente (ya tiene `tournament_id`, `game`,
`status pendiente|confirmado|rechazado`, equipo, capitán, región). NO se duplica.

### teams (equipos como entidad propia — fichas públicas)
```sql
CREATE TABLE IF NOT EXISTS teams (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug       text NOT NULL UNIQUE,
  nombre     text NOT NULL,
  tag        text,
  game_slug  text REFERENCES games(slug) ON DELETE SET NULL,
  region     text,
  logo_url   text,
  is_demo    boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
```
Nota: `tournament_teams` (inscripciones) puede vincular a `teams` en el futuro; hoy mantiene
compatibilidad sin FK (campo texto) — no se toca.

### matches (calendario general de partidas)
```sql
CREATE TABLE IF NOT EXISTS matches (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source       text NOT NULL DEFAULT 'vants' CHECK (source IN ('vants','faceit','demo')),
  external_id  text,
  game_slug    text NOT NULL REFERENCES games(slug) ON DELETE RESTRICT,
  tournament_id uuid REFERENCES tournaments(id) ON DELETE SET NULL,
  equipo_a     text NOT NULL,
  equipo_b     text NOT NULL,
  score_a      int,
  score_b      int,
  estado       text NOT NULL DEFAULT 'upcoming'
               CHECK (estado IN ('upcoming','live','finished','cancelled')),
  best_of      int,
  empieza_at   timestamptz,
  termino_at   timestamptz,
  is_demo      boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT match_fuente_unica UNIQUE (source, external_id)
);
CREATE INDEX IF NOT EXISTS idx_matches_listado ON matches (game_slug, estado, empieza_at);
```

### articles (noticias/artículos)
```sql
CREATE TABLE IF NOT EXISTS articles (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug       text NOT NULL UNIQUE,
  titulo     text NOT NULL,
  resumen    text,
  cuerpo     text NOT NULL,
  autor      text,
  game_slug  text REFERENCES games(slug) ON DELETE SET NULL,
  estado     text NOT NULL DEFAULT 'published' CHECK (estado IN ('draft','published')),
  publicado_at timestamptz,
  is_demo    boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_articles_publicados ON articles (estado, publicado_at DESC);
```

## RLS y grants (patrón del repo, aplicado a cada tabla)

```sql
ALTER TABLE games      ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournaments ENABLE ROW LEVEL SECURITY;
-- … idem teams, matches, articles
CREATE POLICY juego_lectura   ON games      FOR SELECT USING (activo);
CREATE POLICY torneo_lectura  ON tournaments FOR SELECT USING (true);
CREATE POLICY torneo_owner    ON tournaments FOR ALL
  USING (public.current_es_owner()) WITH CHECK (public.current_es_owner());
-- escritura del dueño (publicar/editar torneos, artículos…); lectura pública para el resto
GRANT SELECT ON games, tournaments, teams, matches, articles TO PUBLIC;
```

Las escrituras del dueño se hacen con su sesión (RLS `current_es_owner()` ya definido en la
migración 17) o por el bot/Worker con el rol con privilegios. Las vistas para la API pública
pueden filtrar `is_demo` según query param en el Worker (no en SQL) para que la etiqueta sea
siempre explícita en la UI.

## Seed DEMO (etiquetado, decisión D4)

- 3 juegos activos reales del hub: `valorant`, `cs2`, `dota2` (+ resto `activo=false` para
  crecer sin cambiar esquema).
- 4 torneos `is_demo=true, source='demo'` (uno por estado: upcoming/ongoing/finished x2),
  4 equipos demo, 4 partidas demo (live/upcoming/finished), 2 artículos demo.
- Todo con `(source='demo')` UNIQUE estable → re-ejecución idempotente
  (`ON CONFLICT (slug) DO NOTHING`).
- Los nombres demo dejan claro su carácter ("DEMO · Copa Comunidad S4", …) y la UI añade el
  chip DEMO. Ningún dato demo se marca como real ni con datos estructurados de evento.

## Relaciones (ER resumido)

```
games 1─* tournaments 1─* tournament_teams (participantes, tabla existente)
games 1─* matches *─1 tournaments
games 1─* teams
games 1─* articles
players (existente) ─ auth0_sub → identidad del dueño/admin
seasons (existente) ─ temporadas del motor ranked
```

## Anti-N+1 e índices

- Listados con JOINs directos (torneos×games) y `LIMIT/OFFSET`; índices compuestos por el
  orden de listado `(game_slug, estado, starts_at)`; búsqueda con GIN spanish.
- El Data API de Neon resuelve los selects REST; los endpoints del Worker agrupan llamadas en
  `Promise.all` (patrón ya usado por `/api/torneos/bracket`).
