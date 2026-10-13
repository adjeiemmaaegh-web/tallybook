import { describe, expect, it } from "vitest";
import { escapeCsvSpreadsheetFormula, parseCsvRecords, previewCatalogImport } from "./catalogCsv";
const header = "name,sku,barcode,categoryId,sellingPriceMinor,costPriceMinor,stockQuantity,lowStockThreshold\n";
describe("offline catalogue CSV preview", () => {
  it("parses quotes, line breaks and commas", () => {
    expect(parseCsvRecords('a,b\n"hi, there","escaped ""quote"""\n')).toEqual([["a","b"],["hi, there",'escaped "quote"']]);
  });
  it("previews valid rows without writing data", () => {
    expect(previewCatalogImport(header + 'Rice,R1,B1,uncategorized,500,200,12,3\n')).toMatchObject([{name:"Rice",sku:"R1",stockQuantity:"12"}]);
  });
  it("rejects duplicate identifiers across SKU/barcode fields", () => {
    expect(() => previewCatalogImport(header + 'Rice,R1,B1,uncategorized,500,200,12,3\nOil,O1,r1,uncategorized,300,100,2,1\n')).toThrow(/duplicate/i);
  });
  it("rejects malformed and negative quantities", () => {
    expect(() => previewCatalogImport(header + 'Rice,R1,B1,uncategorized,500,200,-1,3\n')).toThrow(/invalid stockQuantity/);
    expect(() => previewCatalogImport(header + 'Rice,R1,B1,uncategorized,500,200,3\n')).toThrow(/columns/);
    expect(() => parseCsvRecords('"unfinished')).toThrow(/Unterminated/);
  });
  it("escapes spreadsheet formulas on export", () => {
    expect(escapeCsvSpreadsheetFormula('=HYPERLINK("x")')).toBe('\'=HYPERLINK("x")');
  });
});
