import { describe, expect, it } from "vitest";
import { MAX_PARKED, PARKED_MAX_AGE_MS, parkCart, parkedItemCount, parkedKey, restoreCart, sanitizeParked, type ParkedCart, type RestoreProduct } from "./parkedCarts";

const NOW = Date.parse("2026-11-10T12:00:00Z");
const cart = (over: Partial<ParkedCart> = {}): ParkedCart => ({ id: "c1", parkedAt: "2026-11-10T11:00:00.000Z", customerId: null, lines: [{ productId: "eggs", quantity: 2 }], ...over });

describe("parkedKey", () => {
  it("is scoped by person, business and store", () => {
    expect(parkedKey("u1", "biz", "st")).toBe("tallybook.shop.parked.v1:u1:biz:st");
    expect(parkedKey("u2", "biz", "st")).not.toBe(parkedKey("u1", "biz", "st"));
  });
});

describe("sanitizeParked", () => {
  it("keeps good carts and drops everything malformed", () => {
    const good = cart();
    const stored = [good, "junk", null, { id: "x" }, cart({ id: "empty", lines: [] }), cart({ id: "badline", lines: [{ productId: "p", quantity: 0 }, { productId: "p2", quantity: 1.5 }, { productId: "p3", quantity: "2" }] }),
      cart({ id: "nodate", parkedAt: "yesterday-ish" })];
    expect(sanitizeParked(stored, NOW)).toEqual([good]);
    expect(sanitizeParked("nope", NOW)).toEqual([]);
    expect(sanitizeParked(undefined, NOW)).toEqual([]);
  });
  it("drops carts older than a day and carts dated in the future", () => {
    const old = cart({ id: "old", parkedAt: new Date(NOW - PARKED_MAX_AGE_MS - 1000).toISOString() });
    const future = cart({ id: "future", parkedAt: new Date(NOW + 3600_000).toISOString() });
    const fresh = cart({ id: "fresh", parkedAt: new Date(NOW - 1000).toISOString() });
    expect(sanitizeParked([old, future, fresh], NOW).map(c => c.id)).toEqual(["fresh"]);
  });
  it("de-duplicates products within a cart, nulls a bad customer and caps the list", () => {
    const dup = cart({ lines: [{ productId: "a", quantity: 1 }, { productId: "a", quantity: 9 }], customerId: 42 as never });
    expect(sanitizeParked([dup], NOW)[0]).toMatchObject({ lines: [{ productId: "a", quantity: 1 }], customerId: null });
    const many = Array.from({ length: 12 }, (_, i) => cart({ id: `c${i}` }));
    expect(sanitizeParked(many, NOW)).toHaveLength(MAX_PARKED);
  });
});

describe("parkCart", () => {
  const ids = () => { let n = 0; return () => `id-${++n}`; };
  it("puts the new cart first and records the customer", () => {
    const first = parkCart([], { eggs: 2, milk: 0 }, "cust", new Date(NOW), ids());
    expect(first).toEqual([{ id: "id-1", parkedAt: new Date(NOW).toISOString(), customerId: "cust", lines: [{ productId: "eggs", quantity: 2 }] }]);
    const second = parkCart(first, { milk: 1 }, null, new Date(NOW + 1000), ids());
    expect(second.map(c => c.lines[0]!.productId)).toEqual(["milk", "eggs"]);
    expect(second[0]!.customerId).toBeNull();
  });
  it("refuses an empty cart and a full shelf of parked carts, in plain words", () => {
    expect(() => parkCart([], {}, null)).toThrow(/nothing in the cart/);
    expect(() => parkCart([], { a: 0 }, null)).toThrow(/nothing in the cart/);
    const full = Array.from({ length: MAX_PARKED }, (_, i) => cart({ id: `c${i}` }));
    expect(() => parkCart(full, { a: 1 }, null)).toThrow(/already have 5 parked carts/);
  });
});

describe("restoreCart: checked against today's products and stock", () => {
  const products: RestoreProduct[] = [
    { id: "eggs", name: "Eggs", active: true, unitPriceMinor: 4500, tracked: true },
    { id: "milk", name: "Milk", active: true, unitPriceMinor: 800, tracked: true },
    { id: "cut", name: "Haircut", active: true, unitPriceMinor: 5000, tracked: false },
    { id: "old", name: "Old line", active: false, unitPriceMinor: 100, tracked: true },
  ];
  const stock = (id: string) => ({ eggs: 3, milk: 0, old: 9 } as Record<string, number>)[id] ?? 0;
  const parked = cart({ lines: [{ productId: "eggs", quantity: 5 }, { productId: "milk", quantity: 1 }, { productId: "cut", quantity: 4 }, { productId: "old", quantity: 1 }, { productId: "gone", quantity: 1 }] });

  it("lowers counted goods to the stock on hand and drops what can no longer be sold", () => {
    const restored = restoreCart(parked, products, stock);
    expect(restored.cart).toEqual({ eggs: 3, cut: 4 });
    expect(restored.reduced).toEqual(["Eggs (3 of 5)"]);
    expect(restored.unavailable).toEqual(["Milk (out of stock)", "Old line", "A product that was removed"]);
  });
  it("keeps services at their parked quantity, up to a sane limit", () => {
    expect(restoreCart(cart({ lines: [{ productId: "cut", quantity: 2000 }] }), products, stock).cart).toEqual({ cut: 1000 });
  });
  it("returns an empty cart when nothing survives", () => {
    const restored = restoreCart(cart({ lines: [{ productId: "milk", quantity: 1 }] }), products, stock);
    expect(restored.cart).toEqual({});
  });
});

it("counts the units in a parked cart", () => {
  expect(parkedItemCount(cart({ lines: [{ productId: "a", quantity: 2 }, { productId: "b", quantity: 3 }] }))).toBe(5);
});
