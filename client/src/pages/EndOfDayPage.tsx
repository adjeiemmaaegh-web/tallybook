/** Tallybook Africa design reminder: End of day is a compact, read-only cobalt-ledger review that explains saved local facts without implying a close, lock, upload, or accounting settlement. */
import { ArrowLeft, CircleDollarSign, ClipboardList, PackageSearch, Printer, Sunset, UsersRound, WalletCards } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "wouter";
import { toast } from "sonner";
import { useBusinessProfile } from "@/contexts/BusinessProfileContext";
import { formatMinorAmount } from "@/features/inventory/inventory";
import { getEndOfDaySummary, type EndOfDaySummary } from "@/features/reports/reports";

export default function EndOfDayPage() {
  const { profile, activeCompanyId } = useBusinessProfile();
  const [summary, setSummary] = useState<EndOfDaySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const refresh = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    setError(false);
    try { setSummary(await getEndOfDaySummary()); }
    catch { setError(true); }
    finally { setLoading(false); }
  }, [activeCompanyId, profile]);
  useEffect(() => { void refresh(); const update = () => { void refresh(); }; window.addEventListener("focus", update); window.addEventListener("pageshow", update); return () => { window.removeEventListener("focus", update); window.removeEventListener("pageshow", update); }; }, [refresh]);
  useEffect(() => { setSummary(null); }, [activeCompanyId]);
  const print = () => {
    if (typeof window.print !== "function") return toast.info("Printing is not available in this browser.");
    window.print();
  };

  if (!profile) return <section className="reports-gate"><div className="reports-gate-sheet"><div className="reports-gate-brand"><strong>Tallybook</strong><span>Business ledger</span></div><span className="workspace-marker">EOD</span><p className="eyebrow"><span className="eyebrow-dot" />End-of-day preparation</p><h1>Set the record before you review the day.</h1><p>End-of-day figures need a business identity and receipt currency so every saved local amount is clear.</p><Link href="/business" className="primary-action">Set up business</Link></div></section>;
  const currency = profile.currency;
  return <div className="end-day-page">
    <section className="reports-hero end-day-hero"><p className="eyebrow"><span className="eyebrow-dot" />Optional daily review</p><span className="workspace-marker">EOD</span><h1>What happened in your <em>business today?</em></h1><p>{summary?.dateLabel ?? "Today"}. This is a read-only view of records saved on this device. It does not close, reset, or lock your day.</p><button className="secondary-action end-day-print-action" type="button" onClick={print}><Printer className="h-4 w-4" aria-hidden="true" />Print / Save as PDF</button></section>
    {loading ? <p className="inventory-loading" role="status">Getting today’s saved records ready…</p> : error || !summary ? <section className="end-day-attention" role="alert"><strong>Your saved records need attention.</strong><p>Try again to read today’s summary. Nothing was changed.</p><button className="secondary-action" type="button" onClick={() => void refresh()}>Try again</button></section> : <>
      <section className="end-day-total-strip" aria-label="Today’s end-of-day totals"><div className="end-day-sales-total"><CircleDollarSign className="h-5 w-5" aria-hidden="true" /><span>Sales recorded today</span><strong>{formatMinorAmount(summary.salesMinor, currency)}</strong><small>{summary.salesCount} {summary.salesCount === 1 ? "sale" : "sales"} completed</small></div><div className="end-day-received-total"><WalletCards className="h-5 w-5" aria-hidden="true" /><span>Money actually received today</span><strong>{formatMinorAmount(summary.receivedMinor, currency)}</strong><small>Sale payments and customer repayments</small></div><Link href="/customers?view=owing" className="end-day-unpaid-total"><UsersRound className="h-5 w-5" aria-hidden="true" /><span>Still unpaid from today’s sales</span><strong>{formatMinorAmount(summary.unpaidFromTodaySalesMinor, currency)}</strong><small>At the time today’s sales were saved</small></Link><div className="end-day-customers-total"><UsersRound className="h-5 w-5" aria-hidden="true" /><span>Named customers served</span><strong>{summary.namedCustomersServed}</strong><small>Walk-in sales are not counted here</small></div></section>
      <div className="end-day-grid"><section className="end-day-sheet"><div className="end-day-sheet-head"><div><p className="ledger-kicker">Sales recorded today</p><h2>How sales were recorded</h2></div><ClipboardList className="h-5 w-5 text-baobab" aria-hidden="true" /></div><div className="end-day-method-list">{summary.methods.map((method) => <div key={method.method}><strong>{method.label} sales</strong><b>{formatMinorAmount(method.salesMinor, currency)}</b></div>)}</div><p className="end-day-note">A part-paid sale stays under the payment plan selected when it was recorded.</p><Link href="/sales" className="quiet-action">Open sales <ArrowLeft className="h-4 w-4 rotate-180" aria-hidden="true" /></Link></section><section className="end-day-sheet"><div className="end-day-sheet-head"><div><p className="ledger-kicker">Money received today</p><h2>Payments actually recorded</h2></div><WalletCards className="h-5 w-5 text-baobab" aria-hidden="true" /></div><div className="end-day-method-list">{summary.methods.filter((method) => method.method !== "credit").map((method) => <div key={method.method}><strong>{method.label}</strong><b>{formatMinorAmount(method.receivedMinor, currency)}</b></div>)}</div><p className="end-day-note">This includes sale payments and customer repayments, not unpaid sale amounts.</p><Link href="/reports" className="quiet-action">Open reports <ArrowLeft className="h-4 w-4 rotate-180" aria-hidden="true" /></Link></section><section className="end-day-sheet"><div className="end-day-sheet-head"><div><p className="ledger-kicker">Stock attention</p><h2>{summary.lowStockProducts.length ? `${summary.lowStockProducts.length} low-stock ${summary.lowStockProducts.length === 1 ? "product" : "products"}` : "Stock levels look clear"}</h2></div><PackageSearch className="h-5 w-5 text-baobab" aria-hidden="true" /></div>{summary.lowStockProducts.length ? <div className="dashboard-row-list">{summary.lowStockProducts.slice(0, 4).map((product) => <div key={product.productId}><strong>{product.productName}</strong><span>{product.stockQuantity} on shelf · low at {product.lowStockThreshold}</span></div>)}</div> : <p className="dashboard-empty">No active product is at or below its saved low-stock threshold.</p>}<Link href="/inventory" className="quiet-action">Open stock record <ArrowLeft className="h-4 w-4 rotate-180" aria-hidden="true" /></Link></section></div>
      <p className="end-day-boundary"><Sunset className="h-4 w-4" aria-hidden="true" /><span>You can add late entries or payments whenever needed. This view never closes or locks your day.</span></p>
      <p className="end-day-print-disclaimer">End of day summary — not a receipt, invoice, tax document, or accounting statement.</p>
    </>}
    <Link href="/" className="secondary-action reports-back"><ArrowLeft className="h-4 w-4" aria-hidden="true" />Back to Home</Link>
  </div>;
}
