import { afterEach, describe, expect, it } from "vitest";
import { TallybookDB } from "@/db/TallybookDB";
import { setActiveBusinessProfileId } from "@/features/business/activeCompany";
import type { Product } from "@/features/inventory/inventory";
import { readLocalBooks } from "./localBooksExport";

const databases: TallybookDB[] = [];
let n = 0;
async function phone(company: string) {
  const database = new TallybookDB(`tallybook-local-books-${Date.now()}-${++n}`);
  databases.push(database);
  await database.open();
  setActiveBusinessProfileId(company);
  const now = new Date().toISOString();
  await database.businessProfiles.put({ id: company, name: "Kwaku Provisions", country: "Ghana", currency: "GHS",
    businessType: "Provisions", createdAt: now, updatedAt: now } as never);
  const product = (id: string, name: string, extra: Partial<Product> = {}): Product => ({ id, businessProfileId: company, name,
    normalizedName: name.toLowerCase(), sellingPriceMinor: 4500, stockQuantity: 12, lowStockThreshold: 0, createdAt: now, updatedAt: now, ...extra });
  await database.products.bulkPut([
    product("p_eggs", "Crate of eggs"),
    product("p_soap", "Soap", { sellingPriceMinor: 800, stockQuantity: 0 }),
    product("p_fix", "Phone repair", { itemKind: "service", stockQuantity: 0 }),
    product("p_old", "Old stock", { archivedAt: now }),
    product("p_other", "Someone else's", { businessProfileId: "another-company" }),
  ]);
  return database;
}
afterEach(async () => { await Promise.all(databases.splice(0).map(async d => { d.close(); await d.delete(); })); });

describe("reading this phone's books for the shared shop", () => {
  it("exports stocked, unarchived products of this company with company-wide stock", async () => {
    const database = await phone("kwaku-main");
    const snapshot = await readLocalBooks(database, "kwaku-main");
    expect(snapshot.hasStores).toBe(false);
    expect(snapshot.skipped).toEqual({ services: 1, archived: 1 });
    expect(snapshot.books).toEqual({
      sourceKey: "device:kwaku-main", currency: "GHS", stores: [],
      products: [{ localId: "p_eggs", name: "Crate of eggs", unitPriceMinor: 4500 }, { localId: "p_soap", name: "Soap", unitPriceMinor: 800 }],
      stock: [{ localProductId: "p_eggs", quantity: 12 }],
    });
  });

  it("exports per-store quantities when this phone tracks stock by store", async () => {
    const database = await phone("kwaku-stores");
    const now = new Date().toISOString();
    await database.storeLocations.bulkPut([
      { id: "st_madina", businessProfileId: "kwaku-stores", name: "Madina", normalizedName: "madina", status: "active", createdAt: now, updatedAt: now },
      { id: "st_closed", businessProfileId: "kwaku-stores", name: "Old branch", normalizedName: "old branch", status: "closed", createdAt: now, updatedAt: now },
    ]);
    await database.storeStockModes.put({ businessProfileId: "kwaku-stores", activatedAt: now, activatedByStaffId: "owner", evidence: "owner-confirmed-opening-allocations" });
    const entry = (sequence: number, storeId: string, quantityDelta: number) => ({ id: `e${sequence}`, businessProfileId: "kwaku-stores",
      storeId, productId: "p_eggs", kind: "opening" as const, quantityDelta, sourceId: "s", submissionKey: `k${sequence}`, createdAt: now, sequence });
    await database.storeStockEntries.bulkPut([entry(1, "st_madina", 9), entry(2, "st_closed", 3)]);
    const snapshot = await readLocalBooks(database, "kwaku-stores");
    expect(snapshot.hasStores).toBe(true);
    expect(snapshot.books.stores).toEqual([{ localId: "st_madina", name: "Madina" }]);
    expect(snapshot.books.stock).toEqual([{ localProductId: "p_eggs", localStoreId: "st_madina", quantity: 9 }]);
  });

  it("refuses when staff are set up and the owner hasn't unlocked", async () => {
    const database = await phone("kwaku-staff");
    await database.staffMembers.put({ id: "cashier", businessProfileId: "kwaku-staff", name: "Ama", role: "cashier", salt: "s", pinHash: "h", createdAt: new Date().toISOString() });
    await expect(readLocalBooks(database, "kwaku-staff")).rejects.toThrow(/locked or staff permission denied/);
  });
});
