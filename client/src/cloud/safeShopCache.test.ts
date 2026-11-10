import { describe, expect, it } from "vitest";
import { safeCache } from "./safeShopCache";

const source = () => ({
  businesses: [{id: "company1", name: "A Shop", role: "owner", ownerEmail: "private@example.com"}],
  overviews: {
    company1: {
      companyId: "company1", role: "owner", currency: "GHS",
      stores: [{id: "store1", name: "Main", status: "active", managerPhone: "PRIVATE_PHONE"}],
      products: [{id: "product1", name: "Rice", unitPriceMinor: 1200, active: true,
        supplierPhone: "PRIVATE_SUPPLIER_PHONE"}],
      stock: [{storeId: "store1", productId: "product1", quantity: 5,
        costPrice: 800, supplierName: "PRIVATE_SUPPLIER"}],
      customers: [{id: "customer1", name: "PRIVATE_CUSTOMER", phone: "PRIVATE_PHONE"}],
      members: [{userId: "user1", email: "PRIVATE_STAFF_EMAIL", role: "owner"}],
      pendingInvites: [{email: "PRIVATE_INVITATION"}],
      memberPermissions: {user1: {canDiscount: true, canCredit: true}},
      myPermissions: {canDiscount: true, maxDiscountBps: 10000, canCredit: true},
      refundPolicy: {revision: 7, enabled: true, allowFullReversal: true,
        allowPartialReturn: true, maxAgeDays: 365, actorId: "PRIVATE_ACTOR"},
      privateAuditTrail: "PRIVATE_AUDIT",
      paymentReferences: ["PRIVATE_PAYMENT"]
    }
  }
});

describe("Stage B shared-shop offline cache redaction", () => {
  it("only retains required catalogue fields, not personal or future fields", () => {
    const cleaned = safeCache(source());
    const text = JSON.stringify(cleaned);
    for (const secret of [
      "PRIVATE_CUSTOMER", "PRIVATE_PHONE", "PRIVATE_SUPPLIER_PHONE",
      "PRIVATE_STAFF_EMAIL", "PRIVATE_INVITATION", "PRIVATE_AUDIT",
      "PRIVATE_PAYMENT", "PRIVATE_ACTOR", "private@example.com"
    ]) expect(text).not.toContain(secret);
    expect(cleaned.businesses).toEqual([{id: "company1", name: "A Shop", role: "attendant"}]);
    expect(cleaned.overviews.company1?.role).toBe("attendant");
    expect(cleaned.overviews.company1?.stores).toEqual([
      {id: "store1", name: "Main", status: "active"}
    ]);
    // A product from a server without catalogue details becomes an ordinary counted good.
    expect(cleaned.overviews.company1?.products).toEqual([
      {id: "product1", name: "Rice", unitPriceMinor: 1200, active: true,
        barcode: null, category: null, kind: "good", trackStock: true, lowStockThreshold: null}
    ]);
    expect(cleaned.overviews.company1?.stock).toEqual([
      {storeId: "store1", productId: "product1", quantity: 5}
    ]);
  });

  it("keeps display details so a service stays sellable offline, but never caches cost", () => {
    const input = source();
    input.overviews.company1.products = [
      {id: "p1", name: "Haircut", unitPriceMinor: 5000, active: true, barcode: "6001", category: "Salon", kind: "service",
        trackStock: false, lowStockThreshold: null, costMinor: 1234, supplierPhone: "PRIVATE_SUPPLIER_PHONE"},
      {id: "p2", name: "Rice", unitPriceMinor: 1200, active: true, barcode: 42, category: {x: 1}, kind: "gadget",
        trackStock: "yes", lowStockThreshold: -3, costMinor: 800},
    ] as never;
    const cleaned = safeCache(input);
    const text = JSON.stringify(cleaned);
    expect(text).not.toContain("1234");
    expect(text).not.toContain("costMinor");
    expect(text).not.toContain("PRIVATE_SUPPLIER_PHONE");
    const [service, malformed] = cleaned.overviews.company1!.products;
    expect(service).toEqual({id: "p1", name: "Haircut", unitPriceMinor: 5000, active: true,
      barcode: "6001", category: "Salon", kind: "service", trackStock: false, lowStockThreshold: null});
    // Malformed values fall back to safe defaults rather than being trusted.
    expect(malformed).toEqual({id: "p2", name: "Rice", unitPriceMinor: 1200, active: true,
      barcode: null, category: null, kind: "good", trackStock: true, lowStockThreshold: null});
  });

  it("never persists cached staff privileges or return-policy authority", () => {
    const view = safeCache(source()).overviews.company1!;
    expect(view.myPermissions).toEqual({canDiscount: false, maxDiscountBps: 0, canCredit: false});
    expect(view.members).toEqual([]);
    expect(view.pendingInvites).toEqual([]);
    expect(view.customers).toEqual([]);
    expect(view).not.toHaveProperty("refundPolicy");
  });

  it("sanitizes malformed shapes and ignores mismatched company identities", () => {
    const output = safeCache({
      businesses: ["broken", {id: "a", name: "Shop", role: "surprise"}],
      overviews: {
        a: {companyId: "other", stores: [], products: [], stock: []},
        b: {companyId: "b", stores: [null], products: [{id: "bad", unitPriceMinor: NaN}],
          stock: [{quantity: -1}]}
      }
    });
    expect(output.businesses).toEqual([{id: "a", name: "Shop", role: "attendant"}]);
    expect(output.overviews.a).toBeUndefined();
    expect(output.overviews.b?.stores).toEqual([]);
    expect(output.overviews.b?.products).toEqual([]);
    expect(output.overviews.b?.stock).toEqual([]);
  });

  it("returns a clean empty object for null, arrays or invalid saved JSON structures", () => {
    expect(safeCache(null)).toEqual({businesses: [], overviews: {}});
    expect(safeCache([])).toEqual({businesses: [], overviews: {}});
  });
});
