/** Run 5 private wiring for an explicitly authorized isolated server.
 * The actual running app always mounts the disabled adapter; this function
 * cannot silently enable itself from a browser flag or cloud sign-in.
 */
import {createSupabaseOwnershipSessionResolver,
  createPostgresAuthSessionReader} from './supabaseOwnershipSession.mjs';
import {createRun5TenantPostgresStore} from './run5TenantPostgres.mjs';
import {createRun5TenantDataService} from './run5TenantDataService.mjs';
import {mountRun5TenantRoutes} from './run5TenantRoutes.mjs';
export function installRun5TenantRuntime({app,jsonParser,authClient,privatePool,
  allowedOrigin,enabled=false,clock=Date.now}={}){
  if(typeof app?.post!=='function'||typeof jsonParser!=='function')
    throw Error('Run 5 private route host not configured');
  if(enabled!==true){
    mountRun5TenantRoutes(app,jsonParser,{enabled:false});
    return Object.freeze({enabled:false});
  }
  if(typeof authClient?.auth?.getUser!=='function'||
     typeof privatePool?.connect!=='function'||typeof privatePool?.query!=='function'||
     typeof allowedOrigin!=='string'||!/^https:\/\/[^/?#\s]+$/.test(allowedOrigin))
    throw Error('Run 5 private session and tenant database not configured');
  const resolveSession=createSupabaseOwnershipSessionResolver({
    authClient,sessionReader:createPostgresAuthSessionReader(privatePool),clock});
  const store=createRun5TenantPostgresStore(privatePool);
  const service=createRun5TenantDataService({resolveSession,store,clock});
  mountRun5TenantRoutes(app,jsonParser,{enabled:true,service,allowedOrigin,clock});
  return Object.freeze({enabled:true});
}
