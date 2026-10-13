import type { CrossTabLockManager } from './crossTabDataLock.mjs';
export function withRetailWriteLock<T>(work: () => Promise<T> | T, inExistingTransaction?: boolean, manager?: CrossTabLockManager): Promise<T>;
