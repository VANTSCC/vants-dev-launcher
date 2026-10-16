-- ============================================================
-- 11-faceit-backfill-fe1ss.sql
-- Vincula la cuenta FACEIT del dueño (FE1SS) al perfil feispla y hace
-- backfill de sus partidas REALES de CS2 (historial de la Data API,
-- 30 partidas en orden cronologico).
-- Idempotente: el vinculo usa ON CONFLICT y cada partida pasa por
-- faceit_aplicar_resultado (UNIQUE faceit_match_id): reejecutar no
-- duplica XP ni rating.
-- ============================================================

-- 1) vinculo FACEIT -> jugador (feispla)
INSERT INTO vants_links (auth0_sub, player_id, platform, handle, platform_user_id, verified)
VALUES ('google-oauth2|103921098105477052247', 'f6ee739f-8ddf-4afd-8319-6e636d3bca80', 'faceit', 'FE1SS', '9da58205-604f-4fd7-bc58-a3fc3fd4d578', true)
ON CONFLICT (auth0_sub, platform) DO UPDATE
  SET player_id = EXCLUDED.player_id, handle = EXCLUDED.handle,
      platform_user_id = EXCLUDED.platform_user_id, verified = true;

-- 2) backfill de partidas reales (cronologico)
DO $$
BEGIN
  PERFORM faceit_aplicar_resultado('f6ee739f-8ddf-4afd-8319-6e636d3bca80', '1-0194c058-aa93-41b7-821d-3b9776097d9b', 'cs2', 'loss', to_timestamp(1782021753), NULL);
  PERFORM faceit_aplicar_resultado('f6ee739f-8ddf-4afd-8319-6e636d3bca80', '1-d2cf4cb8-9ca9-4095-bcd4-4139ac91cdb4', 'cs2', 'win', to_timestamp(1782080562), NULL);
  PERFORM faceit_aplicar_resultado('f6ee739f-8ddf-4afd-8319-6e636d3bca80', '1-cd462ecc-3bbe-45fb-b877-7300ca1e338e', 'cs2', 'loss', to_timestamp(1782082909), NULL);
  PERFORM faceit_aplicar_resultado('f6ee739f-8ddf-4afd-8319-6e636d3bca80', '1-58a60ef3-b0ca-4c27-8299-464a264ed29c', 'cs2', 'loss', to_timestamp(1782089748), NULL);
  PERFORM faceit_aplicar_resultado('f6ee739f-8ddf-4afd-8319-6e636d3bca80', '1-abc7655b-ca0a-43ac-97a8-5b8d893ff356', 'cs2', 'loss', to_timestamp(1782186161), NULL);
  PERFORM faceit_aplicar_resultado('f6ee739f-8ddf-4afd-8319-6e636d3bca80', '1-e2dbafdf-3ad9-4fc5-b11f-5180bed34be2', 'cs2', 'loss', to_timestamp(1782188924), NULL);
  PERFORM faceit_aplicar_resultado('f6ee739f-8ddf-4afd-8319-6e636d3bca80', '1-6d881832-a7b9-491e-ae53-84b0102d8619', 'cs2', 'win', to_timestamp(1782227442), NULL);
  PERFORM faceit_aplicar_resultado('f6ee739f-8ddf-4afd-8319-6e636d3bca80', '1-7ac8a0ec-42e1-4c27-b62b-3fac44768eeb', 'cs2', 'win', to_timestamp(1782230515), NULL);
  PERFORM faceit_aplicar_resultado('f6ee739f-8ddf-4afd-8319-6e636d3bca80', '1-2aa82b7a-4402-474d-bcc1-88d2b035a812', 'cs2', 'loss', to_timestamp(1782233267), NULL);
  PERFORM faceit_aplicar_resultado('f6ee739f-8ddf-4afd-8319-6e636d3bca80', '1-c48bb919-c285-496e-acff-c1e6b4ba279a', 'cs2', 'loss', to_timestamp(1782589923), NULL);
  PERFORM faceit_aplicar_resultado('f6ee739f-8ddf-4afd-8319-6e636d3bca80', '1-b9eafa0d-9b85-46f6-a6ef-25a2b21aa4e7', 'cs2', 'win', to_timestamp(1782595412), NULL);
  PERFORM faceit_aplicar_resultado('f6ee739f-8ddf-4afd-8319-6e636d3bca80', '1-6cbe88f4-faee-499f-9542-f995b0bfc73f', 'cs2', 'loss', to_timestamp(1782597638), NULL);
  PERFORM faceit_aplicar_resultado('f6ee739f-8ddf-4afd-8319-6e636d3bca80', '1-bd76abdf-8766-4ff4-abf6-3593439e88dd', 'cs2', 'win', to_timestamp(1782601528), NULL);
  PERFORM faceit_aplicar_resultado('f6ee739f-8ddf-4afd-8319-6e636d3bca80', '1-f0f89774-452c-4ac0-8e40-5c1c0fc2c824', 'cs2', 'loss', to_timestamp(1782612511), NULL);
  PERFORM faceit_aplicar_resultado('f6ee739f-8ddf-4afd-8319-6e636d3bca80', '1-5da099db-3722-451c-9e9b-9f440218a607', 'cs2', 'loss', to_timestamp(1782754184), NULL);
  PERFORM faceit_aplicar_resultado('f6ee739f-8ddf-4afd-8319-6e636d3bca80', '1-757ef986-2b9a-4f7c-b73b-9e070834c080', 'cs2', 'loss', to_timestamp(1782758115), NULL);
  PERFORM faceit_aplicar_resultado('f6ee739f-8ddf-4afd-8319-6e636d3bca80', '1-4cf17eb4-220b-4ce0-83a8-6132c0f6ba7b', 'cs2', 'loss', to_timestamp(1782761082), NULL);
  PERFORM faceit_aplicar_resultado('f6ee739f-8ddf-4afd-8319-6e636d3bca80', '1-8887873e-2007-4213-b0e9-fc88d3bb6264', 'cs2', 'loss', to_timestamp(1782932261), NULL);
  PERFORM faceit_aplicar_resultado('f6ee739f-8ddf-4afd-8319-6e636d3bca80', '1-f695cd9e-e062-4da6-9835-72fc11fac715', 'cs2', 'loss', to_timestamp(1782936606), NULL);
  PERFORM faceit_aplicar_resultado('f6ee739f-8ddf-4afd-8319-6e636d3bca80', '1-e51533f3-ae94-4681-a16a-00ad61a7783d', 'cs2', 'win', to_timestamp(1783030244), NULL);
  PERFORM faceit_aplicar_resultado('f6ee739f-8ddf-4afd-8319-6e636d3bca80', '1-d9e1da00-6ee8-43da-8806-4b86543c9414', 'cs2', 'loss', to_timestamp(1783033521), NULL);
  PERFORM faceit_aplicar_resultado('f6ee739f-8ddf-4afd-8319-6e636d3bca80', '1-9df54ebf-54b4-42bf-bdf3-aac50b2efe74', 'cs2', 'loss', to_timestamp(1783036521), NULL);
  PERFORM faceit_aplicar_resultado('f6ee739f-8ddf-4afd-8319-6e636d3bca80', '1-c2b22ae8-50fc-4a7b-90be-0a14c987f3da', 'cs2', 'loss', to_timestamp(1783193462), NULL);
  PERFORM faceit_aplicar_resultado('f6ee739f-8ddf-4afd-8319-6e636d3bca80', '1-8dad16b3-c453-4c3a-a499-4eea5f172920', 'cs2', 'loss', to_timestamp(1783388259), NULL);
  PERFORM faceit_aplicar_resultado('f6ee739f-8ddf-4afd-8319-6e636d3bca80', '1-ca2c0bc1-f4fb-4f6f-a05c-68e24a2c5e75', 'cs2', 'loss', to_timestamp(1783550782), NULL);
  PERFORM faceit_aplicar_resultado('f6ee739f-8ddf-4afd-8319-6e636d3bca80', '1-166a9af8-a744-44bd-930a-43b85f258e1d', 'cs2', 'loss', to_timestamp(1783664713), NULL);
  PERFORM faceit_aplicar_resultado('f6ee739f-8ddf-4afd-8319-6e636d3bca80', '1-64abc8cb-4c0c-41de-a6a3-96184039a1ec', 'cs2', 'loss', to_timestamp(1784189813), NULL);
  PERFORM faceit_aplicar_resultado('f6ee739f-8ddf-4afd-8319-6e636d3bca80', '1-d0b2f651-a9fe-4a40-9857-e22eacf5a7ac', 'cs2', 'loss', to_timestamp(1784919718), NULL);
  PERFORM faceit_aplicar_resultado('f6ee739f-8ddf-4afd-8319-6e636d3bca80', '1-6f7ff50d-ac49-47e8-942a-e6439ba46ad1', 'cs2', 'win', to_timestamp(1788228839), NULL);
  PERFORM faceit_aplicar_resultado('f6ee739f-8ddf-4afd-8319-6e636d3bca80', '1-63b6ff6e-a822-4dba-973d-e7fbb33eac58', 'cs2', 'win', to_timestamp(1791072477), NULL);
END $$;

-- Resumen del backfill (queda en el log)
SELECT username, xp, round(rating::numeric,3) AS rating FROM players WHERE id = 'f6ee739f-8ddf-4afd-8319-6e636d3bca80';
