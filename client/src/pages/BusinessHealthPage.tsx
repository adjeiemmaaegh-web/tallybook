/** Tallybook Africa Stage 8 design reminder: Business Health is read-only, plainly labelled local context—not profit, tax, a cash balance, or an accounting statement. */
import { ArrowLeft, ArrowRight, BarChart3, CircleDollarSign, ClipboardList, PackageSearch, ReceiptText, UsersRound, WalletCards } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "wouter";
import { formatMinorAmount } from "@/features/inventory/inventory";
import { getBusinessHealthSummary, reportPeriods, type BusinessHealthSummary, type ReportPeriod } from "@/features/reports/reports";
import { useBusinessProfile } from "@/contexts/BusinessProfileContext";

const periodLabel: Record<ReportPeriod, string> = { today: "Today", last7: "Last 7 days", all: "All time" };

export default function BusinessHealthPage() {
  const { profile, activeCompanyId } = useBusinessProfile();
  const [period, setPeriod] = useState<ReportPeriod>("today");
  const [summary, setSummary] = useState<BusinessHealthSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    if (!profile) return;
    setLoading(true); setError(null);
    try { setSummary(await getBusinessHealthSummary(period)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "We could not read your saved Business Health records."); }
    finally { setLoading(false); }
  }, [activeCompanyId, period, profile]);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => { const update = () => { void refresh(); }; window.addEventListener("focus", update); window.addEventListener("pageshow", update); return () => { window.removeEventListener("focus", update); window.removeEventListener("pageshow", update); }; }, [refresh]);
  useEffect(() => { setSummary(null); }, [activeCompanyId]);

  if (!profile) return <section className="reports-gate"><div className="reports-gate-sheet"><div className="reports-gate-brand"><strong>Tallybook</strong><span>Business ledger</span></div><span className="workspace-marker">HLTH</span><p className="eyebrow"><span className="eyebrow-dot" />Business Health prerequisites</p><h1>Set the record before you check what needs attention.</h1><p>Your business name and receipt currency give every saved figure a clear local context.</p><div className="reports-prerequisite-list"><div><span>01</span><strong>Business name</strong><small>Names the ledger these figures belong to.</small></div><div><span>02</span><strong>Receipt currency</strong><small>Keeps sales, payments, and expenses comparable.</small></div><div><span>03</span><strong>Saved records</strong><small>Sales, customer debt, expenses, and stock appear after setup.</small></div></div><p className="reports-gate-tally"><b>Two details to begin</b><span>Business name · Currency</span></p><Link href="/business" className="primary-action">Set up business</Link></div></section>;
  const cards = summary ? [
    { label: "Sales recorded", value: formatMinorAmount(summary.salesMinor, profile.currency), note: "Completed sales in this period", icon: ReceiptText, href: "/sales" },
    { label: "Money collected", value: formatMinorAmount(summary.moneyCollectedMinor, profile.currency), note: "Sale payments and customer payments", icon: WalletCards, href: "/reports" },
    { label: "Customers still owe", value: formatMinorAmount(summary.outstandingDebtMinor, profile.currency), note: "Current balance across saved records", icon: UsersRound, href: "/customers?view=owing" },
    { label: "Money spent", value: formatMinorAmount(summary.expensesMinor, profile.currency), note: `${summary.expenseCount} saved expense${summary.expenseCount === 1 ? "" : "s"} in this period`, icon: CircleDollarSign, href: "/expenses" },
  ] : [];
  return <div className="business-health-page">
    <section className="health-hero"><p className="eyebrow"><span className="eyebrow-dot" />Plain local business view</p><span className="workspace-marker">HLTH</span><h1>See what needs <em>attention.</em></h1><p>These figures come from records saved on this device. They keep sales, collected money, customer debt, expenses, and low stock separate.</p><div className="health-periods" aria-label="Business Health date range">{reportPeriods.map((value) => <button key={value} type="button" className={period === value ? "is-selected" : ""} onClick={() => setPeriod(value)}>{periodLabel[value]}</button>)}</div></section>
    {loading ? <p className="inventory-loading">Reading saved Business Health records…</p> : error ? <section className="health-error" role="alert"><strong>Your Business Health view needs attention.</strong><p>{error}</p><button className="secondary-action" type="button" onClick={() => void refresh()}>Try again</button></section> : summary ? <><section className="health-total-strip" aria-label={`${summary.range.label} Business Health figures`}>{cards.map(({ label, value, note, icon: Icon, href }) => <Link key={label} href={href}><Icon className="h-4 w-4" aria-hidden="true" /><span>{label}</span><strong>{value}</strong><small>{note}</small><ArrowRight className="health-card-arrow h-4 w-4" aria-hidden="true" /></Link>)}</section><p className="health-boundary"><ClipboardList className="h-4 w-4" aria-hidden="true" /><span><strong>{summary.range.label} uses your device’s local day boundary.</strong> This view is not profit, a cash balance, a tax record, or an accounting statement. Supplier stock purchases are not added as expenses automatically.</span></p><div className="health-grid"><section className="health-sheet" aria-labelledby="spending-title"><div className="health-sheet-head"><div><p className="ledger-kicker">Where money went</p><h2 id="spending-title">Expenses by category</h2></div><CircleDollarSign className="h-5 w-5 text-baobab" aria-hidden="true" /></div><div className="expense-category-list">{summary.expensesByCategory.map((category) => <div key={category.category}><div><strong>{category.label}</strong><span>{category.count ? `${category.count} saved expense${category.count === 1 ? "" : "s"}` : "No saved expense"}</span></div><b>{formatMinorAmount(category.amountMinor, profile.currency)}</b></div>)}</div><Link href="/expenses" className="quiet-action">Record an expense <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link></section><section className="health-sheet" aria-labelledby="low-stock-title"><div className="health-sheet-head"><div><p className="ledger-kicker">Stock to check</p><h2 id="low-stock-title">Low stock now</h2></div><PackageSearch className="h-5 w-5 text-baobab" aria-hidden="true" /></div>{summary.lowStockProducts.length ? <div className="health-stock-list">{summary.lowStockProducts.map((product) => <div key={product.productId}><div><strong>{product.productName}</strong><span>Threshold {product.lowStockThreshold}</span></div><b>{product.stockQuantity}</b></div>)}</div> : <div className="health-empty"><PackageSearch className="h-7 w-7 text-baobab" aria-hidden="true" /><h3>No low stock to check.</h3><p>Active products at or below their saved threshold appear here.</p></div>}<Link href="/inventory" className="quiet-action">Open stock <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link></section></div></> : null}
    <Link href="/reports" className="secondary-action health-back"><ArrowLeft className="h-4 w-4" aria-hidden="true" />Back to reports</Link>
  </div>;
}
