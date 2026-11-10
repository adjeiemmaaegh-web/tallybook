import { describe, expect, it } from "vitest";
import { filterProducts, findByBarcode, normalizeCode, sameCode } from "./productSearch";

const products = [
  { id: "1", name: "Eggs (crate)", barcode: "6001234567890", category: "Dairy" },
  { id: "2", name: "Milo 400g", barcode: "012345678905", category: "Drinks" },
  { id: "3", name: "Haircut", barcode: null, category: "Salon" },
  { id: "4", name: "Abc code", barcode: "AB-12/x", category: null },
];

describe("normalizeCode", () => {
  it("strips scanner line breaks and control characters, trims and caps the length", () => {
    expect(normalizeCode("  6001234567890\r\n")).toBe("6001234567890");
    expect(normalizeCode("\u0002123\u0003")).toBe("123");
    expect(normalizeCode("9".repeat(100))).toHaveLength(64);
    expect(normalizeCode("")).toBe("");
  });
});

describe("sameCode", () => {
  it("matches equal codes ignoring case", () => {
    expect(sameCode("AB-12/x", "ab-12/X")).toBe(true);
    expect(sameCode("123", "124")).toBe(false);
  });
  it("treats a 13-digit EAN with a leading zero as its 12-digit UPC-A", () => {
    expect(sameCode("0012345678905", "012345678905")).toBe(true);
    expect(sameCode("0012345678905", "012345678906")).toBe(false);
    expect(sameCode("0123456789012", "123456789012")).toBe(true);
    expect(sameCode("123456789012", "0123456789012")).toBe(true);
  });
  it("does not stretch the rule to other lengths or non-digits", () => {
    expect(sameCode("00123", "123")).toBe(false);
    expect(sameCode("0AB123456789", "AB123456789")).toBe(false);
    expect(sameCode("", "")).toBe(false);
  });
});

describe("findByBarcode", () => {
  it("finds exact, padded and case-different codes", () => {
    expect(findByBarcode(products, "6001234567890\n")?.id).toBe("1");
    expect(findByBarcode(products, "0012345678905")?.id).toBe("2");
    expect(findByBarcode(products, "ab-12/X")?.id).toBe("4");
  });
  it("never matches a product without a barcode, an empty scan or an unknown code", () => {
    expect(findByBarcode(products, "")).toBeNull();
    expect(findByBarcode(products, "   ")).toBeNull();
    expect(findByBarcode(products, "999")).toBeNull();
    expect(findByBarcode([{ id: "x", name: "No code", barcode: null }], "null")).toBeNull();
  });
});

describe("filterProducts", () => {
  it("matches name, category and barcode, case-insensitively", () => {
    expect(filterProducts(products, "eggs").map(p => p.id)).toEqual(["1"]);
    expect(filterProducts(products, "SALON").map(p => p.id)).toEqual(["3"]);
    expect(filterProducts(products, "6001").map(p => p.id)).toEqual(["1"]);
    expect(filterProducts(products, "o").map(p => p.id)).toEqual(["2", "3", "4"]); // Milo, Salon, "Abc code"
  });
  it("keeps everything for a blank query and nothing for a miss", () => {
    expect(filterProducts(products, "  ")).toHaveLength(4);
    expect(filterProducts(products, "zzz")).toEqual([]);
  });
});
