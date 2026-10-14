-- ============================================================
-- VANTS GAMES — Siembra de torneos en Neon (a prueba de duplicados)
-- ------------------------------------------------------------
-- Los 6 torneos YA ESTÁN insertados en Neon (verificados).
-- Este script es idempotente: si el slug ya existe, lo salta.
-- Úsalo solo si vacías la tabla y necesitas re-sembrar.
-- ============================================================

INSERT INTO tournaments (name, slug, status, tier, starts_at, max_participants, current_participants, prize_pool, created_at, updated_at) VALUES
  ('Ascensión Series S4 · Etapa 4', 'ascension-series-s4-etapa-4', 'registration', 'pro',  '2026-10-26T21:00:00Z', 48, 12, 25000, now(), now()),
  ('Open Ladder Nocturna #88',      'open-ladder-nocturna-88',      'registration', 'open', '2026-10-15T23:00:00Z', 64, 51, 500,   now(), now()),
  ('Copa LATAM Invitational',       'copa-latam-invitational',      'registration', 'pro',  '2026-11-02T21:00:00Z', 16, 5,  10000, now(), now()),
  ('Scrim Cup Finde #12',           'scrim-cup-finde-12',           'registration', 'open', '2026-10-18T18:00:00Z', 32, 9,  250,   now(), now()),
  ('Stratos Major S4 · CS2',        'stratos-major-s4-cs2',         'registration', 'pro',  '2026-10-28T21:00:00Z', 48, 18, 15000, now(), now()),
  ('VANT Open Sundown',             'vant-open-sundown',            'registration', 'open', '2026-10-21T22:00:00Z', 64, 23, 750,   now(), now())
ON CONFLICT (slug) DO NOTHING;

-- (Opcional) Temporada activa de ranked:
-- INSERT INTO seasons (name, season_number, status) VALUES ('Temporada 4', 4, 'active');
