/** Run 3 injected composition for an explicitly approved disposable environment.
 * No automatic PostgreSQL connection, service-role key or production enablement.
 */
import {createSupabaseOwnershipSessionResolver,createPostgresAuthSessionReader}
  from './supabaseOwnershipSession.mjs';
import {createRun3MembershipStore} from './run3MembershipPostgres.mjs';
import {createRun3MembershipService} from './run3MembershipService.mjs';
import {mountRun3MembershipRoutes} from './run3MembershipRoutes.mjs';
export function installRun3MembershipRuntime({app,jsonParser,authClient,privatePool,
  enabled=false,allowedOrigin,clock=Date.now}={}){
  if(!app||typeof jsonParser!=='function')
    throw Error('Run 3 route host required');
  if(enabled!==true){
    mountRun3MembershipRoutes(app,jsonParser,{enabled:false});
    return Object.freeze({enabled:false});
  }
  if(typeof privatePool?.connect!=='function'||typeof privatePool?.query!=='function'||
     typeof authClient?.auth?.getUser!=='function'||
     typeof allowedOrigin!=='string'||!/^https:\/\/[^/\s?#]+$/.test(allowedOrigin))
    throw Error('Run 3 private authenticated runtime unavailable');
  const resolveSession=createSupabaseOwnershipSessionResolver({
    authClient,sessionReader:createPostgresAuthSessionReader(privatePool),clock});
  const store=createRun3MembershipStore(privatePool);
  const service=createRun3MembershipService({resolveSession,store,clock});
  mountRun3MembershipRoutes(app,jsonParser,{service,enabled:true,allowedOrigin,clock});
  return Object.freeze({enabled:true});
}
