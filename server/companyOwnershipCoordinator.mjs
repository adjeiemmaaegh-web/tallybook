/** Review-only server composition: no public HTTP routes, live pool or migrations. */
import {createSupabaseOwnershipSessionResolver,createPostgresAuthSessionReader} from './supabaseOwnershipSession.mjs';
import {createPostgresCompanyOwnershipStore} from './trustedCompanyOwnershipPostgres.mjs';
import {createTrustedCompanyOwnershipService} from './trustedCompanyOwnership.mjs';
import {createTrustedRecoveryIssuer} from './trustedRecoveryIssuer.mjs';
import {createRun2EvidenceService} from './run2EvidenceService.mjs';
const denied=()=>{throw Error('Company ownership integration is not configured');};
export function createCompanyOwnershipCoordinator({authClient,privatePool,restoreDrill,clock=Date.now}) {
  if(typeof privatePool?.connect!=='function'||typeof privatePool?.query!=='function'||
     typeof authClient?.auth?.getUser!=='function'||typeof clock!=='function')denied();
  const resolveSession=createSupabaseOwnershipSessionResolver({
    authClient,sessionReader:createPostgresAuthSessionReader(privatePool),clock,
  });
  const store=createPostgresCompanyOwnershipStore(privatePool);
  const ownership=createTrustedCompanyOwnershipService({sessionResolver:resolveSession,store,clock});
  // No injected arbitrary evidence/reviewer provider: both MUST be locked,
  // private SQL reads inside the same transaction as approval/audit creation.
  const issuer=createTrustedRecoveryIssuer({resolveReviewer:resolveSession,store,clock});
  const evidence=createRun2EvidenceService({resolveSession,store,restoreDrill,clock});
  return Object.freeze({
    requestRecoveryEvidence:args=>evidence.request(args),
    verifyRecoveryEvidence:args=>evidence.verify(args),
    revokeRecoveryEvidence:args=>evidence.revoke(args),
    bindExistingCompany:args=>ownership.bindExistingCompany(args),
    transferOwner:args=>ownership.transferOwner(args),
    issueRecoveryApproval:args=>issuer.issue(args),
  });
}
