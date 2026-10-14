-- ============================================================================
-- 03 · Datos base (siembra defensiva)
-- Siembra una temporada activa SOLO si seasons está vacía; si las columnas
-- difieren de lo esperado, lo avisa y continúa sin romper la migración.
-- El resto de datos reales (events, partidas ranked, inscripciones) se
-- registran desde la web, el panel admin o el bot — aquí no se inventan.
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM seasons) THEN
    RAISE NOTICE 'seasons ya tiene filas: no se siembra';
  ELSE
    INSERT INTO seasons (name, season_number, status, start_date, end_date)
    VALUES ('Temporada 5 · Ascensión', 5, 'active', CURRENT_DATE, CURRENT_DATE + INTERVAL '90 days');
    RAISE NOTICE 'Temporada activa sembrada (Temporada 5 · Ascensión, 90 días)';
  END IF;
EXCEPTION
  WHEN undefined_column THEN
    RAISE NOTICE 'seasons tiene columnas distintas a las esperadas: siembra omitida';
  WHEN OTHERS THEN
    RAISE NOTICE 'Siembra de temporada omitida: %', SQLERRM;
END $$;

-- ── Inventario final (queda en el log del workflow) ─────────────────────────
SELECT relname AS tabla, n_live_tup AS filas_aproximadas
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY relname;
