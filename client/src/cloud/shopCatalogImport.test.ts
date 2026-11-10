import { describe, expect, it, vi } from "vitest";
import { IMPORT_MAX_ROWS, planCatalogImport, runCatalogImport, TEMPLATE_CSV } from "./shopCatalogImport";

let n = 0;
const id = () => `id-${++n}`;
const plan = (csv: string, existing: Array<{ name: string; barcode?: string | null }> = [], currency = "GHS") => planCatalogImport(csv, currency, existing, id);

describe("planCatalogImport: reading the file", () => {
  it("reads the template: normal prices, goods and services, opening stock", () => {
    const result = plan(TEMPLATE_CSV);
    expect(result.skipped).toEqual([]);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({ row: 2, quantity: 20, input: { name: "Rice 5kg", unitPriceMinor: 9000, barcode: "6001234567890", category: "Grains",
      kind: "good", trackStock: true, lowStockThreshold: 5, costMinor: 7000, active: true } });
    expect(result.rows[1]).toMatchObject({ row: 3, quantity: 0, input: { name: "Haircut", kind: "service", trackStock: false, lowStockThreshold: null, barcode: null } });
    expect(result.needsStore).toBe(true);
  });

  it("accepts columns in any order, friendly names, quoted commas, a BOM and Windows line endings", () => {
    const csv = "﻿Product Name,Qty,Selling Price,SKU\r\n\"Tea, loose\",3,\"4.50\",T-1\r\n";
    const result = plan(csv);
    expect(result.rows[0]).toMatchObject({ quantity: 3, input: { name: "Tea, loose", unitPriceMinor: 450, barcode: "T-1" } });
  });

  it("ignores blank lines and unknown columns, and a price needs no stock", () => {
    const result = plan("name,price,colour\nBread,12,brown\n\n,,\n");
    expect(result.rows).toHaveLength(1);
    expect(result.needsStore).toBe(false);
    expect(result.rows[0]!.input.unitPriceMinor).toBe(1200);
  });

  it("uses whole amounts for currencies without cents", () => {
    expect(plan("name,price\nTea,500", [], "UGX").rows[0]!.input.unitPriceMinor).toBe(500);
    expect(plan("name,price\nTea,500.50", [], "UGX").skipped[0]!.reason).toMatch(/not a valid amount/);
  });

  it("generates a fresh product id and stock operation id per row", () => {
    const rows = plan("name,price,quantity\nA,1,2\nB,1,2").rows;
    expect(new Set(rows.flatMap(r => [r.input.productId, r.operationId])).size).toBe(4);
  });
});

describe("planCatalogImport: file-level problems stop everything with a plain sentence", () => {
  it.each([
    ["", /empty/],
    ["name\nRice\n", /at least “name” and “price”/],
    ["name,price\n", /no product rows/],
    ["name,price\n\"Rice,5\n", /not a readable CSV/],
  ])("%j", (csv, pattern) => { expect(() => plan(csv as string)).toThrow(pattern as RegExp); });
  it("limits rows and size", () => {
    const many = "name,price\n" + Array.from({ length: IMPORT_MAX_ROWS + 1 }, (_, i) => `P${i},1`).join("\n");
    expect(() => plan(many)).toThrow(/Import up to 500/);
    expect(() => plan("name,price\n" + "x".repeat(2_000_001))).toThrow(/larger than 2 MB/);
  });
});

describe("planCatalogImport: bad rows are skipped one by one with a reason", () => {
  const csv = [
    "name,price,barcode,category,type,quantity,low_stock,cost",
    ",5,,,,,,",                       // 2 missing name
    "No price,,,,,,,",                // 3 missing price
    "Bad price,abc,,,,,,",            // 4
    "Neg,-5,,,,,,",                   // 5
    "Huge,999999999999,,,,,,",        // 6
    "Bad code,5,has space,,,,,",      // 7
    "Bad type,5,,,gadget,,,",         // 8
    "Bad qty,5,,,,2.5,,",             // 9
    "Svc stock,5,,,service,3,,",      // 10
    "Svc low,5,,,service,,2,",        // 11
    "Bad low,5,,,,,x,",               // 12
    "Bad cost,5,,,,,,oops",           // 13
    "Fine,5,,,,,,",                   // 14 ok
    "x".repeat(121) + ",5,,,,,,",     // 15 long name
    "Long cat,5,," + "c".repeat(61) + ",,,,", // 16
  ].join("\n");
  it("keeps the good row and explains each bad one", () => {
    const result = plan(csv);
    expect(result.rows.map(r => r.input.name)).toEqual(["Fine"]);
    const reasons = Object.fromEntries(result.skipped.map(s => [s.row, s.reason]));
    expect(reasons[2]).toMatch(/name is missing/);
    expect(reasons[3]).toMatch(/price is missing/);
    expect(reasons[4]).toMatch(/not a valid amount/);
    expect(reasons[5]).toMatch(/not a valid amount/);
    expect(reasons[6]).toMatch(/too large/);
    expect(reasons[7]).toMatch(/barcode may only use/);
    expect(reasons[8]).toMatch(/“good” or “service”/);
    expect(reasons[9]).toMatch(/quantity must be a whole number/);
    expect(reasons[10]).toMatch(/service does not hold stock/);
    expect(reasons[11]).toMatch(/service does not hold stock/);
    expect(reasons[12]).toMatch(/low-stock level must be a whole number/);
    expect(reasons[13]).toMatch(/cost .* not a valid amount/);
    expect(reasons[15]).toMatch(/longer than 120/);
    expect(reasons[16]).toMatch(/category is longer than 60/);
    expect(result.skipped).toHaveLength(14);
  });

  it("never overwrites: existing names and barcodes are skipped, in the file and against the catalogue", () => {
    const result = plan("name,price,barcode\nRice,5,111\nrice ,6,\nMilk,5,111\nTea,5,222\nSugar,5,333",
      [{ name: "SUGAR" }, { name: "Cocoa", barcode: "222" }]);
    expect(result.rows.map(r => r.input.name)).toEqual(["Rice"]);
    const reasons = Object.fromEntries(result.skipped.map(s => [s.row, s.reason]));
    expect(reasons[3]).toMatch(/listed again on row 2/);
    expect(reasons[4]).toMatch(/barcode 111 is used again on row 2 \(Rice\)/);
    expect(reasons[5]).toMatch(/barcode 222 is already used by Cocoa/);
    expect(reasons[6]).toMatch(/already in your catalogue/);
  });
});

describe("runCatalogImport", () => {
  const rows = () => plan("name,price,quantity\nA,1,2\nB,1,\nC,1,5").rows;
  it("saves every row, adds opening stock only where there is some, and reports progress", async () => {
    const saveProduct = vi.fn().mockResolvedValue({});
    const addStock = vi.fn().mockResolvedValue({});
    const progress: number[] = [];
    const planned = rows();
    const result = await runCatalogImport(planned, { saveProduct, addStock }, done => progress.push(done));
    expect(result).toEqual({ imported: 3, stocked: 2, failed: [], notAttempted: 0, stopped: false });
    expect(addStock.mock.calls.map(c => [c[1], c[2]])).toEqual([[2, planned[0]!.operationId], [5, planned[2]!.operationId]]);
    expect(progress).toEqual([1, 2, 3]);
  });

  it("carries on past a refused row and reports it", async () => {
    const saveProduct = vi.fn().mockRejectedValueOnce(new Error("Another product already uses that barcode")).mockResolvedValue({});
    const result = await runCatalogImport(rows(), { saveProduct, addStock: vi.fn().mockResolvedValue({}) });
    expect(result.imported).toBe(2);
    expect(result.failed).toEqual([{ row: 2, name: "A", reason: "Another product already uses that barcode" }]);
    expect(result.stopped).toBe(false);
  });

  it("flags a row whose product saved but whose opening stock failed", async () => {
    const addStock = vi.fn().mockRejectedValueOnce(new Error("Stock too large")).mockResolvedValue({});
    const result = await runCatalogImport(rows(), { saveProduct: vi.fn().mockResolvedValue({}), addStock });
    expect(result.imported).toBe(3);
    expect(result.stocked).toBe(1);
    expect(result.failed[0]!.reason).toMatch(/Saved, but its opening stock was not added \(Stock too large\)/);
  });

  it("stops when the connection or access is lost and says how many rows were never tried", async () => {
    const saveProduct = vi.fn().mockResolvedValueOnce({}).mockRejectedValueOnce(new Error("offline"));
    const result = await runCatalogImport(rows(), { saveProduct, addStock: vi.fn().mockResolvedValue({}) }, () => {}, c => (c as Error).message === "offline");
    expect(result).toMatchObject({ imported: 1, stopped: true, notAttempted: 1 });
    expect(saveProduct).toHaveBeenCalledTimes(2);
    expect(result.failed.map(f => f.name)).toEqual(["B"]);
  });

  it("counts the product as saved when the stop happens while adding its stock", async () => {
    const addStock = vi.fn().mockRejectedValueOnce(new Error("offline"));
    const result = await runCatalogImport(rows(), { saveProduct: vi.fn().mockResolvedValue({}), addStock }, () => {}, () => true);
    expect(result).toMatchObject({ imported: 1, stocked: 0, stopped: true, notAttempted: 2 });
    expect(result.failed[0]!.reason).toMatch(/Saved, but its opening stock was not added/);
  });
});
