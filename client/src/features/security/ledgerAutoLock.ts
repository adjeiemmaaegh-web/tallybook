/**
 * Idle auto-lock for an encrypted ledger (ST24-05 remainder). The unlocked ledger's keys live in this tab's memory, so
 * leaving a device unattended should not leave records readable. Default: lock after 15 minutes without interaction.
 * The choice is a clear device setting (it holds no secret). Locking only overwrites in-memory keys; nothing on disk changes.
 */
export const AUTO_LOCK_CHOICES = [0, 1, 5, 15, 30, 60] as const; // minutes; 0 = never
export type AutoLockMinutes = (typeof AUTO_LOCK_CHOICES)[number];
export const AUTO_LOCK_DEFAULT_MINUTES: AutoLockMinutes = 15;
const KEY_PREFIX = "tallybook-ledger-autolock:";
type Store = Pick<Storage, "getItem" | "setItem">;
const safeStore = (): Store | null => { try { return localStorage; } catch { return null; } };

/** Missing, unreadable or invalid settings mean the SAFE default (15 minutes), never "off". */
export function readAutoLockMinutes(scope: string, storage: Store | null = safeStore()): AutoLockMinutes {
  try {
    const raw = storage?.getItem(KEY_PREFIX + scope);
    if (raw === null || raw === undefined) return AUTO_LOCK_DEFAULT_MINUTES;
    const n = Number(raw);
    return (AUTO_LOCK_CHOICES as readonly number[]).includes(n) && String(n) === raw ? (n as AutoLockMinutes) : AUTO_LOCK_DEFAULT_MINUTES;
  } catch { return AUTO_LOCK_DEFAULT_MINUTES; }
}
export function saveAutoLockMinutes(scope: string, minutes: number, storage: Store | null = safeStore()): void {
  if (!(AUTO_LOCK_CHOICES as readonly number[]).includes(minutes)) throw new Error("Choose one of the listed auto-lock times.");
  if (!storage) throw new Error("This browser cannot save the auto-lock setting.");
  storage.setItem(KEY_PREFIX + scope, String(minutes));
  if (storage.getItem(KEY_PREFIX + scope) !== String(minutes)) throw new Error("The auto-lock setting could not be saved.");
}

export interface IdleLockerOptions {
  timeoutMs: number; onIdle: () => void;
  now?: () => number; setTimer?: (fn: () => void, ms: number) => unknown; clearTimer?: (t: unknown) => void;
}
/** Deadline-based (not tick-counting): correct after a sleeping laptop or a throttled background tab. Fires at most once. */
export function createIdleLocker(o: IdleLockerOptions) {
  if (!Number.isFinite(o.timeoutMs) || o.timeoutMs < 1000) throw new Error("Auto-lock time is too short.");
  const now = o.now ?? Date.now, setT = o.setTimer ?? ((f, ms) => setTimeout(f, ms)), clearT = o.clearTimer ?? (t => clearTimeout(t as ReturnType<typeof setTimeout>));
  let last = now(), timer: unknown, fired = false, stopped = false;
  const schedule = (ms: number) => { if (timer !== undefined) clearT(timer); timer = setT(check, Math.max(250, ms)); };
  function check() {
    if (stopped || fired) return;
    const idle = now() - last;
    if (idle >= o.timeoutMs) { fired = true; if (timer !== undefined) clearT(timer); o.onIdle(); } else schedule(o.timeoutMs - idle);
  }
  return {
    start() { last = now(); fired = false; stopped = false; schedule(o.timeoutMs); },
    /** User interaction. After the lock has fired, interaction can no longer cancel it. */
    touch() { if (!fired && !stopped) last = now(); },
    check,
    stop() { stopped = true; if (timer !== undefined) clearT(timer); },
    get fired() { return fired; },
  };
}
