import Dexie from "dexie";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TallybookDB, initializeDatabase } from "@/db/TallybookDB";
import { saveBusinessProfile } from "@/features/business/businessProfile";
import { setActiveBusinessProfileId } from "@/features/business/activeCompany";
import { createStaff, lockStaff, unlockStaff } from "@/features/staff/staff";
import { addMobileMoneyProvider, setMobileMoneyProviderActive } from "@/features/payments/mobileMoney";
import { createDraftOrder, cancelDraftOrder, transitionLocalOrder } from "@/features/commerce/commerce";
import { completePurchase, createSupplier } from "@/features/purchases/purchases";
import { adjustStock, createProduct } from "./inventory";
import { importProductCatalogCsv, postStockCount, prepareStockCount } from "./advancedInventory";
import { postSavedStockCount, saveStockCountSession, updateStockCountSession } from "./stage2Inventory";
import { setSyncConsent } from "@/features/sync/syncFoundation";
import { registerLocalSyncDevice } from "@/features/sync/deviceRegistry";

const databases: TallybookDB[] = [];
async function fixture() {
  setActiveBusinessProfileId("primary");
  lockStaff("primary");
  const db = new TallybookDB(`write-safety-${crypto.randomUUID()}`);
  databases.push(db);
  await initializeDatabase(db);
  await saveBusinessProfile({ name: "Safety shop", country: "Ghana", currency: "GHS", businessType: "Retail", phone: "", email: "", address: "" }, db);
  const product = await createProduct({ name: "Rice", categoryId: "uncategorized", sellingPrice: "10", costPrice: "3", initialStock: "10", lowStockThreshold: "1" }, "GHS", db);
  return { db, product };
}
afterEach(async () => {
  vi.restoreAllMocks();
  lockStaff("primary");
  setActiveBusinessProfileId("primary");
  for (const db of databases.splice(0)) { db.close(); await new Dexie(db.name).delete(); }
});

describe("inventory and planning write safety", () => {
  it("serializes simultaneous adjustments without losing stock or movement continuity", async () => {
    const { db, product } = await fixture();
    await Promise.all(Array.from({ length: 6 }, () => adjustStock(product.id, { movementType: "increase", quantity: "1" }, db)));
    expect((await db.products.get(product.id))?.stockQuantity).toBe(16);
    const movements = await db.inventoryMovements.where("productId").equals(product.id).filter(m => m.movementType === "increase").toArray();
    expect(movements.map(m => m.previousQuantity).sort((a,b) => a-b)).toEqual([10,11,12,13,14,15]);
  });
  it("rolls stock back if the movement write fails", async () => {
    const { db, product } = await fixture();
    vi.spyOn(db.inventoryMovements, "add").mockRejectedValueOnce(new Error("disk full"));
    await expect(adjustStock(product.id, { movementType: "decrease", quantity: "2" }, db)).rejects.toThrow("disk full");
    expect((await db.products.get(product.id))?.stockQuantity).toBe(10);
    expect(await db.inventoryMovements.count()).toBe(1);
  });
  it("posts a saved count with all nested transaction tables and rejects a second posting", async () => {
    const { db, product } = await fixture();
    const session = await saveStockCountSession([product.id], db);
    await updateStockCountSession(session.id, { [product.id]: 8 }, db);
    await postSavedStockCount(session.id, db);
    expect((await db.products.get(product.id))?.stockQuantity).toBe(8);
    await expect(postSavedStockCount(session.id, db)).rejects.toThrow(/already posted/);
  });
  it("denies direct cashier import, count and payment-configuration calls, and locked commerce mutations", async () => {
    const { db, product } = await fixture();
    const provider = await addMobileMoneyProvider({ name: "MTN MoMo" }, db);
    const order = await createDraftOrder("Customer", [{ productId: product.id, quantity: 1 }], db);
    const preview = await prepareStockCount([product.id], db);
    preview.lines[0].countedQuantity = 1;
    const owner = await createStaff("Owner", "owner", "123456", db);
    await unlockStaff(owner.id, "123456", db);
    const cashier = await createStaff("Cashier", "cashier", "654321", db);
    await unlockStaff(cashier.id, "654321", db);
    const csv = 'name,sku,barcode,categoryId,sellingPriceMinor,costPriceMinor,stockQuantity,lowStockThreshold\nOil,OIL,,,500,200,2,1\n';
    await expect(importProductCatalogCsv(csv, db)).rejects.toThrow(/permission denied/);
    await expect(postStockCount(preview, db)).rejects.toThrow(/permission denied/);
    await expect(addMobileMoneyProvider({ name: "Other provider" }, db)).rejects.toThrow(/permission denied/);
    await expect(setMobileMoneyProviderActive(provider.id, false, db)).rejects.toThrow(/permission denied/);
    await expect(setSyncConsent(db, "primary", true)).rejects.toThrow(/permission denied|staff session changed/);
    await expect(registerLocalSyncDevice(db, "primary", "unauthorized-device", "Phone")).rejects.toThrow(/permission denied/);
    lockStaff("primary");
    await expect(createDraftOrder("Blocked", [{ productId: product.id, quantity: 1 }], db)).rejects.toThrow(/locked/);
    await expect(cancelDraftOrder(order.id, db)).rejects.toThrow(/locked/);
    await expect(transitionLocalOrder(order.id, "prepare", db)).rejects.toThrow(/locked/);
    expect(await db.products.count()).toBe(1);
    expect((await db.products.get(product.id))?.stockQuantity).toBe(10);
    expect((await db.commerceOrders.get(order.id))?.status).toBe("draft");
    expect((await db.mobileMoneyProviders.get(provider.id))?.active).toBe(true);
  });
  it("rejects purchase arithmetic overflow before any records or stock are written", async () => {
    const { db, product } = await fixture();
    const supplier = await createSupplier({ name: "Supplier" }, db);
    await expect(completePurchase({ supplierId: supplier.id, purchaseDate: "2026-10-01", lines: [{ productId: product.id, quantity: "2", unitCost: "90071992547409.91" }] }, "GHS", db)).rejects.toThrow();
    expect(await db.purchases.count()).toBe(0);
    expect(await db.purchaseLines.count()).toBe(0);
    expect((await db.products.get(product.id))?.stockQuantity).toBe(10);
  });
});
