/** Tactile Ledger design reminder: future areas are honestly framed as recognizable business workspaces, never populated with fabricated records. */
import { ArrowLeft, Compass } from "lucide-react";
import { Link } from "wouter";
import { getRouteDefinition, type AppRouteKey } from "@/lib/routes";

const workspaceDetails: Record<Exclude<AppRouteKey, "today">, { heading: string; copy: string; rows: string[]; marker: string }> = {
  business: { heading: "Make this ledger yours.", copy: "Your business name, currency, and everyday settings will live here. Nothing is saved until you add it.", rows: ["Business name", "Money you use", "Contact details"], marker: "SET" },
  inventory: { heading: "Know what is on the shelf.", copy: "Your products, stock count, and every adjustment will appear as a clear movement record here.", rows: ["Product", "Stock movement", "Low-stock note"], marker: "STK" },
  customers: { heading: "Keep every customer account clear.", copy: "Names, contact details, purchases, and money still owed will sit together in one honest record.", rows: ["Customer", "Recent activity", "Amount due"], marker: "CUS" },
  sales: { heading: "Record each sale with confidence.", copy: "A sale will bring products, payment, stock, and a receipt together before it is marked complete.", rows: ["Items sold", "Payment received", "Receipt number"], marker: "SAL" },
  reports: { heading: "See the records that matter today.", copy: "Saved sales, payments, stock, and customer debt can be reviewed here without changing the local record.", rows: ["Sales summary", "Customer debt", "Stock attention"], marker: "RPT" },
  endOfDay: { heading: "Review what happened today.", copy: "Your local sales, recorded payments, customer activity, and stock attention can be checked without closing or locking the day.", rows: ["Sales recorded", "Money received", "Stock attention"], marker: "EOD" },
  purchases: { heading: "Know where your stock came from.", copy: "Suppliers, purchase costs, and stock received stay together in one local history.", rows: ["Supplier", "Purchased products", "Stock increase"], marker: "BUY" },
  expenses: { heading: "Keep business spending clear.", copy: "Simple expenses can sit beside your local records without changing sales, stock, or customer balances.", rows: ["Expense category", "Amount spent", "Saved date"], marker: "EXP" },
  businessHealth: { heading: "See what needs attention.", copy: "Saved figures can be reviewed in plain language without becoming an accounting statement.", rows: ["Money collected", "Expenses", "Low stock"], marker: "HLTH" },
  backup: { heading: "Keep a copy you control.", copy: "A portable backup file can hold the business record you already saved on this device.", rows: ["Backup file", "Checked record count", "Restore confirmation"], marker: "BKP" },
  assistant: { heading: "Ask for what you need.", copy: "A plain-language shortcut onto your saved sales, stock, and customer records — nothing is saved until you confirm it.", rows: ["Balances and stock", "Today's sales", "Sales, receipts, payments"], marker: "ASK" },
};

export function StagePlaceholder({ routeKey }: { routeKey: Exclude<AppRouteKey, "today"> }) {
  const route = getRouteDefinition(routeKey);
  const workspace = workspaceDetails[routeKey];
  const Icon = route.icon;

  return (
    <section className="placeholder-page">
      <div className="placeholder-rule" aria-hidden="true"><span /><span /><span /></div>
      <div className="placeholder-topline"><p className="eyebrow"><span className="eyebrow-dot" />Coming into your ledger</p><span className="workspace-marker">{workspace.marker}</span></div>
      <Icon className="mt-7 h-8 w-8 text-baobab" strokeWidth={1.6} aria-hidden="true" />
      <h1>{workspace.heading}</h1>
      <p>{workspace.copy}</p>
      <div className="ledger-workspace" aria-label={`${route.label} workspace preview`}>
        <div className="ledger-workspace-head"><span>{route.label} record</span><span className="tally-status"><i /><i /><i />Planned</span></div>
        {workspace.rows.map((row, index) => <div className="ledger-row" key={row}><span className="ledger-row-index">0{index + 1}</span><span>{row}</span><span className="ledger-row-line" /></div>)}
      </div>
      <div className="flex flex-wrap items-center gap-3"><Link href="/" className="secondary-action"><ArrowLeft className="h-4 w-4" aria-hidden="true" />Return to your ledger</Link><span className="quiet-action"><Compass className="h-4 w-4" aria-hidden="true" />No business records have been created here</span></div>
    </section>
  );
}
