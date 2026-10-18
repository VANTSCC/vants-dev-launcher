-- ============================================================
-- 15-reata-vinculos-dueno.sql
-- La migración 14 eliminó las filas fantasma del dueño y DESLIGÓ sus
-- vants_links (patrón 06: desligar, no borrar). Sus vínculos reales
-- (kick, riot, tiktok, x, youtube con SU sub) quedaron flotando.
--
-- Regla general e idempotente: todo vínculo cuyo auth0_sub coincida
-- con una fila de jugador existente y esté sin destino se reata a esa
-- fila. Los vínculos de cuentas dormidas (sin fila) siguen sin destino,
-- inofensivos. NUNCA toca vínculos ya ligados ni OAuth verificado ajeno.
-- ============================================================

DO $$
DECLARE n bigint;
BEGIN
  UPDATE vants_links l
  SET player_id = p.id
  FROM players p
  WHERE p.auth0_sub IS NOT NULL
    AND p.auth0_sub = l.auth0_sub
    AND l.player_id IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'vants_links: % vínculo(s) reatado(s) a su fila por identidad', n;
EXCEPTION
  WHEN undefined_table OR undefined_column THEN RAISE NOTICE 'vants_links: estructura inesperada, se omite';
END $$;

-- inventario final de vínculos (queda en el log del workflow)
SELECT platform, handle, verified,
       CASE WHEN player_id IS NULL THEN '(sin fila)'
            ELSE (SELECT username FROM players p WHERE p.id = vants_links.player_id) END AS ligado_a
FROM vants_links
ORDER BY platform, handle;
