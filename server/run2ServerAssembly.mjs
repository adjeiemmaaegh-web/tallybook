import {createCompanyOwnershipCoordinator} from './companyOwnershipCoordinator.mjs';
import {mountRun2OwnershipRoutes} from './run2OwnershipRoutes.mjs';

/** Runtime assembly for an approved isolated environment.
 * Uses server-only Supabase Auth and private PostgreSQL pool supplied by host.
 * No service-role key, SQL connection or reviewer key belongs in the browser.
 */
export function installRun2OwnershipRuntime({
  app,jsonParser,authClient,privatePool,restoreDrill,
  allowedOrigin,enabled=false,clock=Date.now
}){
  if(enabled!==true){
    mountRun2OwnershipRoutes(app,jsonParser,{enabled:false});
    return Object.freeze({enabled:false});
  }
  if(typeof privatePool?.connect!=='function'||
     typeof privatePool?.query!=='function'||
     typeof authClient?.auth?.getUser!=='function'||
     typeof allowedOrigin!=='string'||!allowedOrigin.startsWith('https://'))
    throw Error('Run 2 private runtime is not configured');
  const coordinator=createCompanyOwnershipCoordinator({authClient,privatePool,
    restoreDrill,clock});
  const evidence=Object.freeze({
    request:args=>coordinator.requestRecoveryEvidence(args),
    verify:args=>coordinator.verifyRecoveryEvidence(args),
    revoke:args=>coordinator.revokeRecoveryEvidence(args)
  });
  mountRun2OwnershipRoutes(app,jsonParser,{
    coordinator,evidence,allowedOrigin,enabled:true
  });
  return Object.freeze({enabled:true});
}
