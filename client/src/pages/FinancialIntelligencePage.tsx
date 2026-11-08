import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useBusinessProfile } from "@/contexts/BusinessProfileContext";
import { formatMinorAmount } from "@/features/inventory/inventory";
import { financialCsv, getFinancialSummary, type FinancialPeriod, type FinancialSummary } from "@/features/reports/financialIntelligence";

const periods: {value:FinancialPeriod;label:string}[]=[{value:"today",label:"Today"},{value:"week",label:"This week"},{value:"month",label:"This month"},{value:"quarter",label:"This quarter"},{value:"year",label:"This year"},{value:"custom",label:"Custom"}];
export default function FinancialIntelligencePage(){
  const {profile,activeCompanyId}=useBusinessProfile();
  const [period,setPeriod]=useState<FinancialPeriod>("month");
  const [start,setStart]=useState("");const [end,setEnd]=useState("");
  const [summary,setSummary]=useState<FinancialSummary|null>(null);
  const [error,setError]=useState("");const [loading,setLoading]=useState(false);
  useEffect(()=>{setSummary(null);setError("");},[activeCompanyId]);
  useEffect(()=>{if(!profile)return;let live=true;if(period==="custom"&&(!start||!end))return;
    setLoading(true);setError("");
    void getFinancialSummary(period,new Date(),start,end).then(result=>{if(live)setSummary(result);}).catch(e=>{if(live){setSummary(null);setError(e instanceof Error?e.message:"Unable to read report.");}}).finally(()=>{if(live)setLoading(false);});
    return()=>{live=false};
  },[profile,activeCompanyId,period,start,end]);
  const download=()=>{if(!summary)return;const file=new Blob(["\uFEFF"+financialCsv(summary)],{type:"text/csv;charset=utf-8"});const url=URL.createObjectURL(file);const a=document.createElement("a");a.href=url;a.download=`tallybook-management-report-${new Date().toISOString().slice(0,10)}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  if(!profile)return <main className="reports-page"><h1>Financial intelligence</h1><p>Set up a business to view local management reports.</p><Link href="/business">Business setup</Link></main>;
  const fmt=(value:number)=>formatMinorAmount(value,profile.currency);
  return <main className="reports-page"><section className="reports-hero"><p className="eyebrow">Management view</p><h1>Financial intelligence</h1><p>Read-only summaries of locally recorded business activity. They are not statutory accounts, profit statements, or bank-reconciled cash flow.</p>
    <div className="reports-periods">{periods.map(p=><button key={p.value} type="button" className={period===p.value?"is-selected":""} onClick={()=>setPeriod(p.value)}>{p.label}</button>)}</div>
    {period==="custom"&&<div style={{display:"flex",gap:12,flexWrap:"wrap",marginTop:12}}><label>Start <input aria-label="Start date" type="date" value={start} onChange={e=>setStart(e.target.value)}/></label><label>End <input aria-label="End date" type="date" value={end} onChange={e=>setEnd(e.target.value)}/></label></div>}
    <div className="report-contextual-links"><Link href="/reports" className="quiet-action">Original reports</Link><button type="button" className="quiet-action" disabled={!summary} onClick={download}>Export CSV</button><button type="button" className="quiet-action" disabled={!summary} onClick={()=>window.print()}>Print / Save PDF</button></div>
  </section>
  {loading&&<p role="status">Calculating from saved records…</p>}{error&&<p role="alert">{error}</p>}
  {summary && !loading && <section className="report-sheet" aria-label="Historical cost reconciliation"><h2>Recorded sales and their costs</h2><p>Recorded tax after reversals: <strong>{fmt(summary.recordedTaxMinor)}</strong></p><p>Sales excluding recorded tax: <strong>{fmt(summary.salesExcludingRecordedTaxMinor)}</strong></p>{summary.cogsMinor === undefined ? <p>{summary.unavailable.cogs} Cost totals remain unavailable until the missing evidence is reconciled.</p> : <><p>Cost of goods sold, after reversals: <strong>{fmt(summary.cogsMinor)}</strong></p><p>Sales excluding recorded tax less cost: <strong>{fmt(summary.salesLessCostMinor!)}</strong></p><p>Costs are reconstructed from saved receipts and FIFO allocations. This amount is before expenses and any unconfigured tax obligations.</p></>}</section>}
  {summary?.managementProfit&&!loading&&<section className="report-sheet" aria-label="Management profit and loss">
    <h2>Profit & loss — recorded management result</h2>
    <p>Sales after refunds, excluding only tax recorded on saved receipts: <strong>{fmt(summary.salesExcludingRecordedTaxMinor)}</strong></p>
    {summary.managementProfit.status==="available" ? <>
      <p>Verified cost of goods sold (FIFO, after saved returns): <strong>{fmt(summary.cogsMinor!)}</strong></p>
      <p>Gross profit from recorded transactions: <strong>{fmt(summary.managementProfit.grossProfitMinor!)}</strong></p>
      <p>Period operating expenses: <strong>{fmt(summary.expensesMinor)}</strong></p>
      <p><strong>Management operating result: {fmt(summary.managementProfit.operatingResultMinor!)}</strong></p>
    </> : <p role="status">Profit is unavailable — one or more sales/returns have unverified original stock costs. No estimate is silently substituted.</p>}
    <p>{summary.managementProfit.reason}</p>
    <p>Supplier payments are never expensed again here. This is not statutory profit, audited accounts, income tax due, depreciation, accrual accounting, or proof of actual bank settlement.</p>
  </section>}
  {summary?.taxEvidence&&!loading&&
    <section className="report-sheet" aria-label="Original tax policy evidence">
      <h2>Tax configured at each original sale</h2>
      <p>Receipts with verified registered single-rate policy: <strong>{summary.taxEvidence.configuredChargedSales}</strong>.</p>
      <p>Receipts recording tax OFF at checkout: <strong>{summary.taxEvidence.explicitNoTaxSales}</strong>.</p>
      <p>Historical receipts without a saved configuration: <strong>{summary.taxEvidence.legacyUnverifiedSales}</strong>.
       These are not assumed exempt, untaxed, or registered by inference.</p>
      <p>Today's tax settings do not rewrite old invoices. Tax filing, country-specific exemptions and statutory rates are not verified by this report.</p>
    </section>}
  {summary?.supplierFinanceAudit&&!loading&&
    <section className="report-sheet" aria-label="Supplier liability and manual settlement evidence">
      <h2>Supplier liability and recorded settlements</h2>
      <p>Recognized supplier invoices: <strong>{summary.supplierFinanceAudit.recognizedPurchases}</strong>;
       {' '}invoices with unknown unpaid status: <strong>{summary.supplierFinanceAudit.unknownPurchases}</strong>.</p>
      <p>Manually recorded supplier payment events: <strong>{summary.supplierFinanceAudit.manuallyAttestedPayments}</strong>.
       {' '}Missing supporting references: {summary.supplierFinanceAudit.paymentsWithoutReferences}.</p>
      <p>Supplier credit notes without supporting references: {summary.supplierFinanceAudit.supplierCreditsWithoutReferences}.
       Credit notes reduce debt without creating a cash payment.</p>
      {summary.supplierFinanceAudit.periodSupplierPaymentsByCurrency.map(row=>
       <p key={row.currency}>Manual supplier payments this period ({row.currency} minor units): <strong>{row.amountMinor.toLocaleString()}</strong></p>)}
      {(summary.supplierFinanceAudit.expensesWithUnknownCurrency>0||
        summary.supplierFinanceAudit.expensesInOtherCurrency>0)&&
       <p role="status">Unverified historical expense currencies: {summary.supplierFinanceAudit.expensesWithUnknownCurrency};
        {' '}expenses in another currency: {summary.supplierFinanceAudit.expensesInOtherCurrency}. No conversion is inferred.</p>}
      <p>Supplier payments are not added to the separate expense total: the same outside-world payout could have been entered in both places. These saved entries are not bank/provider settlement confirmations or complete cash flow.</p>
    </section>}
  {summary?.returnPolicyEvidence&&!loading&&
    <section className="report-sheet" aria-label="Return policy evidence">
      <h2>Company return policy and saved refund history</h2>
      <p>Verified policy-backed refunds: <strong>{summary.returnPolicyEvidence.verifiedRefunds}</strong>.</p>
      <p>Older refund records with unverified policy authority: <strong>{summary.returnPolicyEvidence.legacyRefunds}</strong>.
        These financial records remain visible, but Tallybook does not claim their original terms are known.</p>
      <p>Sales predating saved refund terms: <strong>{summary.returnPolicyEvidence.salesWithoutHistoricalTerms}</strong>.
        New refunds from those sales require a separately reviewed legacy reconciliation process.</p>
      <p>Active company policy revision: {summary.returnPolicyEvidence.activeRevision}.</p>
    </section>}
  {summary?.receivableAudit&&!loading&&
    <section className="report-sheet" aria-label="Customer credit integrity">
      <h2>Customer receivables (as-of now)</h2>
      <p>Outstanding customer credit: <strong>{fmt(summary.receivableAudit.outstandingMinor)}</strong>
       {' '}across {summary.receivableAudit.indebtedCustomers} owing customer(s).</p>
      <p>Repayments linked to specific saved credit sales: <strong>{fmt(summary.receivableAudit.allocatedRepaymentMinor)}</strong>.</p>
      <p>Historical payments recorded only against customers: <strong>{fmt(summary.receivableAudit.unallocatedRepaymentMinor)}</strong>.
       {' '}Their sale-level allocation remains unknown; Tallybook does not assign one automatically.</p>
      {summary.receivableAudit.historicalUnknownCurrencyCustomers>0&&
       <p role="status">{summary.receivableAudit.historicalUnknownCurrencyCustomers} customer(s) hold older money with unverified currency.
       A new cross-currency collection is not authorized by this report.</p>}
      <p>This is full saved-history customer debt, not period revenue or cash collected.</p>
    </section>}
  {summary?.receivableAgeing&&!loading&&<section className="report-sheet" aria-label="Receivables ageing">
    <h2>Receivables ageing at {summary.receivableAgeing.asOfDate} (UTC)</h2>
    <p>Based on terms saved at checkout and explicitly allocated repayments. Due today is current. Later policy changes do not change earlier due dates.</p>
    {summary.receivableAgeing.groups.map(g=><div key={g.currency} className="overflow-x-auto">
      <h3>{g.currency}</h3><table><thead><tr><th scope="col">Status</th><th scope="col">Outstanding</th></tr></thead><tbody>
      {([['Current / not yet due',g.currentMinor],['1–30 days overdue',g.days1to30Minor],
        ['31–60 days overdue',g.days31to60Minor],['61–90 days overdue',g.days61to90Minor],
        ['Over 90 days overdue',g.over90Minor],['Original due terms unknown',g.unknownTermsMinor],
        ['Earlier repayment allocation unknown',g.unknownAllocationMinor],['Total',g.outstandingMinor]] as [string,number][])
        .map(([label,value])=><tr key={label}><th scope="row">{label}</th><td>{formatMinorAmount(value,g.currency)}</td></tr>)}
      </tbody></table></div>)}
    {!summary.receivableAgeing.groups.length&&<p>No outstanding receivables with verified currency.</p>}
    {summary.receivableAgeing.unknownCurrencyCustomers>0&&<p role="status">{summary.receivableAgeing.unknownCurrencyCustomers} customer balances have unknown currency and are excluded from these totals.</p>}
    <p>Unknown terms and unallocated historical repayments are shown separately; no due date or payment allocation is guessed.</p>
  </section>}
  {summary?.prepaidCashAudit&&!loading&&
    <section className="report-sheet" aria-label="Prepaid cash and wallet conservation">
      <h2>Prepaid funds and stored-value liability (as-of now)</h2>
      <p>Recorded external prepaid deposits: <strong>{fmt(summary.prepaidCashAudit.depositedMinor)}</strong>.</p>
      <p>Recorded external cash refunds: <strong>{fmt(summary.prepaidCashAudit.refundedMinor)}</strong>.</p>
      <p>Wallet spent in saved sales: <strong>{fmt(summary.prepaidCashAudit.spentMinor)}</strong>;
       {' '}reversed wallet spending: <strong>{fmt(summary.prepaidCashAudit.reversedWalletSpendMinor)}</strong>.</p>
      <p>Current stored-value liability: <strong>{fmt(summary.prepaidCashAudit.liabilityMinor)}</strong>.</p>
      <p>These are locally recorded postings, not bank/provider-confirmed transfers.
       Wallet spending is not counted as additional cash received.</p>
    </section>}
  {summary?.inventoryValuation&&!loading&&
    <section className="report-sheet" aria-label="Inventory costing evidence">
      <h2>Inventory at saved FIFO receipt costs (as-of now)</h2>
      <p>Known historical-cost portion: <strong>{fmt(summary.inventoryValuation.knownValueMinor)}</strong></p>
      <p>Units lacking original cost evidence: <strong>{summary.inventoryValuation.unknownCostUnits}</strong> across {summary.inventoryValuation.unverifiedProducts} product(s).</p>
      {summary.inventoryValuation.complete
        ? <p>Reconstructed stock value: <strong>{fmt(summary.inventoryValuation.totalValueMinor!)}</strong>. This is not replacement value or audited statutory inventory.</p>
        : <p role="status">Complete inventory value is unavailable. Missing receipt costs are not estimated using today's product price.</p>}
      <p>Supplier receipts with matched invoice and FIFO unit costs: <strong>{summary.purchaseCostEvidence?.verifiedPurchases??0}</strong>.</p>
      <p>Older supplier receipts without complete cost-layer proof: <strong>{summary.purchaseCostEvidence?.legacyUnverifiedPurchases??0}</strong>. No purchase prices are inferred for these records.</p>
      <p>This is a current stock position, not a flow for the selected reporting period.</p>
    </section>}
  {summary&&!loading&&<><section className="reports-total-strip"><div><span>Net recorded sales</span><strong>{fmt(summary.revenueMinor)}</strong></div><div><span>Money collected</span><strong>{fmt(summary.collectionsMinor)}</strong></div><div><span>Recorded expenses</span><strong>{fmt(summary.expensesMinor)}</strong></div><div><span>Collections less expenses*</span><strong>{fmt(summary.netRecordedCashMovementMinor)}</strong></div></section><p className="report-boundary">* Not full cash flow or profit: supplier payments are shown separately by saved currency, excluded from this balance and may overlap recorded expenses; external disbursement matching remains unverified. Customer receivables are current across all dates: {fmt(summary.currentReceivablesMinor)}. {summary.prepaidLiabilityMinor !== undefined && <>Recognized prepaid wallet liability as-of full history: {fmt(summary.prepaidLiabilityMinor)} across {summary.prepaidLiabilityCustomers} customer(s). This is money owed as stored value, not additional sales revenue.</>}</p>
    <div className="reports-grid"><section className="report-sheet"><h2>Daily activity</h2>{summary.daily.length===0?<p>No records in this period.</p>:<div className="report-row-list">{summary.daily.map(x=><div key={x.day}><strong>{x.day}</strong><span>Collected {fmt(x.collectionsMinor)} · Expenses {fmt(x.expensesMinor)}</span><b>{fmt(x.revenueMinor)}</b></div>)}</div>}</section><section className="report-sheet"><h2>Expense categories</h2>{summary.expenseByCategory.length===0?<p>No recorded expenses.</p>:<div className="report-row-list">{summary.expenseByCategory.map(x=><div key={x.category}><strong>{x.category}</strong><b>{fmt(x.amountMinor)}</b></div>)}</div>}</section><section className="report-sheet"><h2>Collections breakdown</h2><div className="report-row-list"><div><strong>At-sale payments</strong><b>{fmt(summary.saleCollectionsMinor)}</b></div><div><strong>Debt repayments</strong><b>{fmt(summary.debtCollectionsMinor)}</b></div><div><strong>Sales recorded</strong><b>{summary.saleCount}</b></div></div></section><section className="report-sheet"><h2>Pending accounting integrations</h2><p>Historical COGS: {summary.unavailable.cogs}</p><p>Profit: {summary.unavailable.grossProfit}</p><p>Tax: {summary.unavailable.tax}</p><p>Supplier payables: {summary.unavailable.supplierPayables}</p>{summary.supplierReconciliation && <><p>Purchases with unverified liability: {summary.supplierReconciliation.unknownPurchases}</p>{summary.supplierReconciliation.outstandingByCurrency.map(row=><p key={`due-${row.currency}`}>Recognized payable as-of ({row.currency} minor units): {row.amountMinor.toLocaleString()}</p>)}{summary.supplierReconciliation.periodPaymentsByCurrency.map(row=><p key={`settlement-${row.currency}`}>Manually recorded supplier payments in period ({row.currency} minor units): {row.amountMinor.toLocaleString()}</p>)}</>}</section></div>
  </>}
  </main>;
}
