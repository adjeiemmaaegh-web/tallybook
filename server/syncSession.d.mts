export interface SyncSessionClaims { v: 1; aud: 'tallybook-sync-session'; actorId: string; sessionId: string; iat: number; exp: number }
export interface VerifiedSyncSession { readonly actorId: string; readonly sessionId: string }
export function validateSyncSessionClaims(claims: unknown, now?: number): VerifiedSyncSession;
export function verifySyncSession(header: unknown, secret: unknown, now?: number): VerifiedSyncSession;
export function authorizeActiveSyncSession(session: VerifiedSyncSession, store: { getSession(id: string): Promise<unknown> }): Promise<string>;
export const disabledSyncSessionStore: { getSession(id: string): Promise<never> };
