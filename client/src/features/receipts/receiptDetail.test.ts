import { afterEach, describe, expect, it, vi } from "vitest";
import { formatReceiptShareText, receiptPaymentDescription, resolveReceiptDetail, shareReceiptText } from "@/features/receipts/receiptDetail";
import type { SaleSnapshot } from "@/features/sales/sales";

const profile = { name: "Kofi's Corner", currency: "GHS" };
const customers = [{ id: "customer-1", name: "Ama Mensah" }];
const snapshot: SaleSnapshot = {
  sales: [{ id: "sale-1", businessProfileId: "primary", customerId: "customer-1", receiptNumber: "TB-20260826-ABCDE", status: "completed", subtotalMinor: 5000, discountMinor: 500, totalMinor: 4500, amountPaidMinor: 1500, outstandingMinor: 3000, paymentMethod: "mobile", submissionKey: "internal-submission-key", createdAt: "2026-08-26T10:00:00.000Z" }],
  lines: [{ id: "line-1", saleId: "sale-1", productId: "internal-product-id", productName: "Cooking oil", quantity: 2, unitPriceMinor: 2500, lineTotalMinor: 5000 }],
  payments: [{ id: "payment-1", saleId: "sale-1", customerId: "customer-1", method: "mobile", amountMinor: 1500, mobileMoneyProviderId: "internal-provider-id", mobileMoneyProviderName: "MTN MoMo", mobileMoneyReference: "MOMO-77", createdAt: "2026-08-26T10:00:00.000Z" }],
  receipts: [{ id: "receipt-1", saleId: "sale-1", receiptNumber: "TB-20260826-ABCDE", issuedAt: "2026-08-26T10:00:00.000Z" }],
};

const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
afterEach(() => { vi.restoreAllMocks(); if (navigatorDescriptor) Object.defineProperty(globalThis, "navigator", navigatorDescriptor); });

describe("read-only receipt detail", () => {
  it("distinguishes prepaid settlement from fresh cash received", () => {
    const wallet: SaleSnapshot = { ...snapshot, sales: [{ ...snapshot.sales[0], paymentMethod: "wallet", walletAppliedMinor: 1500 }], payments: [] };
    const detail = resolveReceiptDetail({ receiptId: "receipt-1", snapshot: wallet, profile, customers })!;
    const text = formatReceiptShareText(detail);
    expect(text).toMatch(/Settled: GHS\s15\.00/);
    expect(text).toMatch(/Prepaid wallet used: GHS\s15\.00/);
    expect(text).toMatch(/New cash received: GHS\s0\.00/);
    expect(text).toMatch(/Remaining: GHS\s30\.00/);
  });
  it("reconstructs original part-paid Mobile Money sale facts without changing the saved records", () => {
    const original = JSON.stringify(snapshot);
    const detail = resolveReceiptDetail({ receiptId: "receipt-1", snapshot, profile, customers });

    expect(detail).toBeDefined();
    expect(detail?.customerName).toBe("Ama Mensah");
    expect(detail?.sale).toMatchObject({ totalMinor: 4500, amountPaidMinor: 1500, outstandingMinor: 3000, discountMinor: 500 });
    expect(detail?.lines).toMatchObject([{ productName: "Cooking oil", quantity: 2, unitPriceMinor: 2500, lineTotalMinor: 5000 }]);
    expect(receiptPaymentDescription(detail!)).toBe("Mobile Money · MTN MoMo · Ref MOMO-77");
    expect(JSON.stringify(snapshot)).toBe(original);
  });

  it("renders clean professional share text without private database fields", () => {
    const detail = resolveReceiptDetail({ receiptId: "receipt-1", snapshot, profile, customers })!;
    const text = formatReceiptShareText(detail);

    expect(text).toContain("Kofi's Corner");
    expect(text).toContain("Receipt TB-20260826-ABCDE");
    expect(text).toContain("Customer: Ama Mensah");
    expect(text).toContain("Cooking oil × 2");
    expect(text).toMatch(/Discount: GHS\s5\.00/);
    expect(text).toMatch(/Settled: GHS\s15\.00/);
    expect(text).toMatch(/Remaining: GHS\s30\.00/);
    expect(text).toContain("Payment: Mobile Money · MTN MoMo · Ref MOMO-77");
    expect(text).not.toContain("sale-1");
    expect(text).not.toContain("customer-1");
    expect(text).not.toContain("internal-submission-key");
    expect(text).not.toContain("internal-provider-id");
  });

  it("uses the native sharing mechanism when supported", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: { share } });

    await expect(shareReceiptText("Saved receipt text")).resolves.toBe("shared");
    expect(share).toHaveBeenCalledWith({ title: "Tallybook receipt", text: "Saved receipt text" });
  });

  it("falls back to clipboard copy, then manual copy only when browser sharing is unavailable", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: { clipboard: { writeText } } });
    await expect(shareReceiptText("Copy this receipt")).resolves.toBe("copied");
    expect(writeText).toHaveBeenCalledWith("Copy this receipt");

    Object.defineProperty(globalThis, "navigator", { configurable: true, value: {} });
    await expect(shareReceiptText("Manual receipt")).resolves.toBe("manual");
  });

  it("keeps historical mobile records without provider details readable", () => {
    const historical: SaleSnapshot = { ...snapshot, payments: [{ id: "payment-old", saleId: "sale-1", method: "mobile", amountMinor: 1500, createdAt: "2026-08-25T10:00:00.000Z" }] };
    const detail = resolveReceiptDetail({ receiptId: "receipt-1", snapshot: historical, profile, customers })!;
    expect(receiptPaymentDescription(detail)).toBe("Mobile Money");
  });

  it("preserves the original credit-sale amount story without using a customer’s later total debt", () => {
    const credit: SaleSnapshot = { ...snapshot, sales: [{ ...snapshot.sales[0], amountPaidMinor: 0, outstandingMinor: 4500, paymentMethod: "credit" }], payments: [] };
    const detail = resolveReceiptDetail({ receiptId: "receipt-1", snapshot: credit, profile, customers })!;

    expect(detail.sale).toMatchObject({ totalMinor: 4500, amountPaidMinor: 0, outstandingMinor: 4500 });
    expect(receiptPaymentDescription(detail)).toBe("Credit · Pay later");
    expect(formatReceiptShareText(detail)).toMatch(/Settled: GHS\s0\.00[\s\S]*Remaining: GHS\s45\.00/);
  });
});
