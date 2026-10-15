/** Opt-in Run 5 composition. No service-role credential in browser.
 * Activation requires separately approved private server and isolated RLS QA.
 */
import {createSupabaseOwnershipSessionResolver,
  createPostgresAuthSessionReader} from './supabaseOwnershipSession.mjs';
import {createRun3MembershipStore} from './run3MembershipPostgres.mjs';
import {createRun5TenantAuthorizer} from './run5TenantAuthorizer.mjs';
import {mountRun5TenantRoutes} from './run5TenantRoutes.mjs';
export function installRun5TenantRuntime({app,jsonParser,authClient,privatePool,
  operations,enabled=false,origin,clock=Date.now}={}){
  if(typeof app?.post!=='function'||typeof jsonParser!=='function')
    throw Error('Run 5 host unavailable');
  if(enabled!==true){
    mountRun5TenantRoutes(app,jsonParser,{enabled:false});
    return Object.freeze({enabled:false});
  }
  if(typeof authClient?.auth?.getUser!=='function'||
     typeof privatePool?.connect!=='function'||
     typeof privatePool?.query!=='function'||
     !operations||typeof operations!=='object'||Array.isArray(operations)||
     typeof origin!=='string'||!/^https:\/\/[^/\s?#]+$/.test(origin))
    throw Error('Run 5 private tenant runtime unavailable');
  const resolver=createSupabaseOwnershipSessionResolver({
    authClient,sessionReader:createPostgresAuthSessionReader(privatePool),clock
  });
  const store=createRun3MembershipStore(privatePool);
  const authorizer=createRun5TenantAuthorizer({resolveSession:resolver,store,clock});
  mountRun5TenantRoutes(app,jsonParser,{
    authorizer,operations,enabled:true,origin,clock
  });
  return Object.freeze({enabled:true});
}
