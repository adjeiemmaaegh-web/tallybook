import { formatMinorAmount } from "@/features/inventory/inventory";
import type { CustomerStatement } from "./shopClient";

const KIND = { credit_sale: "Bought on credit", repayment: "Paid", refund: "Refund taken off" } as const;
const METHOD = { cash: "cash", mobile: "mobile money", card: "card" } as const;

/**
 * Plain-text statement for one customer: what is shared, copied or sent on
 * WhatsApp. It restates the server's entries and balance; nothing is
 * recalculated. Long histories keep the newest entries and say so.
 */
export function formatCustomerStatementText(shopName: string, statement: CustomerStatement, currency: string, locale?: string, maxEntries = 40): string {
  const money = (minor: number) => formatMinorAmount(minor, currency);
  const entries = statement.entries;
  const shown = entries.slice(-maxEntries);
  const lines = [`${shopName}`, `Statement for ${statement.name}`, ""];
  if (shown.length < entries.length) lines.push(`(latest ${shown.length} of ${entries.length} entries)`);
  for (const e of shown) {
    const when = new Date(e.recordedAt);
    const date = Number.isNaN(when.getTime()) ? e.recordedAt : when.toLocaleDateString(locale);
    const what = [KIND[e.kind], e.receiptNumber ? `receipt #${e.receiptNumber}` : null, e.method ? METHOD[e.method] : null].filter(Boolean).join(" · ");
    lines.push(`${date} — ${what}: ${e.amountMinor > 0 ? "+" : "−"}${money(Math.abs(e.amountMinor))} (owes ${money(e.balanceAfterMinor)})`);
  }
  if (!entries.length) lines.push("No activity yet.");
  lines.push("", statement.balanceMinor > 0 ? `Balance owed: ${money(statement.balanceMinor)}` : "Balance owed: nothing", "", "Thank you.");
  return lines.join("\n");
}
