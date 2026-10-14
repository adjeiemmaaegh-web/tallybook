/**
 * Server-only composition root for opt-in company ownership operations.
 *
 * This module does not register HTTP routes, open database connections or
 * activate migrations. It must never be called from the browser.
 * Missing trusted authorization/evidence adapters deny by default.
 */
import { createSupabaseOwnershipSessionResolver, createPostgresAuthSessionReader } from './supabaseOwnershipSession.mjs';
import { createPostgresCompanyOwnershipStore } from './trustedCompanyOwnershipPostgres.mjs';
import { createTrustedCompanyOwnershipService } from './trustedCompanyOwnership.mjs';
import { createTrustedRecoveryIssuer } from './trustedRecoveryIssuer.mjs';

const denied = () => { throw Error('Company ownership integration is not configured'); };

export function createCompanyOwnershipCoordinator({
  authClient, privatePool, reviewerDirectory, evidenceDirectory, clock=Date.now,
}) {
  if (typeof privatePool?.connect !== 'function' ||
      typeof privatePool?.query !== 'function' ||
      typeof reviewerDirectory?.isAuthorizedReviewer !== 'function' ||
      typeof evidenceDirectory?.getVerifiedRecovery !== 'function' ||
      typeof authClient?.auth?.getUser !== 'function' || typeof clock !== 'function') denied();

  // getUser validates the Supabase access token. A live auth.sessions lookup
  // also rejects deleted/revoked sessions, before privileged mutations.
  const resolveSession = createSupabaseOwnershipSessionResolver({
    authClient, sessionReader: createPostgresAuthSessionReader(privatePool), clock,
  });
  const store = createPostgresCompanyOwnershipStore(privatePool);
  const ownership = createTrustedCompanyOwnershipService({
    sessionResolver: resolveSession, store, clock,
  });
  const issuer = createTrustedRecoveryIssuer({
    resolveReviewer: async accessToken => {
      const principal = await resolveSession(accessToken);
      const allowed = await reviewerDirectory.isAuthorizedReviewer(principal.userId);
      return Object.freeze({
        userId: principal.userId, active: principal.active,
        canApproveRecovery: allowed === true,
      });
    },
    // The evidence store must only return independently verified records.
    // Never pass the caller's JSON to this method as evidence.
    verifyRecovery: id => evidenceDirectory.getVerifiedRecovery(id),
    store, clock,
  });
  return Object.freeze({
    bindExistingCompany: args => ownership.bindExistingCompany(args),
    transferOwner: args => ownership.transferOwner(args),
    issueRecoveryApproval: args => issuer.issue(args),
  });
}
