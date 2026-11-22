import { describe, expect, it, vi } from "vitest";
import { AUTO_LOCK_CHOICES, AUTO_LOCK_DEFAULT_MINUTES, createIdleLocker, readAutoLockMinutes, saveAutoLockMinutes } from "./ledgerAutoLock";

const memory = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, raw: m }; };

describe("auto-lock setting", () => {
  it("defaults to 15 minutes (never off) when nothing, garbage or an unlisted value is stored, or storage is unavailable", () => {
    expect(AUTO_LOCK_DEFAULT_MINUTES).toBe(15);
    const s = memory();
    expect(readAutoLockMinutes("ledger-a", s)).toBe(15);
    for (const bad of ["abc", "7", "-5", "0.5", "15 ", "1e1", ""]) { s.raw.set("tallybook-ledger-autolock:ledger-a", bad); expect(readAutoLockMinutes("ledger-a", s), JSON.stringify(bad)).toBe(15); }
    expect(readAutoLockMinutes("x", null)).toBe(15);
    expect(readAutoLockMinutes("x", { getItem: () => { throw new Error("blocked"); }, setItem: () => undefined })).toBe(15);
  });
  it("saves only listed choices, per ledger, and verifies the write", () => {
    const s = memory();
    for (const m of AUTO_LOCK_CHOICES) { saveAutoLockMinutes("a", m, s); expect(readAutoLockMinutes("a", s)).toBe(m); }
    saveAutoLockMinutes("a", 5, s);
    expect(readAutoLockMinutes("b", s)).toBe(15); expect(readAutoLockMinutes("a", s)).toBe(5);
    for (const bad of [7, -1, 1.5, NaN, 1000]) expect(() => saveAutoLockMinutes("a", bad, s)).toThrow(/listed/);
    expect(() => saveAutoLockMinutes("a", 5, null)).toThrow(/cannot save/);
    expect(() => saveAutoLockMinutes("a", 5, { getItem: () => null, setItem: () => undefined })).toThrow(/could not be saved/);
  });
});

describe("idle locker", () => {
  const clock = () => { let t = 1_000_000; const timers: Array<{ at: number; fn: () => void; id: number }> = []; let id = 0;
    return { now: () => t, setTimer: (fn: () => void, ms: number) => { const x = { at: t + ms, fn, id: ++id }; timers.push(x); return x.id; },
      clearTimer: (h: unknown) => { const i = timers.findIndex(x => x.id === h); if (i >= 0) timers.splice(i, 1); },
      advance(ms: number) { t += ms; for (const x of [...timers].sort((a, b) => a.at - b.at)) if (x.at <= t) { timers.splice(timers.indexOf(x), 1); x.fn(); } }, pending: () => timers.length }; };
  it("fires once after the idle time, not before", () => {
    const c = clock(), onIdle = vi.fn(); const l = createIdleLocker({ timeoutMs: 60_000, onIdle, ...c }); l.start();
    c.advance(59_999); expect(onIdle).not.toHaveBeenCalled();
    c.advance(2); expect(onIdle).toHaveBeenCalledTimes(1);
    c.advance(10 * 60_000); expect(onIdle).toHaveBeenCalledTimes(1); expect(l.fired).toBe(true);
  });
  it("activity postpones the lock; each touch restarts the full period", () => {
    const c = clock(), onIdle = vi.fn(); const l = createIdleLocker({ timeoutMs: 60_000, onIdle, ...c }); l.start();
    c.advance(50_000); l.touch(); c.advance(50_000); expect(onIdle).not.toHaveBeenCalled();
    l.touch(); c.advance(59_000); expect(onIdle).not.toHaveBeenCalled();
    c.advance(2_000); expect(onIdle).toHaveBeenCalledTimes(1);
  });
  it("once fired, later interaction cannot cancel the lock; stopped lockers never fire", () => {
    const c = clock(), onIdle = vi.fn(); const l = createIdleLocker({ timeoutMs: 60_000, onIdle, ...c }); l.start();
    c.advance(61_000); l.touch(); c.advance(1_000); expect(onIdle).toHaveBeenCalledTimes(1);
    c.advance(10 * 60_000); l.check(); expect(onIdle).toHaveBeenCalledTimes(1);   // fires exactly once, ever
    const c2 = clock(), idle2 = vi.fn(); const l2 = createIdleLocker({ timeoutMs: 60_000, onIdle: idle2, ...c2 }); l2.start(); l2.stop(); c2.advance(10 * 60_000); expect(idle2).not.toHaveBeenCalled(); expect(c2.pending()).toBe(0);
  });
  it("a sleeping laptop / throttled tab: the REAL elapsed time is honoured the moment it wakes (check())", () => {
    let t = 0; const onIdle = vi.fn(); const l = createIdleLocker({ timeoutMs: 60_000, onIdle, now: () => t, setTimer: () => 1, clearTimer: () => undefined }); l.start();
    t = 5 * 3_600_000; l.check(); expect(onIdle).toHaveBeenCalledTimes(1);
  });
  it("refuses an absurdly short period", () => {
    for (const ms of [0, 999, NaN, -5]) expect(() => createIdleLocker({ timeoutMs: ms, onIdle: () => undefined })).toThrow(/too short/);
  });
});
