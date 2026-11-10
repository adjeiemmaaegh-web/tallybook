import { parseCsvRecords } from "@/features/inventory/catalogCsv";
import { parseAmountToMinor } from "@/features/inventory/inventory";
import type { ProductInput } from "./shopClient";

/**
 * CSV import for the shared shop's catalogue. Parsing never writes anything.
 *
 * Friendlier than the device format: prices are ordinary amounts (12.50), the
 * columns can be in any order, bad rows are reported one by one instead of
 * rejecting the file, and products that already exist (same barcode or same
 * name) are skipped, never overwritten, so running an import twice is safe.
 */
export const IMPORT_MAX_BYTES = 2_000_000;
export const IMPORT_MAX_ROWS = 500;
export const TEMPLATE_CSV = [
  "name,price,barcode,category,type,quantity,low_stock,cost",
  "Rice 5kg,90.00,6001234567890,Grains,good,20,5,70.00",
  "Haircut,50.00,,Salon,service,,,",
  "",
].join("\n");

export interface PlannedRow { row: number; input: ProductInput; quantity: number; operationId: string }
export interface SkippedRow { row: number; name: string; reason: string }
export interface ImportPlan { rows: PlannedRow[]; skipped: SkippedRow[]; needsStore: boolean }

const ALIASES: Record<string, string> = {
  name: "name", product: "name", "product name": "name", item: "name",
  price: "price", "selling price": "price", "unit price": "price",
  barcode: "barcode", code: "barcode", sku: "barcode",
  category: "category",
  type: "type", kind: "type",
  quantity: "quantity", qty: "quantity", stock: "quantity", "opening stock": "quantity",
  low_stock: "low_stock", "low stock": "low_stock", lowstock: "low_stock", "low stock level": "low_stock",
  cost: "cost", "cost price": "cost",
};

const MAX_MINOR = 100_000_000_000;
const BARCODE = /^[A-Za-z0-9._/-]{1,64}$/;

function whole(value: string, label: string, max: number): number {
  if (!/^\d+$/.test(value) || Number(value) > max) throw new Error(`${label} must be a whole number${max < Infinity ? ` up to ${max.toLocaleString("en")}` : ""}.`);
  return Number(value);
}
function money(value: string, label: string, currency: string): number {
  if (!value.trim()) throw new Error(`${label} is missing.`);
  let minor: number;
  try { minor = parseAmountToMinor(value, currency); } catch { throw new Error(`${label} "${value}" is not a valid amount.`); }
  if (minor > MAX_MINOR) throw new Error(`${label} is too large.`);
  return minor;
}

/** Throws a plain sentence for problems with the file as a whole; everything else becomes a skipped row. */
export function planCatalogImport(
  text: string,
  currency: string,
  existing: ReadonlyArray<{ name: string; barcode?: string | null }>,
  newId: () => string = () => crypto.randomUUID(),
): ImportPlan {
  if (text.length > IMPORT_MAX_BYTES) throw new Error("This file is larger than 2 MB. Split it into smaller files.");
  let records: string[][];
  try { records = parseCsvRecords(text); } catch (cause) { throw new Error(`This is not a readable CSV file. ${cause instanceof Error ? cause.message : ""}`.trim()); }
  const header = records.shift();
  if (!header) throw new Error("The file is empty.");
  const columns = header.map(h => ALIASES[h.trim().toLowerCase().replace(/\s+/g, " ")] ?? null);
  const index = (key: string) => columns.indexOf(key);
  if (index("name") < 0 || index("price") < 0) throw new Error("The first row must name the columns, and it needs at least “name” and “price”. Download the template to see an example.");
  const data = records.filter(r => r.some(cell => cell.trim() !== ""));
  if (!data.length) throw new Error("The file has no product rows.");
  if (data.length > IMPORT_MAX_ROWS) throw new Error(`This file has ${data.length} products. Import up to ${IMPORT_MAX_ROWS} at a time.`);

  const takenNames = new Map(existing.map(p => [p.name.trim().toLowerCase(), "already in your catalogue"]));
  const takenCodes = new Map(existing.filter(p => p.barcode).map(p => [p.barcode!.trim().toLowerCase(), `already used by ${p.name}`]));
  const rows: PlannedRow[] = [], skipped: SkippedRow[] = [];
  data.forEach((cells, i) => {
    const rowNumber = i + 2;
    const get = (key: string) => (index(key) >= 0 ? (cells[index(key)] ?? "").trim() : "");
    const name = get("name");
    try {
      if (!name || name.length > 120) throw new Error(name ? "The name is longer than 120 characters." : "The name is missing.");
      const price = money(get("price"), "The price", currency);
      const barcode = get("barcode") || null;
      if (barcode && !BARCODE.test(barcode)) throw new Error("The barcode may only use letters, numbers and . _ / - (up to 64).");
      const category = get("category") || null;
      if (category && category.length > 60) throw new Error("The category is longer than 60 characters.");
      const typeText = get("type").toLowerCase();
      if (typeText && !["good", "goods", "service", "services"].includes(typeText)) throw new Error("The type must be “good” or “service”.");
      const kind = typeText.startsWith("service") ? "service" as const : "good" as const;
      const quantity = get("quantity") ? whole(get("quantity"), "The quantity", 1_000_000) : 0;
      const lowText = get("low_stock");
      if (kind === "service" && (quantity > 0 || lowText)) throw new Error("A service does not hold stock, so quantity and low-stock must be empty.");
      const lowStockThreshold = lowText ? whole(lowText, "The low-stock level", 1_000_000) : null;
      const costMinor = get("cost") ? money(get("cost"), "The cost", currency) : null;

      const nameKey = name.toLowerCase();
      if (takenNames.has(nameKey)) throw new Error(`“${name}” is ${takenNames.get(nameKey)}.`);
      if (barcode && takenCodes.has(barcode.toLowerCase())) throw new Error(`The barcode ${barcode} is ${takenCodes.get(barcode.toLowerCase())}.`);

      takenNames.set(nameKey, `listed again on row ${rowNumber}`);
      if (barcode) takenCodes.set(barcode.toLowerCase(), `used again on row ${rowNumber} (${name})`);
      rows.push({
        row: rowNumber, quantity, operationId: newId(),
        input: { productId: newId(), name, unitPriceMinor: price, active: true, barcode, category, kind,
          trackStock: kind === "good", lowStockThreshold, costMinor },
      });
    } catch (cause) {
      skipped.push({ row: rowNumber, name: name || "(no name)", reason: cause instanceof Error ? cause.message : "This row could not be read." });
    }
  });
  return { rows, skipped, needsStore: rows.some(r => r.quantity > 0) };
}

export interface ImportDeps {
  saveProduct: (input: ProductInput) => Promise<unknown>;
  addStock: (productId: string, quantity: number, operationId: string) => Promise<unknown>;
}
export interface ImportResult {
  imported: number; stocked: number; failed: Array<{ row: number; name: string; reason: string }>;
  /** Rows that were never attempted because the import stopped (connection lost or access removed). */
  notAttempted: number; stopped: boolean;
}

/**
 * Sends the planned rows one by one. Every call is repeatable (the product id
 * and the stock operation id are fixed in the plan), so a dropped connection
 * can be retried safely. It stops at the first sign that the connection or the
 * person's access has gone, because continuing would only fail every row.
 */
export async function runCatalogImport(
  rows: PlannedRow[],
  deps: ImportDeps,
  onProgress: (done: number, total: number) => void = () => {},
  isStopError: (cause: unknown) => boolean = () => false,
): Promise<ImportResult> {
  const result: ImportResult = { imported: 0, stocked: 0, failed: [], notAttempted: 0, stopped: false };
  for (let i = 0; i < rows.length; i++) {
    const planned = rows[i]!;
    let saved = false;
    try {
      await deps.saveProduct(planned.input);
      saved = true;
      result.imported++;
      if (planned.quantity > 0) { await deps.addStock(planned.input.productId, planned.quantity, planned.operationId); result.stocked++; }
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : "Could not be saved.";
      // The product exists but its opening stock does not: say so, so it is not mistaken for a clean row.
      const failure = { row: planned.row, name: planned.input.name, reason: saved ? `Saved, but its opening stock was not added (${reason}). Add the stock under Stock.` : reason };
      if (isStopError(cause)) {
        result.failed.push(failure);
        result.stopped = true;
        result.notAttempted = rows.length - i - 1;
        break;
      }
      result.failed.push(failure);
    }
    onProgress(i + 1, rows.length);
  }
  return result;
}
