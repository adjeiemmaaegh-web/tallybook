import { describe, expect, it, vi } from "vitest";
import type { TallybookDB } from "@/db/TallybookDB";
import { authorizeSensitiveOperation, type StepUpDeps } from "./stepUpGate";
import { StepUpError, type StepUpState } from "./webauthnStepUp.mjs";

const db = {} as TallybookDB;
const key = { credentialId: "k1", publicKeyJwk: {}, signCount: 0 };
const state = (o: Partial<StepUpState> = {}): StepUpState => ({ credentials: [key], requireForSensitive: true, recoveryCodeConfigured: true, passphraseConfigured: true, ...o });
const deps = (s: StepUpState, over: Partial<StepUpDeps> = {}) => ({ confirmKey: vi.fn(async () => true as const), verifyCode: vi.fn(async () => true), loadState: () => s, ...over }) as unknown as StepUpDeps & { confirmKey: ReturnType<typeof vi.fn>; verifyCode: ReturnType<typeof vi.fn> };

describe("step-up gate", () => {
  it("not required or no key enrolled: allowed with no key prompt and no recovery check", async () => {
    for (const s of [state({ requireForSensitive: false }), state({ credentials: [] })]) {
      const d = deps(s); const r = await authorizeSensitiveOperation("disable-encryption", { businessId: "b", db }, d);
      expect(r.allowed).toBe(true); expect(d.confirmKey).not.toHaveBeenCalled(); expect(d.verifyCode).not.toHaveBeenCalled();
    }
  });
  it("required: a verified key allows; a failed or cancelled key is refused and says how to recover", async () => {
    let d = deps(state()); expect((await authorizeSensitiveOperation("rotate-data-key", { businessId: "b", db }, d))).toMatchObject({ allowed: true, via: "security-key" });
    d = deps(state(), { confirmKey: vi.fn(async () => { throw new StepUpError("x", "bad-signature"); }) as never });
    let r = await authorizeSensitiveOperation("rotate-data-key", { businessId: "b", db }, d); expect(r.allowed).toBe(false); expect(r.reason).toMatch(/recovery code/i);
    d = deps(state(), { confirmKey: vi.fn(async () => { throw new StepUpError("x", "cancelled"); }) as never });
    r = await authorizeSensitiveOperation("rotate-data-key", { businessId: "b", db }, d); expect(r.allowed).toBe(false); expect(r.reason).toMatch(/cancelled/i);
  });
  it("required: a correct recovery code is the alternative (no key touch, audited); a wrong one is refused", async () => {
    let d = deps(state()); const ok = await authorizeSensitiveOperation("disable-encryption", { businessId: "b", db, recoveryCode: "CODE" }, d);
    expect(ok).toMatchObject({ allowed: true, via: "recovery-code", audit: "key-bypass-with-recovery-code" }); expect(d.confirmKey).not.toHaveBeenCalled();
    d = deps(state(), { verifyCode: vi.fn(async () => false) as never });
    const bad = await authorizeSensitiveOperation("disable-encryption", { businessId: "b", db, recoveryCode: "WRONG" }, d);
    expect(bad.allowed).toBe(false); expect(d.confirmKey).not.toHaveBeenCalled();
  });
  it("an unconfigured recovery code is never an alternative", async () => {
    const d = deps(state()); const r = await authorizeSensitiveOperation("disable-encryption", { businessId: "b", db, recoveryCode: "CODE", recoveryCodeConfigured: false }, d);
    expect(r.allowed).toBe(false);
  });
  it("operations that are not sensitive are never gated", async () => {
    const d = deps(state()); expect((await authorizeSensitiveOperation("sell", { businessId: "b", db }, d)).allowed).toBe(true); expect(d.confirmKey).not.toHaveBeenCalled();
  });
});
