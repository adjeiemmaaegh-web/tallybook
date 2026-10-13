import { afterEach, describe, expect, it, vi } from "vitest";
import { clearPendingCheckout, getPendingCheckoutStatus, loadPendingCheckout, savePendingCheckout } from "./pendingCheckout";
const storage = new Map<string, string>();
const localStorageMock = { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => { storage.set(k, v); }, removeItem: (k: string) => { storage.delete(k); } };
const intent = { lines: [{ productId: "rice-1", quantity: 2 }], discount: "0", amountPaid: "10.00", currency: "GHS", paymentMethod: "cash" as const, submissionKey: "unique-sale-key" };
afterEach(() => { storage.clear(); vi.unstubAllGlobals(); });
describe("durable pending checkout", () => {
  it("preserves the immutable intent across reloads and isolates businesses", () => {
    vi.stubGlobal("localStorage", localStorageMock);
    expect(getPendingCheckoutStatus("shop-a").state).toBe("empty");
    savePendingCheckout("shop-a", intent);
    expect(getPendingCheckoutStatus("shop-a").state).toBe("pending");
    expect(loadPendingCheckout("shop-a")?.intent).toEqual(intent);
    expect(loadPendingCheckout("shop-b")).toBeNull();
    expect(() => savePendingCheckout("shop-a", { ...intent, amountPaid: "20.00" })).toThrow(/Resolve/);
    clearPendingCheckout("shop-a", "wrong-key");
    expect(loadPendingCheckout("shop-a")).not.toBeNull();
    clearPendingCheckout("shop-a", intent.submissionKey);
    expect(loadPendingCheckout("shop-a")).toBeNull();
  });
  it("rejects invalid journal entries and missing storage", () => {
    vi.stubGlobal("localStorage", localStorageMock);
    storage.set("tallybook:pending-checkout:v1:shop-a", JSON.stringify({ version: 1, companyId: "shop-a", savedAt: "invalid", intent }));
    expect(loadPendingCheckout("shop-a")).toBeNull();
    expect(getPendingCheckoutStatus("shop-a").state).toBe("damaged");
    expect(() => savePendingCheckout("shop-a", intent)).toThrow(/damaged/);
    expect(storage.get("tallybook:pending-checkout:v1:shop-a")).toContain('"savedAt":"invalid"');
    vi.stubGlobal("localStorage", undefined);
    expect(() => savePendingCheckout("shop-a", intent)).toThrow(/unavailable/);
  });
  it("does not permit checkout when a storage write does not persist", () => {
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined });
    expect(() => savePendingCheckout("shop-a", intent)).toThrow(/could not be verified/);
  });
  it("does not permit checkout when the storage quota rejects a write", () => {
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => { throw new Error("QuotaExceededError"); } });
    expect(() => savePendingCheckout("shop-a", intent)).toThrow(/storage failed/);
  });
  it("fails closed when recovery storage cannot be read", () => {
    vi.stubGlobal("localStorage", { getItem: () => { throw new Error("denied"); } });
    expect(getPendingCheckoutStatus("shop-a").state).toBe("unavailable");
    expect(() => savePendingCheckout("shop-a", intent)).toThrow(/cannot be read/);
  });
});
