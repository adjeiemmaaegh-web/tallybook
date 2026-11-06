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
    expect(cleaned.businesses).toEqual([{id: "company1", name: "A Shop", role: "owner"}]);
    expect(cleaned.overviews.company1?.stores).toEqual([
      {id: "store1", name: "Main", status: "active"}
    ]);
    expect(cleaned.overviews.company1?.products).toEqual([
      {id: "product1", name: "Rice", unitPriceMinor: 1200, active: true}
    ]);
    expect(cleaned.overviews.company1?.stock).toEqual([
      {storeId: "store1", productId: "product1", quantity: 5}
    ]);
  });

  it("never persists cached staff privileges or return-policy authority", () => {
    const view = safeCache(source()).overviews.company1!;
    expect(view.myPermissions).toEqual({canDiscount: false, maxDiscountBps: 0, canCredit: false});
    expect(view.members).toEqual([]);
    expect(view.pendingInvites).toEqual([]);
    expect(view.customers).toEqual([]);
    expect(view.refundPolicy?.enabled).toBe(false);
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
