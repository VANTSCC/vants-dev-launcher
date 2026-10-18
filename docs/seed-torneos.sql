-- ============================================================
-- VANTS GAMES — Siembra HONESTA de torneos en Neon (idempotente)
-- ------------------------------------------------------------
-- IMPORTANTE (2026-10-18): el seed anterior traía premios, cupos y
-- participantes INVENTADOS ($25,000, 12/16 inscritos, etc.).
-- Regla nueva: NO se cargan números que no estén confirmados.
--   prize_pool=NULL  -> la web muestra "POR ANUNCIAR"
--   max_participants=NULL -> la web muestra "CUPOS ABIERTOS"
--   current_participants=0 -> real: aún no hay inscriptos pagados
-- Ejecutar solo si vacías la tabla y necesitas re-sembrar.
-- ============================================================

INSERT INTO tournaments (name, slug, status, tier, starts_at, max_participants, current_participants, prize_pool, created_at, updated_at) VALUES
  ('Ascensión Series S4',   'ascension-series-s4',   'registration', 'open', NULL, NULL, 0, NULL, now(), now()),
  ('Stratos Major S4 · CS2','stratos-major-s4-cs2',  'registration', 'open', NULL, NULL, 0, NULL, now(), now())
ON CONFLICT (slug) DO NOTHING;

-- Cuando confirmes fecha/pozo/cupos reales, actualiza la fila, ej.:
-- UPDATE tournaments SET starts_at='2026-11-15T21:00:00Z', prize_pool=250, max_participants=32 WHERE slug='ascension-series-s4';
