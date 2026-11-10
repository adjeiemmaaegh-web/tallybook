import { describe, expect, it } from "vitest";
import { countryForCurrency, formatShopReceiptText } from "./shopReceiptText";
import type { ShopReceipt } from "./shopClient";
import { sampleReceipt } from "./testReceipt";

describe("formatShopReceiptText", () => {
  it("restates items, discount, total, each tender and the customer's balance", () => {
    const text = formatShopReceiptText(sampleReceipt(), "en-GB");
    expect(text).toContain("Accra Main");
    expect(text).toContain("Receipt #42");
    expect(text).toMatch(/2 × Eggs \(crate\) — .*40\.00/);
    expect(text).toMatch(/Discount \(Regular customer\): −.*5\.00/);
    expect(text).toMatch(/Total: .*45\.00/);
    expect(text).toMatch(/Cash: .*10\.00/);
    expect(text).toMatch(/Mobile money: .*20\.00 \(ref MP123\)/);
    expect(text).toMatch(/On credit: .*15\.00/);
    expect(text).toMatch(/Customer: Kofi — now owes .*15\.00/);
    expect(text.trimEnd().endsWith("Thank you for your business.")).toBe(true);
  });

  it("shows refunds and the amount kept", () => {
    const text = formatShopReceiptText(sampleReceipt({
      refundedMinor: 1000,
      refunds: [{ refundId: "r1", refundNo: 1, amountMinor: 1000, method: "cash", returnedToStock: true, reason: "Damaged", actorId: "u1", recordedAt: "2026-11-10T10:00:00Z", lines: [] }],
    }));
    expect(text).toMatch(/Refund 1: .*10\.00/);
    expect(text).toMatch(/Kept after refunds: .*35\.00/);
  });

  it("falls back to the single-payment shape and reports change", () => {
    const text = formatShopReceiptText(sampleReceipt({
      tenders: undefined, discountMinor: 0, customer: null, totalMinor: 5000,
      payment: { method: "cash", amountDueMinor: 5000, amountTenderedMinor: 6000, changeMinor: 1000, reference: null },
    }));
    expect(text).not.toContain("Discount");
    expect(text).not.toContain("Customer:");
    expect(text).toMatch(/Cash: .*50\.00/);
    expect(text).toMatch(/Change: .*10\.00/);
  });
});

describe("countryForCurrency", () => {
  it("maps single-country currencies and refuses ambiguous ones", () => {
    expect(countryForCurrency("GHS")).toBe("Ghana");
    expect(countryForCurrency("NGN")).toBe("Nigeria");
    expect(countryForCurrency("USD")).toBeNull();
    expect(countryForCurrency("EUR")).toBeNull();
  });
});
