/** Isolated composition; deliberately not mounted as an HTTP endpoint. */
import { createPostgresAuthSessionReader, createSupabaseOwnershipSessionResolver } from './supabaseOwnershipSession.mjs';
import { createCentralSaleIngestService } from './centralSaleIngest.mjs';
import { createPostgresCentralSaleIngestStore } from './centralSaleIngestPostgres.mjs';

export function createCentralSaleIngestCoordinator({authClient,privatePool,clock=Date.now}) {
  if(typeof authClient?.auth?.getUser!=='function' ||
     typeof privatePool?.query!=='function' || typeof privatePool?.connect!=='function' ||
     typeof clock!=='function')throw new Error('Central sale ingest coordinator is not configured');
  const resolveSession=createSupabaseOwnershipSessionResolver({
    authClient,sessionReader:createPostgresAuthSessionReader(privatePool),clock,
  });
  return createCentralSaleIngestService({resolveSession,
    store:createPostgresCentralSaleIngestStore(privatePool),clock});
}
