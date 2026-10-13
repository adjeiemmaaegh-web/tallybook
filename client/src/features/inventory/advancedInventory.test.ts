import { describe, expect, it } from "vitest";
import { validateImportedIdentifiers } from "./advancedInventory";

describe("V9 import identifier preflight", () => {
  it("accepts distinct identifiers", () => expect(() => validateImportedIdentifiers([{sku:"RICE",barcode:"123"},{sku:"OIL",barcode:"456"}])).not.toThrow());
  it("rejects cross-field collisions", () => expect(() => validateImportedIdentifiers([{sku:"RICE"},{barcode:" rice "}])).toThrow(/Duplicate/));
  it("rejects collisions within a row", () => expect(() => validateImportedIdentifiers([{sku:"RICE",barcode:"rice"}])).toThrow(/Duplicate/));
});
