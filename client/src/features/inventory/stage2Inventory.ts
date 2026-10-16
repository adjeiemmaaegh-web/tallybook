import { withCoordinatedRetailWrite } from "@/features/backup/coordinatedRetailWrite";
import {assertRun7RetailWriteReady} from "@/features/backup/run7RetailWriteBarrier.mjs";
import { requirePermission } from "@/features/staff/staff";
/** Optional Stage 2 catalogue features, persisted locally without altering the existing sale ledger. */
import { nanoid } from "nanoid";
import { db, type TallybookDB } from "@/db/TallybookDB";
import { getActiveBusinessProfileId } from "@/features/business/activeCompany";
import { normalizeProductCode, type Product } from "./inventory";
import { postStockCount, prepareStockCount, type StockCountPreview } from "./advancedInventory";

export interface StockCountSession extends StockCountPreview { businessProfileId: string; id: string; status: "draft" | "posted"; updatedAt: string; postedAt?: string }
export interface InventoryBatch { id: string; businessProfileId: string; productId: string; batchCode: string; expiryDate?: string; quantity: number; createdAt: string }
export type CatalogueOptions = Pick<Product, "parentProductId" | "variantLabel" | "baseUnit" | "packSize" | "wholesalePriceMinor" | "wholesaleMinimumQuantity" | "itemKind" | "imageDataUrl">;
const whole = (n: number, maximum = 9_999_999) => Number.isSafeInteger(n) && n >= 0 && n <= maximum;

/** Converts complete packs to the existing integer stock unit without rounding. */
export function unitsFromPacks(packs: number, unitsPerPack: number): number {
  if (!whole(packs) || !whole(unitsPerPack) || !unitsPerPack || !whole(packs * unitsPerPack)) throw new Error("Pack conversion must produce valid whole stock units.");
  return packs * unitsPerPack;
}
export function selectUnitPrice(product: Product, quantity: number): number {
  if (!whole(quantity) || quantity === 0) throw new Error("Select a valid quantity.");
  if (product.wholesalePriceMinor !== undefined && product.wholesaleMinimumQuantity !== undefined && quantity >= product.wholesaleMinimumQuantity) return product.wholesalePriceMinor;
  return product.sellingPriceMinor;
}
function validateImage(value: string | undefined) {
  if (!value) return;
  if (value.length > 180_000 || !/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) throw new Error("Use a PNG, JPEG, or WebP image smaller than 135 KB.");
}
/** A variant is a real product with its own SKU and stock, never a shared quantity alias. */
export async function setCatalogueOptions(productId: string, options: CatalogueOptions, database: TallybookDB = db) {
  return withCoordinatedRetailWrite(async () => {
    const company = getActiveBusinessProfileId();
    return database.transaction("rw", [database.appMeta, database.products, database.staffMembers], async () => {
      await assertRun7RetailWriteReady(database.appMeta);
      await requirePermission("inventory", database, company);
      const product = await database.products.get(productId);
      if (!product || product.businessProfileId !== company || product.archivedAt) throw new Error("Product is unavailable.");
      if (options.parentProductId) {
        if (options.parentProductId === productId) throw new Error("Product cannot be its own variant family.");
        const parent = await database.products.get(options.parentProductId);
        if (!parent || parent.businessProfileId !== company || parent.archivedAt || parent.parentProductId) throw new Error("Choose an active parent product in this business.");
      }
      if (options.packSize !== undefined && (!whole(options.packSize) || options.packSize < 1)) throw new Error("Invalid pack size.");
      if (options.wholesalePriceMinor !== undefined && !whole(options.wholesalePriceMinor, 999_999_999)) throw new Error("Invalid wholesale price.");
      if (options.wholesaleMinimumQuantity !== undefined && (!whole(options.wholesaleMinimumQuantity) || options.wholesaleMinimumQuantity < 2)) throw new Error("Invalid wholesale minimum.");
      if ((options.wholesalePriceMinor === undefined) !== (options.wholesaleMinimumQuantity === undefined)) throw new Error("Wholesale price and minimum quantity must be provided together.");
      if (options.itemKind === "service" && product.stockQuantity !== 0) throw new Error("A stocked item cannot become a service while stock remains.");
      if (options.variantLabel && options.variantLabel.length > 80) throw new Error("Variant label is too long.");
      if (options.baseUnit && options.baseUnit.length > 32) throw new Error("Base unit is too long.");
      validateImage(options.imageDataUrl);
      const updated = { ...product, ...options, updatedAt: new Date().toISOString() };
      await database.products.put(updated);
      return updated;
    });
  });
}
export async function saveStockCountSession(productIds: string[], database: TallybookDB = db): Promise<StockCountSession> {
  return withCoordinatedRetailWrite(async () => {
    await requirePermission("inventory", database);
    const preview = await prepareStockCount(productIds, database);
    const now = new Date().toISOString();
    const session: StockCountSession = { ...preview, businessProfileId: preview.companyId, id: nanoid(16), status: "draft", updatedAt: now };
    await database.transaction("rw", [database.appMeta, database.stockCountSessions, database.staffMembers], async () => {
      await assertRun7RetailWriteReady(database.appMeta);
      await requirePermission("inventory", database, preview.companyId);
      const existing = await database.stockCountSessions.where("businessProfileId").equals(preview.companyId).toArray();
      if (existing.some(item => item.status === "draft")) throw new Error("Resume or complete your saved stock count before starting another.");
      await database.stockCountSessions.add(session);
    });
    return session;
  });
}
export async function updateStockCountSession(id: string, counts: Record<string, number>, database: TallybookDB = db) {
  return withCoordinatedRetailWrite(async () => {
    const company = getActiveBusinessProfileId();
    return database.transaction("rw", [database.appMeta, database.stockCountSessions, database.staffMembers], async () => {
      await assertRun7RetailWriteReady(database.appMeta);
      await requirePermission("inventory", database, company);
      const session = await database.stockCountSessions.get(id);
      if (!session || session.companyId !== company || session.status !== "draft") throw new Error("Stock count cannot be edited.");
      for (const [key, value] of Object.entries(counts)) if (!session.lines.some(l => l.productId === key) || !whole(value)) throw new Error("Invalid stock-count line.");
      const updated = { ...session, lines: session.lines.map(l => counts[l.productId] === undefined ? l : { ...l, countedQuantity: counts[l.productId] }), updatedAt: new Date().toISOString() };
      await database.stockCountSessions.put(updated);
      return updated;
    });
  });
}
export async function postSavedStockCount(id: string, database: TallybookDB = db) {
  return withCoordinatedRetailWrite(async () => {
    const company = getActiveBusinessProfileId();
    return database.transaction("rw", [database.appMeta, database.stockCountSessions, database.products, database.inventoryMovements, database.inventoryCostEvents, database.inventoryBatches, database.staffMembers, database.staffAudits, database.storeStockModes, database.commerceHolds], async () => {
      await assertRun7RetailWriteReady(database.appMeta);
      await requirePermission("inventory", database, company);
      const session = await database.stockCountSessions.get(id);
      if (!session || session.companyId !== company || session.status !== "draft") throw new Error("Stock-count session is unavailable or already posted.");
      if((await database.commerceHolds.where("businessProfileId").equals(company).toArray()).some(h=>h.status==="active"&&Date.parse(h.expiresAt)>Date.now()))
        throw new Error("Active customer reservations must be fulfilled or released before stock count posting.");
      const result = await postStockCount(session, database);
      await database.stockCountSessions.put({ ...session, status: "posted", postedAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
      return result;
    });
  });
}
/** Batch receipts are metadata until sales can allocate FIFO batches atomically. */
export async function registerBatch(productId: string, batchCode: string, quantity: number, expiryDate?: string, database: TallybookDB = db) {
  return withCoordinatedRetailWrite(async () => {
    if (!whole(quantity) || !quantity || !batchCode.trim() || batchCode.length > 64) throw new Error("Invalid batch information.");
    if (expiryDate && (!/^\d{4}-\d{2}-\d{2}$/.test(expiryDate) || !Number.isFinite(Date.parse(expiryDate + "T00:00:00Z")) || new Date(expiryDate + "T00:00:00Z").toISOString().slice(0, 10) !== expiryDate)) throw new Error("Invalid expiry date.");
    const company = getActiveBusinessProfileId();
    return database.transaction("rw", [database.appMeta, database.products, database.inventoryBatches, database.staffMembers, database.storeStockModes], async () => {
      await assertRun7RetailWriteReady(database.appMeta);
      await requirePermission("inventory", database, company);
      const product = await database.products.get(productId);
      if (!product || product.businessProfileId !== company || product.archivedAt || product.itemKind === "service") throw new Error("Batch product is unavailable.");
      if(await database.storeStockModes.get(company))throw new Error("Batch provenance must be assigned to stores before registering new batches.");
      const batches = await database.inventoryBatches.where("productId").equals(productId).toArray();
      if (batches.some(b => b.businessProfileId === company && normalizeProductCode(b.batchCode) === normalizeProductCode(batchCode))) throw new Error("Batch code already exists for this product.");
      if (batches.filter(b => b.businessProfileId === company).reduce((sum, b) => sum + b.quantity, 0) + quantity > product.stockQuantity) throw new Error("Tracked batch quantities cannot exceed physical stock. Receive stock before registering a batch.");
      const record: InventoryBatch = { id: nanoid(16), businessProfileId: company, productId, batchCode: batchCode.trim(), quantity, expiryDate, createdAt: new Date().toISOString() };
      await database.inventoryBatches.add(record);
      return record;
    });
  });
}
