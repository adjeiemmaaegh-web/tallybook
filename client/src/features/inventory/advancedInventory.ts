import { withCoordinatedRetailWrite } from "@/features/backup/coordinatedRetailWrite";
/** V9 inventory tools. All posted stock changes use the existing inventory movement ledger. */
import { nanoid } from "nanoid";
import { db, type TallybookDB } from "@/db/TallybookDB";
import { getActiveBusinessProfileId } from "@/features/business/activeCompany";
import { requirePermission } from "@/features/staff/staff";
import { appendInventoryCostChange } from "./costLedger";
import { type InventoryMovement, type Product, normalizeProductCode } from "./inventory";

export interface StockCountLine { productId: string; expectedQuantity: number; countedQuantity: number; note?: string }
export interface StockCountPreview { companyId: string; lines: StockCountLine[]; createdAt: string }

/** Snapshot quantities. Never modify stock before the operator confirms the count. */
export async function prepareStockCount(productIds: string[], database: TallybookDB = db): Promise<StockCountPreview> {
  const companyId = getActiveBusinessProfileId();
  if (!productIds.length || new Set(productIds).size !== productIds.length) throw new Error("Select distinct products to count.");
  const products = await database.products.bulkGet(productIds);
  const lines = products.map((product, index) => {
    if (!product || product.businessProfileId !== companyId || product.archivedAt) throw new Error("A selected product is not active in this business.");
    return { productId: productIds[index], expectedQuantity: product.stockQuantity, countedQuantity: product.stockQuantity };
  });
  return { companyId, lines, createdAt: new Date().toISOString() };
}

/** An all-or-nothing posting; refuses stale counts instead of overwriting intervening sales. */
export async function postStockCount(preview: StockCountPreview, database: TallybookDB = db): Promise<InventoryMovement[]> {
  return withCoordinatedRetailWrite(async () => {
    const companyId = getActiveBusinessProfileId();
    if (preview.companyId !== companyId || !preview.lines.length) throw new Error("Stock count belongs to a different business or is empty.");
    if (new Set(preview.lines.map(l => l.productId)).size !== preview.lines.length) throw new Error("Duplicate stock-count lines.");
    const now = new Date().toISOString();
    return database.transaction("rw", [database.products, database.inventoryMovements, database.inventoryCostEvents, database.inventoryBatches, database.staffMembers, database.staffAudits, database.storeStockModes, database.commerceHolds], async () => {
      const actor = await requirePermission("inventory", database, companyId);
      if(await database.storeStockModes.get(companyId))throw new Error("Company-wide stock counts are disabled after store activation. Adjust stock by store.");
      if((await database.commerceHolds.where("businessProfileId").equals(companyId).toArray()).some(h=>h.status==="active"&&Date.parse(h.expiresAt)>Date.now()))
        throw new Error("Active customer reservations prevent company-wide stock recount.");
      const products = await database.products.bulkGet(preview.lines.map(l => l.productId));
      const updates: Product[] = [];
      const movements: InventoryMovement[] = [];
      for (let i = 0; i < preview.lines.length; i++) {
        const line = preview.lines[i], product = products[i];
        if (!product || product.businessProfileId !== companyId || product.archivedAt) throw new Error("A counted product is unavailable.");
        if (!Number.isSafeInteger(line.expectedQuantity) || !Number.isSafeInteger(line.countedQuantity) || line.countedQuantity < 0 || line.countedQuantity > 9_999_999) throw new Error("Counted quantities must be valid whole numbers.");
        if (product.stockQuantity !== line.expectedQuantity) throw new Error(`Stock changed for ${product.name} after the count began. Refresh and recount.`);
        if (line.countedQuantity !== line.expectedQuantity) {
          const tracked = await database.inventoryBatches.where("productId").equals(product.id).toArray();
          if (tracked.some(batch => batch.businessProfileId === companyId)) throw new Error(`Reconcile batches for ${product.name} before posting a stock correction.`);
        }
        if (line.countedQuantity === line.expectedQuantity) continue;
        const note = (line.note ?? "Physical stock count").trim().slice(0, 160);
        updates.push({ ...product, stockQuantity: line.countedQuantity, updatedAt: now });
        movements.push({ id: nanoid(14), businessProfileId: companyId, productId: product.id, movementType: "correction", quantityDelta: line.countedQuantity - line.expectedQuantity, previousQuantity: line.expectedQuantity, resultingQuantity: line.countedQuantity, note, createdAt: now });
      }
      for (const movement of movements) await appendInventoryCostChange(database, products.find(p => p?.id === movement.productId)!, movement.quantityDelta, { sourceId: movement.id, createdAt: now });
      if (updates.length) await database.products.bulkPut(updates);
      if (movements.length) await database.inventoryMovements.bulkAdd(movements);
      if (actor && movements.length) await database.staffAudits.add({ id: nanoid(14), businessProfileId: companyId, staffId: actor.id, action: "inventory.count.posted", createdAt: now, details: movements.map(m => m.id).join(",") });
      return movements;
    });
  });
}

import { escapeCsvSpreadsheetFormula, previewCatalogImport } from "./catalogCsv";
export { previewCatalogImport, parseCsvRecords } from "./catalogCsv";
const csvField = (value: string | number | undefined) => `"${escapeCsvSpreadsheetFormula(String(value ?? "")).replaceAll('"', '""')}"`;
/** Local CSV export only. Does not send business information to a server. */
export function exportProductCatalogCsv(products: Product[]): string {
  const companyId = getActiveBusinessProfileId();
  const headers = ["name", "sku", "barcode", "categoryId", "sellingPriceMinor", "costPriceMinor", "stockQuantity", "lowStockThreshold"];
  const rows = products.filter(p => p.businessProfileId === companyId && !p.archivedAt).map(p => [p.name,p.sku,p.barcode,p.categoryId,p.sellingPriceMinor,p.costPriceMinor,p.stockQuantity,p.lowStockThreshold]);
  return [headers.map(csvField).join(","), ...rows.map(row => row.map(csvField).join(","))].join("\r\n") + "\r\n";
}

/** Preflight for future bulk import: prevent duplicate SKU/barcode identifiers in one file. */
export function validateImportedIdentifiers(rows: Array<{sku?: string; barcode?: string}>): void {
  const seen = new Set<string>();
  for (const row of rows) {
    const codes = [normalizeProductCode(row.sku), normalizeProductCode(row.barcode)].filter(Boolean);
    for (const code of codes) {
      if (seen.has(code)) throw new Error(`Duplicate SKU or barcode in import: ${code}`);
      seen.add(code);
    }
  }
}

/** Atomic catalogue import. Validates the entire file and existing company data before any insert. */
export async function importProductCatalogCsv(csv: string, database: TallybookDB = db): Promise<Product[]> {
  return withCoordinatedRetailWrite(async () => {
    const rows = previewCatalogImport(csv);
    const companyId = getActiveBusinessProfileId();
    return database.transaction("rw", [database.products, database.categories, database.inventoryMovements, database.inventoryCostEvents, database.staffMembers, database.staffAudits, database.storeStockModes, database.commerceHolds], async () => {
      const actor = await requirePermission("inventory", database, companyId);
      if(await database.storeStockModes.get(companyId))throw new Error("Bulk stock import is unavailable after store activation. Create items with explicit store allocation.");
      if((await database.commerceHolds.where("businessProfileId").equals(companyId).toArray()).some(h=>h.status==="active"&&Date.parse(h.expiresAt)>Date.now()))
        throw new Error("Active customer reservations prevent bulk stock import.");
      const existing = await database.products.where("businessProfileId").equals(companyId).toArray();
      const active = existing.filter(product => !product.archivedAt);
      const names = new Set(active.map(product => product.normalizedName));
      const codes = new Set(active.flatMap(product => [normalizeProductCode(product.sku), normalizeProductCode(product.barcode)].filter(Boolean)));
      const categories = await database.categories.where("businessProfileId").equals(companyId).toArray();
      const knownCategories = new Set(categories.filter(category => !category.archivedAt).map(category => category.id));
      const now = new Date().toISOString();
      const products: Product[] = [];
      const movements: InventoryMovement[] = [];
      for (const row of rows) {
        const normalizedName = row.name.trim().replace(/\s+/g, " ").toLocaleLowerCase();
        if (names.has(normalizedName)) throw new Error(`Product name already exists: ${row.name}`);
        names.add(normalizedName);
        for (const code of [normalizeProductCode(row.sku), normalizeProductCode(row.barcode)].filter(Boolean)) {
          if (codes.has(code)) throw new Error(`SKU or barcode already exists: ${code}`);
          codes.add(code);
        }
        if (row.categoryId && !knownCategories.has(row.categoryId)) throw new Error(`Unknown category for ${row.name}.`);
        const id = nanoid(14);
        const stockQuantity = Number(row.stockQuantity);
        products.push({ id, businessProfileId: companyId, name: row.name, normalizedName, sku: row.sku || undefined, barcode: row.barcode || undefined, categoryId: row.categoryId || undefined, sellingPriceMinor: Number(row.sellingPriceMinor), costPriceMinor: row.costPriceMinor ? Number(row.costPriceMinor) : undefined, stockQuantity, lowStockThreshold: Number(row.lowStockThreshold), createdAt: now, updatedAt: now });
        if (stockQuantity) movements.push({ id: nanoid(14), businessProfileId: companyId, productId: id, movementType: "initial", quantityDelta: stockQuantity, previousQuantity: 0, resultingQuantity: stockQuantity, note: "Initial quantity from reviewed CSV import", createdAt: now });
      }
      await database.products.bulkAdd(products);
      for (const product of products) await appendInventoryCostChange(database, product, product.stockQuantity, { sourceId: movements.find(m => m.productId === product.id)?.id ?? `opening:${product.id}`, createdAt: now }, { opening: true, unitCostMinor: product.costPriceMinor });
      if (movements.length) await database.inventoryMovements.bulkAdd(movements);
      if (actor) await database.staffAudits.add({ id: nanoid(14), businessProfileId: companyId, staffId: actor.id, action: "inventory.catalogue.imported", createdAt: now, details: `${products.length} products` });
      return products;
    });
  });
}
