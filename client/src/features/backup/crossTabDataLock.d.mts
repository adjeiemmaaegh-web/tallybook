export const TWO_DATABASE_LOCK_NAME: string;
export type CrossTabDataLockMode = 'shared' | 'exclusive';
export interface CrossTabLockManager {
  request<T>(name: string, options: {mode: CrossTabDataLockMode; ifAvailable: true}, callback: (lock: unknown | null) => Promise<T>): Promise<T>;
}
export function withCrossTabDataLock<T>(mode: CrossTabDataLockMode, work: () => Promise<T> | T, manager?: CrossTabLockManager): Promise<T>;
