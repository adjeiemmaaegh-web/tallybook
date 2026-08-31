/** Tallybook Africa design reminder: the Home dashboard remains a compact cobalt daily operating view; surface only plain local facts and clear next actions. */
import { ArrowRight, Award, BarChart3, CircleDollarSign, PackageSearch, ReceiptText, UsersRound, WalletCards } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "wouter";
import { formatMinorAmount } from "@/features/inventory/inventory";
import { getDashboardSummary, type DashboardSummary } from "@/features/reports/reports";
interface TodayDashboardProps { currency: string; activeCompanyId?: string; }

export function TodayDashboard({ currency, activeCompanyId }: TodayDashboardProps) {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const refresh = useCallback(async () => {
    setLoading(true);
    setError(false);
    try { setSummary(await getDashboardSummary()); }
    catch { setError(true); }
    finally { setLoading(false); }
  }, [activeCompanyId]);
  useEffect(() => { void refresh(); const update = () => { void refresh(); }; window.addEventListener("focus", update); window.addEventListener("pageshow", update); return () => { window.removeEventListener("focus", update); window.removeEventListener("pageshow", update); }; }, [refresh]);

  if (loading) return <section className="today-dashboard today-dashboard-loading" role="status" aria-live="polite"><p className="ledger-kicker">Today’s summary</p><strong>Getting today’s saved records ready…</strong></section>;
  if (error || !summary) return <section className="today-dashboard today-dashboard-loading today-dashboard-error" role="alert"><p className="ledger-kicker">Today’s summary</p><strong>Your saved records need attention.</strong><p>Try again to read today’s saved activity. Nothing was changed.</p><button className="secondary-action" type="button" onClick={() => void refresh()}>Try again</button></section>;

  const peakTrend = Math.max(...summary.trend.map((point) => point.salesMinor), 1);
  const metrics = [
    { label: "Sales today", value: formatMinorAmount(summary.todaySalesMinor, currency), icon: CircleDollarSign, note: "Completed sales" },
    { label: "Collected today", value: formatMinorAmount(summary.todayMoneyReceivedMinor, currency), icon: WalletCards, note: "Payments received today" },
    { label: "Customers owe", value: formatMinorAmount(summary.outstandingDebtMinor, currency), icon: UsersRound, note: "Open customer balances", href: "/customers?view=owing" },
    { label: "Sales made", value: String(summary.todayTransactions), icon: ReceiptText, note: "Completed sales today" },
  ];

  return <section className="today-dashboard" aria-labelledby="today-dashboard-title">
    <div className="today-dashboard-head"><div><p className="ledger-kicker">Daily business summary</p><h2 id="today-dashboard-title">How is your business <em>doing today?</em></h2><p>These figures come from sales, payments, customer, and stock records saved on this device.</p></div><Link href="/reports" className="secondary-action">Reports <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link></div>
    <div className="today-metric-grid">{metrics.map(({ label, value, icon: Icon, note, href }) => href ? <Link key={label} href={href} className="today-metric-link"><article><Icon className="h-5 w-5 text-baobab" aria-hidden="true" /><span>{label}</span><strong>{value}</strong><small>{note}</small></article></Link> : <article key={label}><Icon className="h-5 w-5 text-baobab" aria-hidden="true" /><span>{label}</span><strong>{value}</strong><small>{note}</small></article>)}</div>
    <div className="today-ledger-grid">
      <section className="today-best-seller"><div className="today-subhead"><div><p className="ledger-kicker">Best seller</p><h3>{summary.bestSeller ? summary.bestSeller.productName : "No sales yet today"}</h3></div><Award className="h-5 w-5 text-baobab" aria-hidden="true" /></div>{summary.bestSeller ? <p className="dashboard-empty"><strong>{summary.bestSeller.quantity} {summary.bestSeller.quantity === 1 ? "item" : "items"} sold</strong> · {formatMinorAmount(summary.bestSeller.salesMinor, currency)} in today’s completed sales.</p> : <p className="dashboard-empty">Your most-sold item will appear here after you complete a sale today.</p>}<Link href="/sales" className="quiet-action">Make a sale <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link></section>
      <section className="today-low-stock"><div className="today-subhead"><div><p className="ledger-kicker">Stock attention</p><h3>{summary.lowStockProducts.length ? `${summary.lowStockProducts.length} low-stock ${summary.lowStockProducts.length === 1 ? "item" : "items"}` : "Stock levels look clear"}</h3></div><PackageSearch className="h-5 w-5 text-baobab" aria-hidden="true" /></div>{summary.lowStockProducts.length ? <div className="dashboard-row-list">{summary.lowStockProducts.slice(0, 3).map((product) => <div key={product.productId}><strong>{product.productName}</strong><span>{product.stockQuantity} on shelf · low at {product.lowStockThreshold}</span></div>)}</div> : <p className="dashboard-empty">No active product is at or below its saved low-stock threshold.</p>}<Link href="/inventory" className="quiet-action">Open stock record <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link></section>
      <section className="today-trend"><div className="today-subhead"><div><p className="ledger-kicker">Seven-day sales</p><h3>Recent trading rhythm</h3></div><BarChart3 className="h-5 w-5 text-baobab" aria-hidden="true" /></div><div className="trend-bars" aria-label="Seven-day completed sales trend">{summary.trend.map((point) => <div key={point.dateKey}><span className="trend-bar" style={{ height: `${Math.max(5, (point.salesMinor / peakTrend) * 100)}%` }} title={`${point.label}: ${formatMinorAmount(point.salesMinor, currency)}`} /><strong>{point.label}</strong><small>{point.transactions}</small></div>)}</div><p className="trend-note">Bar height shows completed-sale value; the small figure is completed sales.</p></section>
    </div>
    <section className="today-recent-sales"><div className="today-subhead"><div><p className="ledger-kicker">Recent activity</p><h3>Today’s saved activity</h3></div><Link href="/sales" className="quiet-action">Open sales <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link></div>{summary.recentActivity.length ? <div className="dashboard-row-list">{summary.recentActivity.map((activity) => <div key={activity.id}><strong>{activity.label}</strong><span>{activity.type === "repayment" ? "Customer payment" : "Completed sale"} · {new Date(activity.createdAt).toLocaleString()}</span><b>{formatMinorAmount(activity.amountMinor, currency)}</b></div>)}</div> : <p className="dashboard-empty">No sales or customer payments have been saved today.</p>}</section>
  </section>;
}
