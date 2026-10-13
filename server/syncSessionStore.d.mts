export type SyncSessionRecord = Readonly<{ id: string; actorId: string; status: 'active' | 'revoked' }>;
export type SyncSessionStore = Readonly<{ getSession(id: string): Promise<SyncSessionRecord | null> }>;
export declare function validateSyncSessionSnapshot(input: unknown): Map<string, SyncSessionRecord>;
export declare function createReadOnlySessionSnapshot(input: unknown): SyncSessionStore;
export declare function createReadOnlyFileSessionStore(filename: string): SyncSessionStore;
