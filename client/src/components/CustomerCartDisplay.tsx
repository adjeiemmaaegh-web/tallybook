import { calculateSaleTax, type TaxPolicy } from "@/features/sales/tax";
import type { GhanaTaxTreatment } from "@/features/sales/ghanaVat.mjs";
import { calculateDisplayCart, type DisplayCartLine } from "@/features/sales/customerCartSummary";
import { useEffect } from "react";
import { formatMinorAmount } from "@/features/inventory/inventory";

export type CustomerCartDisplayLine = DisplayCartLine & {ghanaTaxTreatment?: GhanaTaxTreatment};

/** The customer view is deliberately presentation-only. It never reads or writes local storage. */
export function CustomerCartDisplay({ businessName, currency, lines, discountMinor, taxPolicy, onClose }: {
  taxPolicy?: TaxPolicy; businessName: string; currency: string; lines: CustomerCartDisplayLine[]; discountMinor: number; onClose: () => void;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);
  let totals: ReturnType<typeof calculateDisplayCart> | null = null;
  try { totals = calculateDisplayCart(lines, discountMinor); const tax = lines.length ? calculateSaleTax(lines.map(line => ({amountMinor: line.unitPriceMinor * line.quantity, treatment: line.ghanaTaxTreatment})), discountMinor, taxPolicy) : undefined; if (tax) totals.totalMinor = tax.totalMinor; } catch { totals = null; /* Never show an unclassified untaxed amount as the final total. */ }
  return <section role="dialog" aria-modal="true" aria-label="Customer-facing cart" className="fixed inset-0 z-[110] overflow-y-auto bg-background p-4 sm:p-10">
    <div className="mx-auto max-w-3xl space-y-7">
      <header className="flex items-start justify-between gap-4 border-b pb-5"><div><p className="text-sm uppercase tracking-widest">Customer view · not a receipt</p><h2 className="text-3xl font-bold">{businessName}</h2><p className="text-sm">Review the items before the cashier confirms the sale.</p></div><button type="button" autoFocus onClick={onClose} className="rounded border px-5 py-3 font-semibold">Close customer view</button></header>
      {lines.length ? <ul className="space-y-3" aria-label="Cart items">{lines.map((line, index) => <li key={`${index}-${line.name}`} className="flex items-center justify-between gap-4 border-b py-4 text-lg"><span><strong>{line.name}</strong><span className="block text-sm">{line.quantity} × {formatMinorAmount(line.unitPriceMinor, currency)}</span></span><strong>{formatMinorAmount(line.quantity * line.unitPriceMinor, currency)}</strong></li>)}</ul> : <p role="status">No items have been added.</p>}
      {totals ? <div className="space-y-3 border-t pt-5 text-xl"><div className="flex justify-between"><span>Subtotal</span><strong>{formatMinorAmount(totals.subtotalMinor, currency)}</strong></div><div className="flex justify-between"><span>Discount</span><strong>{formatMinorAmount(discountMinor, currency)}</strong></div><div className="flex justify-between text-3xl font-bold"><span>Amount due{taxPolicy?.enabled ? " (with tax)" : ""}</span><strong>{formatMinorAmount(totals.totalMinor, currency)}</strong></div></div> : <p role="alert">This cart total needs review by the cashier.</p>}
      <p className="text-sm">Preview only. No payment has been taken or sale recorded by this screen.</p>
    </div>
  </section>;
}
