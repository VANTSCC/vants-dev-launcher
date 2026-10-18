-- ============================================================
-- VANTS GAMES — Corrección de datos ficticios YA cargados en Neon
-- ------------------------------------------------------------
-- El seed anterior insertó torneos con premios, cupos e inscritos
-- INVENTADOS ($25,000, "12/48 equipos", fechas de abril, etc.).
-- Ejecutá este script en Neon → SQL Editor una sola vez.
--
-- Estrategia: se conservan SOLO los dos torneos marca de la casa
-- (Ascensión Series S4 y Stratos Major S4 · CS2) y se limpian sus
-- números hasta que haya datos confirmados. Los torneos inventados
-- se marcan cancelados (o borra las líneas si preferís eliminarlos).
-- ============================================================

-- 1) Limpieza de números ficticios en los torneos reales de marca:
UPDATE tournaments SET
  prize_pool          = NULL,
  max_participants    = NULL,
  current_participants= 0,
  starts_at           = NULL,
  tier                = 'open',
  status              = 'registration',
  updated_at          = now()
WHERE slug IN ('ascension-series-s4-etapa-4', 'ascension-series-s4',
               'stratos-major-s4-cs2');

-- 2) Torneos que eran 100% inventados: sin estado "registration".
--    (Si preferís borrarlos directamente, usa DELETE en lugar de UPDATE.)
UPDATE tournaments SET status='cancelled', updated_at=now()
WHERE slug IN ('open-ladder-nocturna-88',
               'copa-latam-invitational',
               'scrim-cup-finde-12',
               'vant-open-sundown');

-- 3) (Opcional) Renombrar la etapa inventada al nombre real de marca:
UPDATE tournaments SET name='Ascensión Series S4', updated_at=now()
WHERE slug='ascension-series-s4-etapa-4' AND name <> 'Ascensión Series S4';

-- Verificación rápida:
-- SELECT slug, status, starts_at, max_participants, current_participants, prize_pool
-- FROM tournaments ORDER BY created_at DESC;
