/** Tactile Ledger Stage 7: reports are local, filterable record summaries—not profit, tax, or accounting statements. */
import { ArrowLeft, BarChart3, CircleDollarSign, ClipboardList, PackageSearch, ReceiptText, Sunset, UsersRound, WalletCards } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "wouter";
import { formatMinorAmount } from "@/features/inventory/inventory";
import { getReportsSnapshot, reportPeriods, type ReportPeriod, type ReportsSnapshot } from "@/features/reports/reports";
import { useBusinessProfile } from "@/contexts/BusinessProfileContext";
import { createWatchdogCsv, createWatchdogDayJson, createWatchdogCanonicalDayCsv } from "@/features/integrations/watchdogBridge";
import { getLocalIntegrityOverview, type IntegritySnapshot } from "@/features/reports/localIntegrityOverview";
import { getActiveBusinessProfileId } from "@/features/business/activeCompany";

export default function ReportsPage() {
  const { profile, activeCompanyId } = useBusinessProfile();
  const [period, setPeriod] = useState<ReportPeriod>("today");
  const [snapshot, setSnapshot] = useState<ReportsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [watchdogUtcDay,setWatchdogUtcDay]=useState(() => new Date().toISOString().slice(0,10));
  const [integrityBusy,setIntegrityBusy]=useState(false);
  const [integrity,setIntegrity]=useState<IntegritySnapshot|null>(null);
  const [exportBusy,setExportBusy]=useState(false);
  const [exportError,setExportError]=useState<string|null>(null);
  const [watchdogImportNotice,setWatchdogImportNotice]=useState<string|null>(null);
  const runLocalIntegrityCheck=async()=>{
    const company=activeCompanyId;
    setIntegrityBusy(true);setExportError(null);setIntegrity(null);
    try {
      const review=await getLocalIntegrityOverview();
      if(company!==getActiveBusinessProfileId()) throw new Error('Company switched during review.');
      setIntegrity(review);
    } catch(error){setExportError(error instanceof Error?error.message:'Local integrity review failed.');}
    finally {setIntegrityBusy(false);}
  };
  const downloadWatchdogDayJson=async()=>{
    const company=activeCompanyId;
    setExportError(null);setExportBusy(true);
    try {
      // UTC day is explicit. Do not silently describe local shop hours as UTC.
      const dayUtc=watchdogUtcDay;
      const json=await createWatchdogDayJson(dayUtc);
      if(company!==getActiveBusinessProfileId()) throw new Error('Company switched during export.');
      const url=URL.createObjectURL(new Blob([json],{type:'application/json;charset=utf-8'}));
      try {
        const a=document.createElement('a');a.href=url;
        a.download=`tallybook-watchdog-preview-${company.replace(/[^a-zA-Z0-9_-]/g,'_')}-${dayUtc}.json`;
        document.body.appendChild(a);a.click();a.remove();
      } finally { URL.revokeObjectURL(url); }
    } catch(error){setExportError(error instanceof Error?error.message:'Watchdog daily preview failed.');}
    finally {setExportBusy(false);}
  };
  const downloadWatchdogCsv=async()=>{
    const expectedCompany=activeCompanyId;
    setExportError(null);setExportBusy(true);
    try {
      const csv=await createWatchdogCsv();
      if(expectedCompany!==getActiveBusinessProfileId()) throw new Error('Company switched during export.');
      const url=URL.createObjectURL(new Blob(["\uFEFF",csv],{type:'text/csv;charset=utf-8'}));
      try {
        const a=document.createElement('a');a.href=url;
        a.download=`tallybook-watchdog-${expectedCompany.replace(/[^a-zA-Z0-9_-]/g,'_')}-${new Date().toISOString().slice(0,10)}.csv`;
        document.body.appendChild(a);a.click();a.remove();
      } finally {URL.revokeObjectURL(url);}
    } catch(error){setExportError(error instanceof Error?error.message:'Watchdog export failed.');}
    finally {setExportBusy(false);}
  };
  const downloadWatchdogImportCsv=async()=>{
    const company=activeCompanyId;
    setExportError(null);setWatchdogImportNotice(null);setExportBusy(true);
    try {
      const dayUtc=watchdogUtcDay;
      const result=await createWatchdogCanonicalDayCsv(dayUtc);
      if(company!==getActiveBusinessProfileId()) throw new Error('Company switched during export.');
      const url=URL.createObjectURL(new Blob(["\uFEFF",result.csv],{type:'text/csv;charset=utf-8'}));
      try {
        const a=document.createElement('a');a.href=url;
        a.download=`tallybook-watchdog-pos-import-${company.replace(/[^a-zA-Z0-9_-]/g,'_')}-${dayUtc}.csv`;
        document.body.appendChild(a);a.click();a.remove();
      } finally {URL.revokeObjectURL(url);}
      const excluded=result.omitted.length;
      setWatchdogImportNotice(`${result.included} POS records exported for Watchdog import. ${excluded} other events (${[...new Set(result.omitted.map(e=>e.event_type))].join(', ')||'none'}) are not in this CSV; use the daily JSON preview to review them. Historical register IDs remain unknown, so register-level camera matching is unavailable.`);
    } catch(error){setExportError(error instanceof Error?error.message:'Watchdog POS import export failed.');}
    finally {setExportBusy(false);}
  };
  const refresh = useCallback(async () => { if (!profile) return; setLoading(true); try { setSnapshot(await getReportsSnapshot(period)); } finally { setLoading(false); } }, [activeCompanyId, period, profile]);
  useEffect(() => { void refresh(); const update = () => { void refresh(); }; window.addEventListener("focus", update); window.addEventListener("pageshow", update); return () => { window.removeEventListener("focus", update); window.removeEventListener("pageshow", update); }; }, [refresh]);
  useEffect(() => { setSnapshot(null);setIntegrity(null);setWatchdogImportNotice(null); }, [activeCompanyId]);

  if (!profile) return <section className="reports-gate"><div className="reports-gate-sheet"><div className="reports-gate-brand"><strong>Tallybook</strong><span>Business ledger</span></div><span className="workspace-marker">RPT</span><p className="eyebrow"><span className="eyebrow-dot" />Report preparation</p><h1>Set the record before you read the reports.</h1><p>Reports need a business identity and receipt currency so every saved figure has a clear local context.</p><div className="reports-prerequisite-list"><div><span>01</span><strong>Business name</strong><small>Names the ledger these reports belong to.</small></div><div><span>02</span><strong>Receipt currency</strong><small>Keeps values clear and comparable.</small></div><div><span>03</span><strong>Saved records</strong><small>Sales and stock will appear after setup.</small></div></div><p className="reports-gate-tally"><b>Two details to begin</b><span>Business name · Currency</span></p><Link href="/business" className="primary-action">Set up your business</Link></div></section>;
  const currency = profile.currency;
  const periodLabel: Record<ReportPeriod, string> = { today: "Today", last7: "Last 7 days", all: "All time" };
  return <div className="reports-page"><section className="reports-hero"><p className="eyebrow"><span className="eyebrow-dot" />Reports from saved records</p><span className="workspace-marker">RPT</span><h1>See the numbers. <em>Keep them clear.</em></h1><p>Every figure comes from records saved on this device. Reports do not estimate profit, tax, or cash on hand.</p><div className="reports-periods" aria-label="Report date range">{reportPeriods.map((value) => <button key={value} type="button" className={period === value ? "is-selected" : ""} onClick={() => setPeriod(value)}>{periodLabel[value]}</button>)}</div><div className="report-contextual-links"><button type="button" className="quiet-action" disabled={integrityBusy} onClick={() => void runLocalIntegrityCheck()}>{integrityBusy?"Checking records…":"Review local sale integrity"}</button><button type="button" className="quiet-action" disabled={exportBusy} onClick={() => void downloadWatchdogCsv()}>{exportBusy?"Checking export…":"Download Watchdog CSV (single store)"}</button><label className="quiet-action">Watchdog UTC day <input type="date" aria-label="Watchdog export UTC date" value={watchdogUtcDay} onChange={e=>setWatchdogUtcDay(e.target.value)} disabled={exportBusy} /></label><button type="button" className="quiet-action" disabled={exportBusy} onClick={() => void downloadWatchdogDayJson()}>{exportBusy?"Preparing preview…":"Watchdog daily JSON (UTC, preview)"}</button><button type="button" className="quiet-action" disabled={exportBusy} onClick={() => void downloadWatchdogImportCsv()}>{exportBusy?"Preparing import…":"Download Watchdog POS import CSV (UTC day)"}</button><Link href="/insights" className="quiet-action">Evidence-backed insights</Link><Link href="/financial-intelligence" className="quiet-action">Financial intelligence (V10)</Link><Link href="/business-health" className="quiet-action"><BarChart3 className="h-4 w-4" aria-hidden="true" />Business Health</Link><Link href="/expenses" className="quiet-action"><CircleDollarSign className="h-4 w-4" aria-hidden="true" />Expenses</Link><Link href="/end-of-day" className="quiet-action report-end-of-day"><Sunset className="h-4 w-4" aria-hidden="true" />Review end of day</Link></div>{watchdogImportNotice&&<p role="status" className="report-boundary">{watchdogImportNotice}</p>}{exportError&&<p role="alert" className="report-boundary">{exportError}</p>}{integrity&&<div className="report-boundary" role="status"><strong>Read-only local sale audit:</strong> {integrity.saleCount} sales / {integrity.paymentCount} payments; {integrity.errors.length} integrity errors and {integrity.warnings.length} legacy/evidence warnings. This does not verify external settlement or guarantee a complete financial audit. {integrity.errors.slice(0,4).map(f=><span key={`${f.code}:${f.entityId}`}>{f.code} ({f.entityId}); </span>)}{integrity.warnings.slice(0,3).map(f=><span key={`${f.code}:${f.entityId}`}>{f.code} ({f.entityId}); </span>)}</div>}</section>{loading || !snapshot ? <p className="inventory-loading">Reading saved report records…</p> : <><section className="reports-total-strip" aria-label={`${snapshot.range.label} report totals`}><div><span>Completed sales</span><strong>{formatMinorAmount(snapshot.totals.salesMinor, currency)}</strong></div><div><span>Money received</span><strong>{formatMinorAmount(snapshot.totals.receivedMinor, currency)}</strong></div><div><span>Customer debt now</span><strong>{formatMinorAmount(snapshot.totals.outstandingDebtMinor, currency)}</strong></div><div><span>Sales count</span><strong>{snapshot.totals.transactionCount}</strong></div></section><p className="report-boundary"><ClipboardList className="h-4 w-4" aria-hidden="true" />{snapshot.range.label} uses your device’s local day boundary. Customer debt is current across all saved customer sales and repayments.</p><div className="reports-grid"><section className="report-sheet"><div className="report-sheet-head"><div><p className="ledger-kicker">Sales report</p><h2>Completed receipts</h2></div><ReceiptText className="h-5 w-5 text-baobab" aria-hidden="true" /></div>{snapshot.sales.length ? <div className="report-row-list">{snapshot.sales.map((sale) => <div key={sale.id}><strong>{sale.receiptNumber}</strong><span>{sale.customerName ?? "Walk-in"} · {sale.paymentMethod}</span><b>{formatMinorAmount(sale.totalMinor, currency)}</b></div>)}</div> : <p className="dashboard-empty">No completed sale falls within this report period.</p>}</section><section className="report-sheet"><div className="report-sheet-head"><div><p className="ledger-kicker">Payment report</p><h2>Money received</h2></div><WalletCards className="h-5 w-5 text-baobab" aria-hidden="true" /></div>{snapshot.payments.length ? <div className="report-row-list">{snapshot.payments.map((payment) => <div key={payment.id}><strong>{payment.source === "sale" ? "Sale payment" : "Debt repayment"}</strong><span>{payment.customerName ?? "Walk-in"} · {payment.method}</span><b>{formatMinorAmount(payment.amountMinor, currency)}</b></div>)}</div> : <p className="dashboard-empty">No payment or repayment was saved in this period.</p>}</section><section className="report-sheet"><div className="report-sheet-head"><div><p className="ledger-kicker">Customer debt report</p><h2>Amounts outstanding</h2></div><UsersRound className="h-5 w-5 text-baobab" aria-hidden="true" /></div>{snapshot.debts.length ? <div className="report-row-list">{snapshot.debts.map((debt) => <div key={debt.customerId}><strong>{debt.customerName}</strong><span>{debt.phone} · repaid {formatMinorAmount(debt.repaidMinor, currency)}</span><b>{formatMinorAmount(debt.outstandingMinor, currency)}</b></div>)}</div> : <p className="dashboard-empty">No saved customer debt is currently recorded.</p>}</section><section className="report-sheet"><div className="report-sheet-head"><div><p className="ledger-kicker">Inventory report</p><h2>Stock on hand</h2></div><PackageSearch className="h-5 w-5 text-baobab" aria-hidden="true" /></div>{snapshot.inventory.length ? <div className="report-row-list">{snapshot.inventory.map((product) => <div key={product.productId}><strong>{product.productName}</strong><span>{product.isLowStock ? `Low stock · threshold ${product.lowStockThreshold}` : `Threshold ${product.lowStockThreshold}`}</span><b>{product.stockQuantity}</b></div>)}</div> : <p className="dashboard-empty">No active product has been saved.</p>}</section></div></>}<Link href="/" className="secondary-action reports-back"><ArrowLeft className="h-4 w-4" aria-hidden="true" />Back to Home</Link></div>;
}
