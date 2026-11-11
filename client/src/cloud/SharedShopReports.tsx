import { useEffect, useRef, useState } from "react";
import { formatMinorAmount } from "@/features/inventory/inventory";
import { openWhatsAppShare, shareBusinessText } from "@/features/sharing/businessSharing";
import { formatReportText, type DailyReport } from "./dailyReport";
import { getDailyReport, ShopRejectedError, type ShopOverview } from "./shopClient";
import { dayRange, type DatePreset } from "./salesFilters";

const PERIODS: ReadonlyArray<{ id: Exclude<DatePreset, "all">; label: string }> = [
  { id: "today", label: "Today" }, { id: "yesterday", label: "Yesterday" }, { id: "week", label: "Last 7 days" }, { id: "month", label: "This month" },
];

interface Props { companyId: string; overview: ShopOverview; online: boolean; userId: string; shopName: string }

export function SharedShopReports({ companyId, overview, online, userId, shopName }: Props) {
  const currency = overview.currency!;
  const isOwner = overview.role === "owner";
  const stores = overview.stores.filter(s => s.status === "active");
  const [period, setPeriod] = useState<Exclude<DatePreset, "all">>("today");
  const [storeId, setStoreId] = useState("");
  const [report, setReport] = useState<DailyReport | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState("");
  const request = useRef(0);

  useEffect(() => {
    if (!online) return;
    const mine = ++request.current;
    setError(""); setLoading(true); setNote("");
    getDailyReport(companyId, { ...(dayRange(period) as { from: string; to: string }), ...(storeId ? { storeId } : {}) })
      .then(result => { if (mine === request.current) setReport(result); })
      .catch(cause => {
        if (mine !== request.current) return;
        setReport(null);
        setError(cause instanceof ShopRejectedError && /Unknown shop operations action/.test(cause.message)
          ? "Reports need the shop to be updated first. Ask whoever looks after Tallybook to apply the latest update."
          : cause instanceof Error ? cause.message : "The report could not be loaded.");
      })
      .finally(() => { if (mine === request.current) setLoading(false); });
  }, [companyId, period, storeId, online]);

  const m = (value: number) => formatMinorAmount(value, currency);
  const periodLabel = PERIODS.find(p => p.id === period)!.label;
  const cashierName = (id: string) => overview.members.find(x => x.userId === id)?.email ?? (id === userId ? "You" : "Staff member");
  const text = () => report ? formatReportText(report, {
    shopName, storeName: stores.find(s => s.id === storeId)?.name ?? null, periodLabel, currency, cashierName }) : "";
  const share = async () => {
    const result = await shareBusinessText({ title: "Sales report", text: text() });
    setNote(result === "shared" ? "Opened in your share options." : result === "copied" ? "Report copied. Paste it into a message." : result === "manual" ? "Select the report below and copy it." : "");
  };
  const whatsApp = () => setNote(openWhatsAppShare(text()) ? "Opened in WhatsApp. Choose who to send it to." : "WhatsApp could not open. Use Share instead.");

  const Row = ({ label, value, strong }: { label: string; value: number; strong?: boolean }) =>
    <li><span>{label}</span>{strong ? <strong>{m(value)}</strong> : <span>{m(value)}</span>}</li>;

  return <section className="shop-card shop-report">
    <div className="shop-card-head"><h2>{isOwner ? "Reports" : "My day"}</h2>
      {stores.length > 1 && <label className="shop-field shop-store-select">Store
        <select value={storeId} onChange={e => setStoreId(e.target.value)}><option value="">{isOwner ? "All stores" : "All my stores"}</option>
          {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>}</div>
    <div className="shop-chips" role="group" aria-label="Period">
      {PERIODS.map(p => <button key={p.id} type="button" className="shop-chip" aria-pressed={period === p.id} onClick={() => setPeriod(p.id)}>{p.label}</button>)}</div>
    {!online && <p className="shop-muted" role="status">Connect to the internet to see reports.</p>}
    {loading && <p className="shop-muted" role="status">Loading…</p>}
    {error && <p role="alert" className="shop-alert">{error}</p>}

    {report && !error && <>
      <div className="shop-stats" aria-label="Summary">
        <div><span>Sales</span><strong>{m(report.sales.grossMinor)}</strong><small>{report.sales.count} sale{report.sales.count === 1 ? "" : "s"}</small></div>
        <div><span>Refunds</span><strong>{report.refunds.count ? `−${m(report.refunds.totalMinor)}` : m(0)}</strong><small>{report.refunds.count} refund{report.refunds.count === 1 ? "" : "s"}</small></div>
        <div><span>Net sales</span><strong>{m(report.netSalesMinor)}</strong>{report.sales.discountMinor > 0 && <small>{m(report.sales.discountMinor)} in discounts</small>}</div>
        <div className="shop-stat-key"><span>Cash expected in the till</span><strong>{m(report.cashExpectedMinor)}</strong><small>taken {m(report.cashTakenMinor)} · paid out {m(report.cashPaidOutMinor)}</small></div>
      </div>
      {report.sales.count === 0 && report.refunds.count === 0 && report.repayments.count === 0 && <p className="shop-muted">Nothing was sold in this period.</p>}

      <h3>Taken at the till</h3>
      <ul className="shop-report-list" aria-label="Taken at the till">
        <Row label="Cash" value={report.byMethod.cash} /><Row label="Mobile money" value={report.byMethod.mobile} />
        <Row label="Card" value={report.byMethod.card} /><Row label="On credit (not paid yet)" value={report.byMethod.credit} />
      </ul>
      {report.repayments.count > 0 && <>
        <h3>Customer repayments</h3>
        <ul className="shop-report-list" aria-label="Customer repayments">
          <Row label={`${report.repayments.count} repayment${report.repayments.count === 1 ? "" : "s"}`} value={report.repayments.totalMinor} strong />
          {report.repayments.cash > 0 && <Row label="Cash" value={report.repayments.cash} />}
          {report.repayments.mobile > 0 && <Row label="Mobile money" value={report.repayments.mobile} />}
          {report.repayments.card > 0 && <Row label="Card" value={report.repayments.card} />}
        </ul></>}
      {report.refunds.count > 0 && <>
        <h3>Refunds paid back</h3>
        <ul className="shop-report-list" aria-label="Refunds paid back">
          <Row label="Cash" value={report.refunds.cash} /><Row label="Mobile money" value={report.refunds.mobile} /><Row label="Card" value={report.refunds.card} />
          {report.refunds.creditReducedMinor > 0 && <Row label="Taken off what customers owed" value={report.refunds.creditReducedMinor} />}
        </ul></>}
      {isOwner && Object.values(report.supplierPayments).some(v => v > 0) && <>
        <h3>Paid to suppliers</h3>
        <ul className="shop-report-list" aria-label="Paid to suppliers">
          <Row label="Cash" value={report.supplierPayments.cash} /><Row label="Mobile money" value={report.supplierPayments.mobile} />
          <Row label="Card" value={report.supplierPayments.card} /><Row label="Bank" value={report.supplierPayments.bank} />
        </ul></>}
      {report.topProducts.length > 0 && <>
        <h3>Best sellers</h3>
        <ol className="shop-report-list" aria-label="Best sellers">{report.topProducts.map(p => <li key={p.name}><span>{p.name} × {p.quantity}</span><span>{m(p.revenueMinor)}</span></li>)}</ol></>}
      {isOwner && report.byCashier.length > 0 && <>
        <h3>By cashier</h3>
        <ul className="shop-report-list" aria-label="By cashier">{report.byCashier.map(c => <li key={c.cashierId}><span>{cashierName(c.cashierId)} · {c.count} sale{c.count === 1 ? "" : "s"}</span><span>{m(c.grossMinor)}</span></li>)}</ul></>}
      {isOwner && report.customerCreditOutstandingMinor != null && report.customerCreditOutstandingMinor > 0 &&
        <p className="shop-total"><span>Customers still owe</span><strong>{m(report.customerCreditOutstandingMinor)}</strong></p>}

      <div className="shop-actions">
        <button type="button" className="secondary-action" onClick={() => void share()}>Share</button>
        <button type="button" className="secondary-action" onClick={whatsApp}>Send on WhatsApp</button>
      </div>
      {note && <p role="status" className="shop-muted">{note}</p>}
    </>}
  </section>;
}
