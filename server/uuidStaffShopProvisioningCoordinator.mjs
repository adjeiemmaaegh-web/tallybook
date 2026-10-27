/** Isolated composition; no route mounts this provisioning service. */
import {createPostgresAuthSessionReader,createSupabaseOwnershipSessionResolver} from './supabaseOwnershipSession.mjs';
import {createUuidStaffShopProvisioningService} from './uuidStaffShopProvisioning.mjs';
import {createUuidStaffShopProvisioningStore} from './uuidStaffShopProvisioningPostgres.mjs';

export function createUuidStaffShopProvisioningCoordinator({authClient,privatePool,clock=Date.now}) {
  if(typeof authClient?.auth?.getUser!=='function'||typeof privatePool?.query!=='function'||
     typeof privatePool?.connect!=='function'||typeof clock!=='function')
    throw Error('Staff/shop provisioning coordinator is not configured');
  return createUuidStaffShopProvisioningService({
    resolveSession:createSupabaseOwnershipSessionResolver({authClient,
      sessionReader:createPostgresAuthSessionReader(privatePool),clock}),
    store:createUuidStaffShopProvisioningStore(privatePool),clock,
  });
}
