/** Stage 9 regression: sharing produces short owner-facing text from supplied saved facts and has native, clipboard, and manual fallbacks. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { formatCustomerBalanceShareText, formatPaymentConfirmationShareText, shareBusinessText } from "@/features/sharing/businessSharing";

const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
afterEach(() => { vi.restoreAllMocks(); if (navigatorDescriptor) Object.defineProperty(globalThis, "navigator", navigatorDescriptor); });

describe("Stage 9 local sharing", () => {
  it("formats short, professional balance and payment messages without internal record identifiers", () => {
    const balance = formatCustomerBalanceShareText({ businessName: "Kofi's Corner", customerName: "Ama Mensah", outstandingLabel: "GHS 30.00" });
    const payment = formatPaymentConfirmationShareText({ businessName: "Kofi's Corner", customerName: "Ama Mensah", amountLabel: "GHS 10.00", methodLabel: "Mobile Money", recordedAt: "2026-08-27T10:00:00.000Z", note: "After market day" });

    expect(balance).toBe("Hello Ama Mensah,\n\nYour current outstanding balance with Kofi's Corner is GHS 30.00.\n\nThank you.");
    expect(payment).toContain("Kofi's Corner received your payment of GHS 10.00 by Mobile Money");
    expect(payment).toContain("Note: After market day");
    expect(`${balance}\n${payment}`).not.toMatch(/customer-|sale-|submission|provider/i);
  });

  it("uses device sharing first, then clipboard copy, then a manual-copy fallback", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: { share } });
    await expect(shareBusinessText({ title: "Customer balance", text: "Balance text" })).resolves.toBe("shared");
    expect(share).toHaveBeenCalledWith({ title: "Customer balance", text: "Balance text" });

    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: { clipboard: { writeText } } });
    await expect(shareBusinessText({ title: "Payment confirmation", text: "Payment text" })).resolves.toBe("copied");
    expect(writeText).toHaveBeenCalledWith("Payment text");

    Object.defineProperty(globalThis, "navigator", { configurable: true, value: {} });
    await expect(shareBusinessText({ title: "Customer balance", text: "Manual text" })).resolves.toBe("manual");
  });

  it("treats a cancelled native-share sheet as a safe no-op", async () => {
    const share = vi.fn().mockRejectedValue(new DOMException("Closed", "AbortError"));
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: { share } });
    await expect(shareBusinessText({ title: "Receipt", text: "Receipt text" })).resolves.toBe("cancelled");
  });
});
