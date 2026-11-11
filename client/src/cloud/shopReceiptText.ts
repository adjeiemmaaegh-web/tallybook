import { formatMinorAmount } from "@/features/inventory/inventory";
import type { ShopReceipt } from "./shopClient";

/**
 * Plain-text receipt for the shared shop: the text that is shared, copied or
 * sent on WhatsApp. It only restates what the server recorded; nothing here
 * recalculates money.
 */
export function formatShopReceiptText(receipt: ShopReceipt, locale?: string): string {
  const money = (minor: number) => formatMinorAmount(minor, receipt.currency);
  const when = new Date(receipt.recordedAt);
  const whenText = Number.isNaN(when.getTime()) ? receipt.recordedAt : when.toLocaleString(locale);
  const lines: string[] = [
    receipt.storeName,
    `Receipt #${receipt.receiptNumber} · ${whenText}`,
    "",
    ...receipt.lines.map(l => `${l.quantity} × ${l.name} — ${money(l.lineTotalMinor)}`),
  ];
  const discount = receipt.discountMinor ?? 0;
  if (discount > 0) lines.push(`Discount${receipt.discountReason ? ` (${receipt.discountReason})` : ""}: −${money(discount)}`);
  lines.push(`Total: ${money(receipt.totalMinor)}`);

  const tenders = receipt.tenders ?? [];
  if (tenders.length) {
    for (const t of tenders) {
      const label = t.method === "mobile" ? "Mobile money" : t.method === "card" ? "Card" : t.method === "credit" ? "On credit" : "Cash";
      lines.push(`${label}: ${money(t.amountMinor)}${t.method === "mobile" && t.reference ? ` (ref ${t.reference})` : ""}`);
    }
  } else {
    const p = receipt.payment;
    const label = p.method === "mobile" ? "Mobile money" : p.method === "card" ? "Card" : p.method === "credit" ? "On credit" : "Cash";
    lines.push(`${label}: ${money(p.amountDueMinor)}${p.method === "mobile" && p.reference ? ` (ref ${p.reference})` : ""}`);
  }
  if (receipt.payment.changeMinor > 0) lines.push(`Change: ${money(receipt.payment.changeMinor)}`);
  if (receipt.customer) lines.push(`Customer: ${receipt.customer.name} — now owes ${money(receipt.customer.balanceMinor)}`);

  const refunds = receipt.refunds ?? [];
  for (const r of refunds) lines.push(`Refund ${r.refundNo}: ${money(r.amountMinor)}`);
  if (refunds.length) lines.push(`Kept after refunds: ${money(receipt.totalMinor - receipt.refundedMinor)}`);

  lines.push("", "Thank you for your business.");
  return lines.join("\n");
}

const COUNTRY_BY_CURRENCY: Record<string, string> = {
  GHS: "Ghana", NGN: "Nigeria", KES: "Kenya", UGX: "Uganda", TZS: "Tanzania",
  ZAR: "South Africa", RWF: "Rwanda", ZMW: "Zambia",
};

/** The shared shop knows its currency, not a country; USD and others are ambiguous, so they get no prefix. */
export function countryForCurrency(currency: string): string | null {
  return COUNTRY_BY_CURRENCY[currency] ?? null;
}
