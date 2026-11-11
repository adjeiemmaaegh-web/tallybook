import type { ShopReceipt } from "./shopClient";

/** Test fixture: a split-tender sale with a discount and a credit customer. */
export const sampleReceipt = (over: Partial<ShopReceipt> = {}): ShopReceipt => ({
  saleId: "s1", companyId: "c1", storeId: "st1", storeName: "Accra Main", cashierId: "u1",
  submissionKey: "k", receiptNumber: 42, currency: "GHS", totalMinor: 4500, subtotalMinor: 5000,
  discountMinor: 500, discountReason: "Regular customer",
  customer: { id: "cu1", name: "Kofi", phone: "0244123456", creditLimitMinor: 10000, balanceMinor: 1500 },
  recordedAt: "2026-11-10T09:30:00.000Z", replayed: false,
  payment: { method: "split", amountDueMinor: 4500, amountTenderedMinor: 4000, changeMinor: 0, reference: null },
  tenders: [
    { method: "cash", amountMinor: 1000, tenderedMinor: 1000, reference: null },
    { method: "mobile", amountMinor: 2000, tenderedMinor: 2000, reference: "MP123" },
    { method: "credit", amountMinor: 1500, tenderedMinor: 1500, reference: null },
  ],
  lines: [
    { lineNo: 1, productId: "p1", name: "Eggs (crate)", quantity: 2, unitPriceMinor: 2000, lineTotalMinor: 4000, refundedQuantity: 0 },
    { lineNo: 2, productId: "p2", name: "Milo", quantity: 1, unitPriceMinor: 1000, lineTotalMinor: 1000, refundedQuantity: 0 },
  ],
  refundedMinor: 0, refunds: [],
  ...over,
});
