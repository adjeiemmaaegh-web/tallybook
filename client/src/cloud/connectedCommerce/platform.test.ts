import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ callShop: vi.fn() }));
vi.mock("../shopClient", () => ({
  callShop: m.callShop,
  ShopRejectedError: class ShopRejectedError extends Error {},
  ShopUnreachableError: class ShopUnreachableError extends Error {},
}));
import { ShopRejectedError, ShopUnreachableError } from "../shopClient";
import { CcError, getCcStatus, grantCcConsent, nextTrackAction, parseCcError, revokeCcConsent, setCcFlag, submitCcVerification, type CcTrackState } from "./platform";

const state = (over: Partial<CcTrackState> = {}): CcTrackState => ({ track: "discover", consent: "none", consentVersion: null,
  currentConsentVersion: null, flagEnabled: false, flagVersion: 0, killed: false, effective: false, ...over });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
beforeEach(() => m.callShop.mockReset());

describe("platform client contract", () => {
  it("always targets the owner-only platform RPC and generates a fresh operation key per mutation", async () => {
    m.callShop.mockResolvedValue({ tracks: {}, verification: {}, publicationDefault: "off" });
    await grantCcConsent("c1", "discover", "v1"); await grantCcConsent("c1", "discover", "v1");
    await revokeCcConsent("c1", "supply"); await setCcFlag("c1", "network", true, 3); await submitCcVerification("c1", "Ama Stores", "doc-1");
    for (const call of m.callShop.mock.calls) expect(call[2]).toBe("tallybook_cc_platform");
    const keys = m.callShop.mock.calls.slice(0, 2).map(c => c[1].operationKey as string);
    expect(keys[0]).toMatch(UUID); expect(keys[0]).not.toBe(keys[1]);
    expect(m.callShop.mock.calls[3][1]).toMatchObject({ track: "network", enabled: true, expectedVersion: 3 });
  });
  it("a caller-supplied operation key is preserved so a retry replays instead of duplicating", async () => {
    m.callShop.mockResolvedValue({}); const key = crypto.randomUUID();
    await setCcFlag("c1", "supply", false, undefined, key);
    expect(m.callShop.mock.calls[0][1].operationKey).toBe(key);
    expect("expectedVersion" in m.callShop.mock.calls[0][1]).toBe(false);
  });
  it("status never sends an operation key (read only)", async () => {
    m.callShop.mockResolvedValue({}); await getCcStatus("c1");
    expect(m.callShop.mock.calls[0][1]).toEqual({ companyId: "c1" });
  });
  it("maps structured server codes to owner-friendly errors and never echoes unknown server text", () => {
    for (const code of ["NOT_AUTHORIZED", "STALE_VERSION", "REQUIRES_CONFIRMATION", "NOT_AVAILABLE", "CONFLICT"] as const) {
      const e = parseCcError(new Error(`CC:${code} internal detail with table cc_consent_events`));
      expect(e).toBeInstanceOf(CcError); expect(e.code).toBe(code); expect(e.message).not.toMatch(/cc_consent_events|internal detail/);
    }
    const unknown = parseCcError(new Error("relation public.cc_outbox does not exist"));
    expect(unknown.code).toBe("UNKNOWN"); expect(unknown.message).not.toMatch(/cc_outbox/);
    expect(parseCcError(new Error("Business access denied")).message).toBe("Business access denied");
  });
  it("converts server rejections but leaves network failures retry-safe", async () => {
    m.callShop.mockRejectedValueOnce(new ShopRejectedError("CC:REQUIRES_CONFIRMATION x"));
    await expect(setCcFlag("c1", "discover", true)).rejects.toMatchObject({ code: "REQUIRES_CONFIRMATION" });
    m.callShop.mockRejectedValueOnce(new ShopUnreachableError("offline"));
    await expect(setCcFlag("c1", "discover", true)).rejects.toBeInstanceOf(ShopUnreachableError);
  });
});

describe("nextTrackAction is derived only from server facts and defaults to the safe step", () => {
  it.each([
    [state(), "wait_for_terms"],
    [state({ currentConsentVersion: "v1" }), "accept_terms"],
    [state({ currentConsentVersion: "v1", consent: "revoked", consentVersion: null }), "accept_terms"],
    [state({ currentConsentVersion: "v2", consent: "granted", consentVersion: "v1" }), "accept_new_terms"],
    [state({ currentConsentVersion: "v1", consent: "granted", consentVersion: "v1" }), "turn_on"],
    [state({ currentConsentVersion: "v1", consent: "granted", consentVersion: "v1", flagEnabled: true, effective: true }), "turn_off"],
    [state({ killed: true }), "unavailable"],
    [state({ killed: true, flagEnabled: true }), "turn_off"],
  ] as const)("%j -> %s", (s, expected) => { expect(nextTrackAction(s as CcTrackState)).toBe(expected); });
});
