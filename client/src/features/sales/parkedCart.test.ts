import { beforeEach, describe, expect, it } from "vitest";
import { clearParkedCart, clearParkedCartIfMatches, loadParkedCart, saveParkedCart } from "./parkedCart";
describe("device-local parked POS carts", () => {
  beforeEach(() => localStorage.clear());
  it("keeps carts isolated by company", () => {
    saveParkedCart("company-a", [{ productId: "rice", quantity: 2 }]);
    expect(loadParkedCart("company-a")?.lines).toEqual([{ productId: "rice", quantity: 2 }]);
    expect(loadParkedCart("company-b")).toBeNull();
  });
  it("rejects duplicate or invalid quantities", () => {
    expect(() => saveParkedCart("a", [{ productId: "rice", quantity: 0 }])).toThrow();
    expect(() => saveParkedCart("a", [{ productId: "rice", quantity: 1 }, { productId: "rice", quantity: 1 }])).toThrow();
  });
  it("does not load malformed device data", () => {
    localStorage.setItem("tallybook:parked-cart:v1:a", '{"version":1,"parkedAt":"now","lines":[{"productId":"x","quantity":-1}]}');
    expect(loadParkedCart("a")).toBeNull();
  });
  it("does not overwrite an existing parked cart", () => {
    saveParkedCart("a", [{ productId: "rice", quantity: 2 }]);
    expect(() => saveParkedCart("a", [{ productId: "oil", quantity: 1 }])).toThrow(/already parked/);
    expect(loadParkedCart("a")?.lines).toEqual([{ productId: "rice", quantity: 2 }]);
  });
  it("does not overwrite a corrupted saved cart", () => {
    localStorage.setItem("tallybook:parked-cart:v1:a", "{damaged");
    expect(() => saveParkedCart("a", [{ productId: "rice", quantity: 1 }])).toThrow(/already parked/);
    expect(localStorage.getItem("tallybook:parked-cart:v1:a")).toBe("{damaged");
  });
  it("rejects silently dropped storage writes", () => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function() { /* simulate a silently rejected write */ };
    try {
      expect(() => saveParkedCart("a", [{ productId: "rice", quantity: 1 }])).toThrow(/could not be verified/);
    } finally { Storage.prototype.setItem = original; }
  });
  it("preserves the parked draft while checkout is uncertain and clears only a matching committed cart", () => {
    saveParkedCart("a", [{ productId: "rice", quantity: 2 }]);
    expect(clearParkedCartIfMatches("a", [{ productId: "rice", quantity: 3 }])).toBe(false);
    expect(loadParkedCart("a")?.lines).toEqual([{ productId: "rice", quantity: 2 }]);
    expect(clearParkedCartIfMatches("a", [{ productId: "rice", quantity: 2 }])).toBe(true);
    expect(loadParkedCart("a")).toBeNull();
  });
  it("never erases damaged drafts during receipt recovery", () => {
    localStorage.setItem("tallybook:parked-cart:v1:a", "{broken");
    expect(clearParkedCartIfMatches("a", [{ productId: "rice", quantity: 1 }])).toBe(false);
    expect(localStorage.getItem("tallybook:parked-cart:v1:a")).toBe("{broken");
  });
  it("removes a resumed or discarded cart", () => {
    saveParkedCart("a", [{ productId: "rice", quantity: 1 }]); clearParkedCart("a"); expect(loadParkedCart("a")).toBeNull();
  });
});
