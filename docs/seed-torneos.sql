-- ============================================================
-- VANTS GAMES — Siembra de torneos reales en Neon
-- ------------------------------------------------------------
-- 1) Abre https://console.neon.tech -> tu proyecto -> SQL Editor
-- 2) Pega TODO este script y ejecútalo
-- 3) Recarga https://feispla.github.io/Vants/ :
--    el chip pasará de "DATOS DE DEMOSTRACIÓN" a "DATOS EN VIVO · NEON"
--    y la sección TORNEOS mostrará estos torneos reales.
-- (Reversible: DELETE FROM tournaments WHERE slug LIKE '%vants%';)
-- ============================================================

INSERT INTO tournaments (name, slug, status, tier, starts_at, max_participants, current_participants, prize_pool, updated_at) VALUES
  ('Ascensión Series S4 · Etapa 4', 'ascension-series-s4-etapa-4', 'inscripcion', 'pro',  '2026-10-26T21:00:00Z', 48, 12, 25000, now()),
  ('Open Ladder Nocturna #88',      'open-ladder-nocturna-88',      'inscripcion', 'open', '2026-10-15T23:00:00Z', 64, 51, 500,   now()),
  ('Copa LATAM Invitational',       'copa-latam-invitational',      'inscripcion', 'pro',  '2026-11-02T21:00:00Z', 16, 5,  10000, now()),
  ('Scrim Cup Finde #12',           'scrim-cup-finde-12',           'inscripcion', 'open', '2026-10-18T18:00:00Z', 32, 9,  250,   now()),
  ('Stratos Major S4 · CS2',        'stratos-major-s4',             'inscripcion', 'pro',  '2026-10-28T21:00:00Z', 48, 18, 15000, now()),
  ('VANT Open Sundown',             'vant-open-sundown',            'inscripcion', 'open', '2026-10-21T22:00:00Z', 64, 23, 750,   now());

-- (Opcional) Temporada activa de ranked, para vistas futuras:
-- INSERT INTO seasons (name, season_number, status) VALUES ('Temporada 4', 4, 'active');
