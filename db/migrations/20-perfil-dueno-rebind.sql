-- ============================================================
-- 20-perfil-dueno-rebind.sql
-- El perfil del dueño (fila feispla) quedó huérfano tras las
-- migraciones de limpieza: auth0_sub y email vacíos y el nombre
-- cortado a "FEIS". Esto lo re-liga a su sesión real y le devuelve
-- el nombre completo. No borra ni duplica nada: la fila es única
-- (players = 1) y conserva xp, rating, equipo y vínculos.
-- Idempotente.
-- ============================================================

UPDATE players
SET auth0_sub = 'google-oauth2|103921098105477052247',
    email = 'geimerjhoan099@gmail.com',
    display_name = 'FEISPLA',
    updated_at = now()
WHERE username = 'feispla'
  AND (auth0_sub IS NULL OR auth0_sub = '' OR email IS NULL OR email = '' OR display_name = 'FEIS');

-- Seguridad: si por lo que sea el sub estaba en otra fila, se desliga
-- (no puede haber dos filas con el mismo sub: hay índice único parcial).
UPDATE players
SET auth0_sub = NULL
WHERE auth0_sub = 'google-oauth2|103921098105477052247'
  AND username <> 'feispla';

-- Vínculo FACEIT del dueño: asegura que apunte a la fila real
UPDATE vants_links
SET player_id = (SELECT id FROM players WHERE username = 'feispla' LIMIT 1)
WHERE platform = 'faceit'
  AND auth0_sub = 'google-oauth2|103921098105477052247';

-- Inventario (log del workflow)
SELECT username, display_name, auth0_sub IS NOT NULL AS con_sesion, email, role, xp
FROM players ORDER BY created_at;
