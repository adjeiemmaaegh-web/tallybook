/** Isolated UUID-ownership composition; deliberately not mounted as HTTP. */
import { createPostgresAuthSessionReader, createSupabaseOwnershipSessionResolver } from './supabaseOwnershipSession.mjs';
import { createCentralSaleIngestService } from './centralSaleIngest.mjs';
import { createUuidPostgresCentralSaleIngestStore } from './centralSaleIngestUuidPostgres.mjs';

export function createCentralSaleUuidIngestCoordinator({authClient,privatePool,clock=Date.now}) {
  if(typeof authClient?.auth?.getUser!=='function'||typeof privatePool?.connect!=='function'||
     typeof privatePool?.query!=='function'||typeof clock!=='function')
    throw new Error('UUID central sale ingest coordinator is not configured');
  return createCentralSaleIngestService({
    resolveSession:createSupabaseOwnershipSessionResolver({authClient,
      sessionReader:createPostgresAuthSessionReader(privatePool),clock}),
    store:createUuidPostgresCentralSaleIngestStore(privatePool),clock,
  });
}
