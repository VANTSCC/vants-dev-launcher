-- ============================================================
-- estado-db.sql — lo ejecuta el workflow neon-migrate.yml para publicar
-- estado-db.json en la rama estado-db (verificación del estado real de
-- la base sin exponer credenciales).
-- psql -At -f docs/estado-db.sql  →  una línea JSON
-- ============================================================

DO $$
DECLARE v jsonb;
BEGIN
  v := jsonb_build_object('generado', to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'));
  v := jsonb_set(v, '{tablas}', (SELECT coalesce(jsonb_object_agg(relname, n_live_tup), '{}'::jsonb) FROM pg_stat_user_tables WHERE schemaname = 'public'));

  BEGIN
    v := jsonb_set(v, '{faceit_matches_recientes}', (SELECT coalesce(jsonb_agg(j), '[]'::jsonb) FROM (SELECT jsonb_build_object('match_id', faceit_match_id, 'resultado', result, 'xp', xp_awarded, 'jugado', played_at) j FROM faceit_matches ORDER BY played_at DESC LIMIT 10) s));
  EXCEPTION WHEN undefined_table THEN v := jsonb_set(v, '{faceit_matches_recientes}', 'null'::jsonb);
  END;

  BEGIN
    v := jsonb_set(v, '{faceit_webhook_events}', jsonb_build_object(
      'filas', (SELECT count(*) FROM faceit_webhook_events),
      'ultimos', (SELECT coalesce(jsonb_agg(j), '[]'::jsonb) FROM (SELECT jsonb_build_object('tipo', event_type, 'fecha', created_at, 'muestra', left(payload::text, 500)) j FROM faceit_webhook_events ORDER BY created_at DESC LIMIT 6) s)));
  EXCEPTION WHEN undefined_table OR undefined_column THEN v := jsonb_set(v, '{faceit_webhook_events}', 'null'::jsonb);
  END;

  BEGIN
    v := jsonb_set(v, '{players_con_xp}', to_jsonb((SELECT count(*) FROM players WHERE xp > 0)));
  EXCEPTION WHEN undefined_column THEN v := jsonb_set(v, '{players_con_xp}', 'null'::jsonb);
  END;

  BEGIN
    v := jsonb_set(v, '{vants_links_faceit}', to_jsonb((SELECT count(*) FROM vants_links WHERE platform = 'faceit')));
  EXCEPTION WHEN undefined_table THEN v := jsonb_set(v, '{vants_links_faceit}', 'null'::jsonb);
  END;

  -- perfil del dueño identificado por ROL (role = 'owner'), nunca por email:
  -- este SQL alimenta un JSON público (rama estado-db + MCP), cero PII.
  BEGIN
    v := jsonb_set(v, '{perfil_dueno}', (SELECT coalesce(jsonb_agg(j), 'null'::jsonb) FROM (SELECT jsonb_build_object('username', username, 'xp', xp, 'rating', round(rating::numeric, 3)) j FROM players WHERE role = 'owner' LIMIT 1) s));
  EXCEPTION WHEN undefined_table OR undefined_column THEN v := jsonb_set(v, '{perfil_dueno}', 'null'::jsonb);
  END;

  -- jugadores reales de la sala (SIN email y sub enmascarado: identificación sin exponer identidad)
  BEGIN
    v := jsonb_set(v, '{jugadores}', (SELECT coalesce(jsonb_agg(j), '[]'::jsonb) FROM (
      SELECT jsonb_build_object(
        'username', username,
        'nombre', display_name,
        'sub', CASE WHEN auth0_sub IS NULL THEN NULL ELSE left(auth0_sub, 20) || '…' END,
        'rol', role,
        'verificado', verified,
        'rating', round(rating::numeric, 3),
        'xp', xp,
        'creado', to_char(created_at AT TIME ZONE 'utc', 'YYYY-MM-DD'),
        'cuentas', jsonb_build_object(
          'discord_tag', stats->>'discord_tag',
          'riot', stats->>'riot',
          'kick', stats->>'kick',
          'tiktok', stats->>'tiktok',
          'x', stats->>'x',
          'youtube', stats->>'youtube',
          'faceit', stats->>'faceit',
          'steam', stats->>'steam'
        )
      ) j FROM players ORDER BY created_at) s));
  EXCEPTION WHEN undefined_table OR undefined_column THEN v := jsonb_set(v, '{jugadores}', 'null'::jsonb);
  END;

  -- vínculos de cuentas (Discord/Kick/etc.) para auditar fantasmas
  BEGIN
    v := jsonb_set(v, '{vants_links_resumen}', (SELECT coalesce(jsonb_agg(j), '[]'::jsonb) FROM (
      SELECT jsonb_build_object(
        'plataforma', platform,
        'handle', handle,
        'sub', CASE WHEN auth0_sub IS NULL THEN NULL ELSE left(auth0_sub, 20) || '…' END,
        'ligado_a', CASE WHEN player_id IS NULL THEN NULL
                         ELSE (SELECT username FROM players p WHERE p.id = vants_links.player_id) END,
        'verificado', verified
      ) j FROM vants_links ORDER BY platform) s));
  EXCEPTION WHEN undefined_table OR undefined_column THEN v := jsonb_set(v, '{vants_links_resumen}', 'null'::jsonb);
  END;

  BEGIN
    v := jsonb_set(v, '{esquema}', (SELECT coalesce(jsonb_object_agg(t || '.' || c, jsonb_build_object('tipo', tipo, 'nullable', nul, 'default', coalesce(def, ''))), '{}'::jsonb) FROM (
      SELECT table_name t, column_name c, data_type tipo, is_nullable nul, column_default def FROM information_schema.columns
      WHERE table_name IN ('players', 'season_player_stats', 'vants_links', 'faceit_webhook_events', 'faceit_matches')
    ) s));
  EXCEPTION WHEN OTHERS THEN v := jsonb_set(v, '{esquema}', 'null'::jsonb);
  END;

  CREATE TEMP TABLE estado_salida (j jsonb);
  INSERT INTO estado_salida VALUES (v);
END $$;

SELECT j FROM estado_salida;
