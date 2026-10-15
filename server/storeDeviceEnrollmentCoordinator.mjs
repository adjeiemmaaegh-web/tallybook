/** Stage 9 review-only composition for the private ownership authentication and
 * device enrollment data path. No browser or HTTP route can instantiate it.
 * Only a trusted, isolated server with a privileged PostgreSQL pool may use it.
 */
import {createPostgresAuthSessionReader, createSupabaseOwnershipSessionResolver} from './supabaseOwnershipSession.mjs';
import {createPostgresStoreDeviceEnrollmentStore} from './storeDeviceEnrollmentPostgres.mjs';
import {createStoreDeviceEnrollmentService} from './storeDeviceEnrollment.mjs';

export function createStoreDeviceEnrollmentCoordinator({authClient,privatePool,clock=Date.now}) {
  if(typeof authClient?.auth?.getUser !== 'function' ||
     typeof privatePool?.connect !== 'function' ||
     typeof privatePool?.query !== 'function' || typeof clock !== 'function')
    throw Error('Private enrollment coordinator not configured');
  const resolveSession=createSupabaseOwnershipSessionResolver({
    authClient,sessionReader:createPostgresAuthSessionReader(privatePool),clock,
  });
  const store=createPostgresStoreDeviceEnrollmentStore(privatePool);
  return createStoreDeviceEnrollmentService({resolveSession,store,clock});
}
