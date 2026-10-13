import Dexie from 'dexie';
import { withRetailWriteLock } from './retailWriteLock.mjs';

/**
 * Public mutation entrypoints call this before opening a write transaction.
 * Dexie callers that already own a transaction must not await another Web Lock
 * inside it (the outer caller is responsible for recovery coordination).
 */
export function withCoordinatedRetailWrite<T>(work: () => Promise<T> | T): Promise<T> {
  return withRetailWriteLock(work, Boolean(Dexie.currentTransaction));
}
