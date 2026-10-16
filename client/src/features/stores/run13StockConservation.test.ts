import { describe, expect, it } from "vitest";
import { reconcileStoreStockPlan } from "./run13StockConservation.mjs";

const companyId = "company-a";
const products = [{id:"rice",businessProfileId:companyId,stockQuantity:10}];
const stores = [
  {id:"north",businessProfileId:companyId,status:"active" as const},
  {id:"south",businessProfileId:companyId,status:"active" as const},
];
const allocation = {businessProfileId:companyId,storeId:"north",productId:"rice",quantity:8};
const transfer = {id:"t1",businessProfileId:companyId,sourceStoreId:"north",destinationStoreId:"south",productId:"rice",quantity:3};
const plan = (overrides: Record<string,unknown> = {}) =>
  reconcileStoreStockPlan({companyId,products,stores,allocations:[allocation],transfers:[transfer],...overrides});

describe("Run 13 hypothetical store-stock conservation (QA DEFERRED)", () => {
  it("conserves company quantity and keeps all results non-authoritative", () => {
    const p = plan();
    expect(p.authoritative).toBe(false);
    expect(p.balances).toEqual([
      {storeId:"north",productId:"rice",quantity:5},
      {storeId:"south",productId:"rice",quantity:3},
    ]);
    expect(p.unallocated).toEqual([{productId:"rice",quantity:2}]);
    expect(p.transferCount).toBe(1);
  });
  it("rejects allocating more than company stock", () =>
    expect(() => plan({allocations:[{...allocation,quantity:11}],transfers:[]})).toThrow(/exceed/));
  it("rejects duplicate allocation", () =>
    expect(() => plan({allocations:[allocation,allocation],transfers:[]})).toThrow(/Duplicate/));
  it("rejects negative or fractional transfer quantity", () =>
    expect(() => plan({transfers:[{...transfer,quantity:-1}]})).toThrow(/Invalid/));
  it("rejects transfer quantity beyond the source balance", () =>
    expect(() => plan({transfers:[{...transfer,quantity:9}]})).toThrow(/Insufficient/));
  it("rejects duplicate transfer identifiers", () =>
    expect(() => plan({transfers:[transfer,transfer]})).toThrow(/duplicated/));
  it("refuses foreign-company store allocations", () =>
    expect(() => plan({allocations:[{...allocation,businessProfileId:"foreign"}]})).toThrow(/Invalid/));
  it("refuses foreign-company stock", () =>
    expect(() => plan({products:[{...products[0],businessProfileId:"foreign"}]})).toThrow(/company/));
  it("refuses transfer to an inactive store", () =>
    expect(() => plan({stores:[stores[0],{...stores[1],status:"closed"}]})).toThrow(/Invalid/));
  it("refuses unknown products and duplicate store identities", () => {
    expect(() => plan({transfers:[{...transfer,productId:"missing"}]})).toThrow(/Invalid/);
    expect(() => plan({stores:[stores[0],stores[0]]})).toThrow(/Duplicate/);
  });
});
