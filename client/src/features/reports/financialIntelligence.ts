import { validateTaxSnapshot } from "@/features/sales/tax";
import { businessDayKey, businessDayStart, businessDayEnd, shiftBusinessDay } from "@/features/business/businessCalendar.mjs";
import { requirePermission } from "@/features/staff/staff";
/** V10 Stage 3 independent reporting engine. Read-only; no inventory-cost guesses. */
import { db, type TallybookDB } from "@/db/TallybookDB";
import { getActiveBusinessProfileId } from "@/features/business/activeCompany";
import type { WalletTransfer } from "@/features/customers/walletTransfers";
import type { CustomerBenefitEntry } from "@/features/customers/customerBenefits";
import type { Sale, SaleLine, Payment } from "@/features/sales/sales";
import type { DebtRepayment } from "@/features/credit/credit";
import type { Expense } from "@/features/expenses/expenses";
import type { SaleReversal } from "@/features/assistant/reversals";
import type { CashPartialSaleReturn } from "@/features/sales/cashPartialReturnPosting";
import { reconcileCashPartialReturns } from "@/features/sales/cashPartialReturn.mjs";
import { reconcileSaleCosts } from "./costReconciliation";
import type {Run9InventoryValuation} from './run9InventoryValuation.mjs';
import type {Run9PurchaseCostEvidence} from './run9PurchaseCostAudit.mjs';
import { assertSavedSaleTenderReconciliation } from "./saleTenderReconciliation.mjs";
import {auditRun10CompanyReceivables,type Run10ReceivableAudit} from './run10ReceivablesAudit.mjs';
import {auditRun10PrepaidCashConservation,type Run10PrepaidCashAudit} from './run10PrepaidCashAudit.mjs';
import type {Customer} from '@/features/customers/customers';
import {auditCompanyReturnPolicyEvidence,type CompanyReturnPolicyEvidenceSummary} from '@/features/business/returnPolicyAudit.mjs';
import {auditRun12SupplierFinance,type Run12SupplierFinancialAudit} from './run12SupplierFinanceAudit.mjs';
import {auditRun12SaleTaxHistory,type Run12SaleTaxHistory} from './run12SaleTaxAudit.mjs';
import { assertFinancialPostingDates, reconcileFinancialPeriodDisplay } from "./financialPeriodConservation.mjs";
import { assertSingleCurrencyFinancialEvidence } from "./financialCurrencyEvidence.mjs";
import { reconcileSupplierFinancialReport, type SupplierFinancialReconciliation } from "./supplierReporting.mjs";
import type { Purchase,PurchaseLine } from "@/features/purchases/purchases";
import type { SupplierPayableEntry } from "@/features/purchases/supplierPayables.ts";
import { assertCompanyScope } from "@/features/business/companyScope.mjs";
import {summarizeReceivableAgeing,type ReceivableAgeing} from './receivableAgeing.mjs';

export type FinancialPeriod = "today" | "week" | "month" | "quarter" | "year" | "custom";
export interface FinancialRange { start: Date; end: Date; label: string }
export interface FinancialInputs { sales: Sale[]; payments: Payment[]; repayments: DebtRepayment[]; expenses: Expense[]; reversals: SaleReversal[]; customers?:Customer[]; company?:string; cashReturns?: CashPartialSaleReturn[]; saleLines?: SaleLine[]; walletTransfers?: WalletTransfer[]; customerBenefits?: CustomerBenefitEntry[]; walletCurrency?: string; purchases?: Purchase[]; supplierPayableEntries?: SupplierPayableEntry[] }
export interface FinancialSummary {
  recordedTaxMinor: number;
  salesExcludingRecordedTaxMinor: number;
  cogsMinor?: number;
  salesLessCostMinor?: number;
  /** AS-OF full saved stock, not a period cash or profit flow. */
  inventoryValuation?:Run9InventoryValuation;
  purchaseCostEvidence?:Run9PurchaseCostEvidence;
  returnPolicyEvidence?:CompanyReturnPolicyEvidenceSummary;
  /** Original tax policy snapshots: off is explicit; legacy absence unknown. */
  taxEvidence?:Run12SaleTaxHistory;
  /** Original-currency supplier disbursements separate from operating expense. */
  supplierFinanceAudit?:Run12SupplierFinancialAudit;
  /** Full-history per-customer customer-credit conservation; not a period inflow. */
  receivableAudit?:Run10ReceivableAudit;
  receivableAgeing?:ReceivableAgeing;
  /** Wallet cash and stored-value conservation, NOT provider/bank verification. */
  prepaidCashAudit?:Run10PrepaidCashAudit;
  range: FinancialRange;
  revenueMinor: number;
  saleCount: number;
  collectionsMinor: number;
  saleCollectionsMinor: number;
  debtCollectionsMinor: number;
  expensesMinor: number;
  walletNetCashMinor: number;
  /** Saved prepaid liability as-of full history, NOT a period-only cash inflow. */
  prepaidLiabilityMinor?: number;
  prepaidLiabilityCustomers?: number;
  netRecordedCashMovementMinor: number;
  currentReceivablesMinor: number;
  /** Recognized payables are AS-OF saved history, not an amount for the selected period. */
  supplierReconciliation?: SupplierFinancialReconciliation;
  expenseByCategory: { category: string; amountMinor: number }[];
  daily: { day: string; revenueMinor: number; collectionsMinor: number; expensesMinor: number }[];
  unavailable: { cogs: string; grossProfit: string; tax: string; supplierPayables: string };
}
const validDate = (d: Date) => !Number.isNaN(d.getTime());
export function financialRange(period: FinancialPeriod, now = new Date(), customStart?: string, customEnd?: string, country?: string): FinancialRange {
  const ghana = country?.trim().toLowerCase() === "ghana";
  const start = businessDayStart(now, country);
  const end = businessDayEnd(now, country);
  const setDay = (date: Date, value: number) => ghana ? date.setUTCDate(value) : date.setDate(value);
  const setMonth = (date: Date, month: number, day?: number) => ghana ? date.setUTCMonth(month, day) : date.setMonth(month, day);
  const getDay = (date: Date) => ghana ? date.getUTCDate() : date.getDate();
  const getMonth = (date: Date) => ghana ? date.getUTCMonth() : date.getMonth();
  const weekday = ghana ? start.getUTCDay() : start.getDay();
  if (period === "week") setDay(start, getDay(start) - ((weekday + 6) % 7));
  if (period === "month") setDay(start, 1);
  if (period === "quarter") { setDay(start, 1); setMonth(start, Math.floor(getMonth(start) / 3) * 3); }
  if (period === "year") setMonth(start, 0, 1);
  if (period === "custom") {
    const parse = (value?: string) => {
      if (!value || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value)) throw new Error("Choose valid start and end dates.");
      const date = new Date(ghana ? value + "T00:00:00.000Z" : value + "T12:00:00");
      if (!validDate(date) || businessDayKey(date, country) !== value) throw new Error("Invalid calendar date.");
      return businessDayStart(date, country);
    };
    const a = parse(customStart), b = parse(customEnd);
    if (a > b) throw new Error("The start date cannot be after the end date.");
    const e = shiftBusinessDay(b, 1, country);
    if ((e.getTime() - a.getTime()) / 86400000 > 3660) throw new Error("The custom range cannot exceed ten years.");
    return { start: a, end: e, label: customStart + " to " + customEnd };
  }
  return { start, end, label: period === "today" ? "Today" : "This " + period };
}
const within = (date: string, range: FinancialRange) => { const d=new Date(date); return validDate(d)&&d>=range.start&&d<range.end; };
const total = <T,>(rows:T[], fn:(row:T)=>number) => rows.reduce((sum,row)=>{
  const amount = fn(row);
  if (!Number.isSafeInteger(amount) || !Number.isSafeInteger(sum + amount)) throw new Error("Financial totals exceed safe integer precision.");
  return sum + amount;
},0);
const safe = (value:number) => Number.isSafeInteger(value);
/** Customer receivables are current, not period-limited; reversal amounts are signed. */
export function summarizeFinancials(input:FinancialInputs, range:FinancialRange):FinancialSummary {
  // Financial reporting must not silently count orphaned payments or repeated reversals.
  // This check uses the same company-scoped snapshot as the report itself.
  assertFinancialPostingDates({sales:input.sales,payments:input.payments,repayments:input.repayments,reversals:input.reversals, cashReturns:input.cashReturns ?? [],walletTransfers:input.walletTransfers ?? [],expenses:input.expenses});
  const saleById=new Map(input.sales.map(s=>[s.id,s]));
  if (saleById.size!==input.sales.length) throw new Error("Financial records contain duplicate sale IDs; reconcile the ledger before reporting.");
  for (const sale of input.sales) {
    validateTaxSnapshot(sale);
    const wallet = sale.walletAppliedMinor ?? 0;
    if (!Number.isSafeInteger(wallet) || wallet < 0 || wallet > sale.amountPaidMinor ||
        (wallet > 0 && (!sale.customerId || sale.paymentMethod !== "wallet")))
      throw new Error("Invalid sale wallet settlement; reconcile before reporting.");
  }
  // Stage 2/3 reconciliation: fail closed when prepaid ledger metadata is damaged.
  // Check the entire company-scoped snapshot, not merely the selected date range.
  // Otherwise an old duplicate or invalid transfer could go unnoticed until that range is reported.
  const transferIds = new Set<string>();
  const transferSubmissionKeys = new Set<string>();
  for (const transfer of input.walletTransfers ?? []) {
    if (!transfer.id || !transfer.submissionKey || !transfer.customerId ||
        transferIds.has(transfer.id) || transferSubmissionKeys.has(transfer.submissionKey))
      throw new Error("Prepaid wallet transfer contains a duplicate or missing identity; reconcile the ledger before reporting.");
    transferIds.add(transfer.id);
    transferSubmissionKeys.add(transfer.submissionKey);
    if ((transfer.kind !== "deposit" && transfer.kind !== "refund") ||
        !Number.isSafeInteger(transfer.amountMinor) || transfer.amountMinor <= 0 ||
        transfer.amountMinor > 1_000_000_000 ||
        !Number.isFinite(Date.parse(transfer.createdAt)))
      throw new Error("Prepaid wallet transfer contains invalid cash movement; reconcile the ledger before reporting.");
  }
  const reversedSales=new Set<string>();
  for (const payment of input.payments) {
    const sale=saleById.get(payment.saleId);
    if (!sale) throw new Error("Financial records contain an orphaned sale payment; reconcile the ledger before reporting.");
    if (payment.customerId && payment.customerId!==sale.customerId) throw new Error("Financial records contain a payment/customer mismatch; reconcile the ledger before reporting.");
  }
  for (const reversal of input.reversals) {
    const sale=saleById.get(reversal.originalSaleId);
    if (!sale) throw new Error("Financial records contain an orphaned sale reversal; reconcile the ledger before reporting.");
    if (reversedSales.has(sale.id)) throw new Error("Financial records contain repeated reversals for one sale; reconcile the ledger before reporting.");
    reversedSales.add(sale.id);
    if (reversal.reversedSaleTotalMinor!==-sale.totalMinor || reversal.reversedReceivedMinor!==-sale.amountPaidMinor || reversal.reversedOutstandingMinor!==-sale.outstandingMinor) {
      throw new Error("Financial records contain a reversal amount mismatch; reconcile the ledger before reporting.");
    }
  }
  // Only certify a wallet liability when the full original wallet benefit,
  // prepaid cash, wallet-sale and reversal snapshots are provided together.
  if (input.customerBenefits !== undefined && (input.walletTransfers === undefined || !input.walletCurrency))
    throw new Error('Prepaid liability report needs complete transfer and currency evidence.');
  const prepaidLiability = input.customerBenefits !== undefined
    ? auditRun10PrepaidCashConservation({transfers: input.walletTransfers!, benefits: input.customerBenefits,
      sales: input.sales, reversals: input.reversals}, input.walletCurrency!)
    : undefined;
  const partialReturns = input.cashReturns ?? [];
  if (partialReturns.length) reconcileCashPartialReturns(input.sales,input.saleLines ?? [],input.payments,partialReturns,input.reversals);
  const refunds = partialReturns.filter(r=>within(r.createdAt,range));
  const sales=input.sales.filter(s=>within(s.createdAt,range));
  const payments=input.payments.filter(p=>within(p.createdAt,range));
  const repayments=input.repayments.filter(p=>within(p.createdAt,range));
  const walletTransfers=(input.walletTransfers??[]).filter(t=>within(t.createdAt,range));
  const walletNetCashMinor=total(walletTransfers,t=>t.kind==='deposit'?t.amountMinor:-t.amountMinor);
  const expenses=input.expenses.filter(e=>within(`${e.expenseDate}T12:00:00`,range));
  const reversals=input.reversals.filter(r=>within(r.createdAt,range));
  const revenueMinor=total(sales,s=>s.totalMinor)+total(reversals,r=>r.reversedSaleTotalMinor)-total(refunds,r=>r.refundedMinor);
  const recordedTaxMinor=total(sales,s=>s.tax?.taxMinor ?? 0)-total(reversals,r=>saleById.get(r.originalSaleId)?.tax?.taxMinor ?? 0)-total(refunds,r=>r.returnedTaxMinor);
  const salesExcludingRecordedTaxMinor=revenueMinor-recordedTaxMinor;
  const saleCollectionsMinor=total(payments,p=>p.amountMinor)+total(reversals,r=>r.reversedReceivedMinor + (saleById.get(r.originalSaleId)?.walletAppliedMinor ?? 0))-total(refunds,r=>r.refundedMinor);
  const debtCollectionsMinor=total(repayments,p=>p.amountMinor);
  const collectionsMinor=saleCollectionsMinor+debtCollectionsMinor+walletNetCashMinor;
  const expensesMinor=total(expenses,e=>e.amountMinor);
  // Live reports supply the complete company customer snapshot; never let
  // one customer's over-repayment cancel another's valid balance.
  // Standalone direct-call legacy summaries without customers remain
  // arithmetic-only and MUST NOT be treated as audited saved ledgers.
  if((input.customers===undefined)!==(input.company===undefined))
    throw new Error('Customer credit reporting requires company and customer identities together.');
  const receivableAudit=input.customers!==undefined
    ? auditRun10CompanyReceivables({
        company:input.company!,customers:input.customers,
        sales:input.sales,repayments:input.repayments,reversals:input.reversals
      })
    : undefined;
  const customerSales=input.sales.filter(s=>Boolean(s.customerId));
  const receivables=receivableAudit?.outstandingMinor??
    (total(customerSales,s=>s.outstandingMinor)+total(input.reversals,r=>r.reversedOutstandingMinor)-total(input.repayments,p=>p.amountMinor));
  // Rebuild the daily/category display from independent saved-event postings,
  // using exact integer arithmetic. A final net amount must never disguise an
  // overflowing daily balance, or a missing period row.
  const periodDisplay = reconcileFinancialPeriodDisplay({sales,payments,repayments,reversals,refunds,walletTransfers,expenses},saleById,{revenue:revenueMinor,collections:collectionsMinor,expenses:expensesMinor});
  // Report integrity is a hard boundary: masking a negative debt balance as zero
  // would hide duplicate repayments, mismatched reversals or damaged ledger data.
  const figures=[recordedTaxMinor,salesExcludingRecordedTaxMinor,revenueMinor,saleCollectionsMinor,debtCollectionsMinor,walletNetCashMinor,collectionsMinor,expensesMinor,receivables,collectionsMinor-expensesMinor];
  if(!figures.every(safe)) throw new Error("Financial totals exceed safe integer precision.");
  if (receivables < 0) throw new Error("Customer receivables do not reconcile: recorded repayments or reversals exceed outstanding credit. Review the source transactions before using this report.");
  if ([...input.sales.map(x=>x.totalMinor), ...input.payments.map(x=>x.amountMinor), ...input.repayments.map(x=>x.amountMinor), ...input.expenses.map(x=>x.amountMinor)].some(x=>!safe(x)||x<0)) throw new Error("Financial records contain invalid monetary amounts; this report cannot be trusted.");
  if ((input.purchases === undefined) !== (input.supplierPayableEntries === undefined)) throw new Error("Supplier report must include purchases and settlement entries together.");
  const supplierReconciliation = input.purchases !== undefined && input.supplierPayableEntries !== undefined
    ? reconcileSupplierFinancialReport(input.purchases, input.supplierPayableEntries, range)
    : undefined;
  const supplierLimitations = !supplierReconciliation
    ? "Supplier purchase and settlement evidence was not provided for this report."
    : supplierReconciliation.unknownPurchases
      ? `${supplierReconciliation.unknownPurchases} purchase(s) have unverified liability status. Recognized balances and manually recorded payments are separated by saved currency; no balance is assumed for those purchases.`
      : "Explicitly recognized liabilities reconcile by saved currency. Recorded payments are manual attestations, not bank/provider confirmation; no opening liabilities or unrecorded settlements are inferred.";
  return {supplierReconciliation, ...(receivableAudit?{receivableAudit}:{}),
    ...(prepaidLiability ? {prepaidLiabilityMinor:prepaidLiability.liabilityMinor,
      prepaidLiabilityCustomers:prepaidLiability.customerCount,
      prepaidCashAudit:prepaidLiability} : {}), recordedTaxMinor,salesExcludingRecordedTaxMinor,range,revenueMinor,saleCount:sales.length,collectionsMinor,saleCollectionsMinor,debtCollectionsMinor,walletNetCashMinor,expensesMinor,netRecordedCashMovementMinor:collectionsMinor-expensesMinor,currentReceivablesMinor:receivables,expenseByCategory:periodDisplay.expenseByCategory,daily:periodDisplay.daily,unavailable:{cogs:"Historical sale-line unit costs have not been established and reconciled with V9 inventory.",grossProfit:"Requires verified cost of goods sold, including purchase, return and batch costing.",tax:"Saved single-rate or opted-in Ghana VAT components are auditable; legal classification, certified e-VAT, input credits, historic unknown tax and statutory filing remain unverified.",supplierPayables:supplierLimitations}};
}
export async function getFinancialSummary(period:FinancialPeriod,now=new Date(),start?:string,end?:string,database:TallybookDB=db):Promise<FinancialSummary> {
  const company=getActiveBusinessProfileId();
  const records=await database.transaction("r",[database.businessProfiles,database.customers,database.sales,database.payments,database.repayments,database.expenses,database.saleReversals,database.cashPartialReturns,database.walletTransfers,database.inventoryCostEvents,database.products,database.saleLines,database.inventoryMovements,database.suppliers,database.purchases,database.purchaseLines,database.supplierPayableEntries,database.customerBenefits,database.staffMembers],async()=>{
    await requirePermission("reports", database, company);
    return Promise.all([database.businessProfiles.get(company),database.customers.toArray(),database.sales.toArray(),database.payments.toArray(),database.repayments.toArray(),database.expenses.toArray(),database.saleReversals.toArray(),database.cashPartialReturns.toArray(),database.walletTransfers.toArray(),database.inventoryCostEvents.toArray(),database.products.toArray(),database.saleLines.toArray(),database.inventoryMovements.toArray(),database.suppliers.toArray(),database.purchases.toArray(),database.purchaseLines.toArray(),database.supplierPayableEntries.toArray(),database.customerBenefits.toArray()]);
  });
  assertCompanyScope(company, getActiveBusinessProfileId());
  const [profile,customers,sales,payments,repayments,expenses,reversals,cashReturns,walletTransfers,events,products,lines,movements,suppliers,purchases,purchaseLines,supplierEntries,customerBenefits]=records;
  if (!profile || profile.id !== company) throw new Error("Business currency is unavailable for financial reporting.");
  const scoped = <T extends { businessProfileId: string }>(rows: T[]) => rows.filter(row => row.businessProfileId === company);
  const range = financialRange(period,now,start,end,profile.country);
  // Independent full-history checkout/tender reconstruction before summing any
  // selected period. A valid tax snapshot alone cannot certify cash collections.
  assertSavedSaleTenderReconciliation(scoped(sales), scoped(payments));
  assertSingleCurrencyFinancialEvidence({sales:scoped(sales),repayments:scoped(repayments),expenses:scoped(expenses),walletTransfers:scoped(walletTransfers),cashReturns:scoped(cashReturns)},profile.currency);
  const summary = summarizeFinancials({company,customers:scoped(customers),sales:scoped(sales),payments:scoped(payments),repayments:scoped(repayments),expenses:scoped(expenses),reversals:scoped(reversals),cashReturns:scoped(cashReturns),saleLines:scoped(lines),walletTransfers:scoped(walletTransfers),customerBenefits:scoped(customerBenefits),walletCurrency:profile.currency,purchases:scoped(purchases),supplierPayableEntries:scoped(supplierEntries)},range);
  const costs = reconcileSaleCosts(company,{sales:scoped(sales),reversals:scoped(reversals),cashReturns:scoped(cashReturns),events:scoped(events),products:scoped(products),lines:scoped(lines),movements:scoped(movements),
    purchases:scoped(purchases),purchaseLines:scoped(purchaseLines),
    expectedCurrency:profile.currency},range);
  // Independently reconstructed FIFO stock assets belong to a distinct
  // AS-OF section. Unknown receipt costs are never today's editable unit price.
  summary.returnPolicyEvidence=auditCompanyReturnPolicyEvidence(profile,scoped(sales),scoped(reversals),scoped(cashReturns));
  // Saved tax-off evidence and the original registered single-rate terms,
  // not the active tax settings, govern original invoice verification.
  summary.taxEvidence=auditRun12SaleTaxHistory(scoped(sales));
  // Supplier claims and manual outflows remain separate from operating
  // expenses and do not establish bank/provider settlement.
  summary.supplierFinanceAudit=auditRun12SupplierFinance({
    company,companyCurrency:profile.currency,suppliers:scoped(suppliers),
    purchases:scoped(purchases),entries:scoped(supplierEntries),
    expenses:scoped(expenses),range
  });
  summary.receivableAgeing=summarizeReceivableAgeing({company,customers:scoped(customers),
    sales:scoped(sales),repayments:scoped(repayments),reversals:scoped(reversals)},now.toISOString().slice(0,10));
  summary.inventoryValuation=costs.inventoryValuation;
  summary.purchaseCostEvidence=costs.purchaseCostEvidence;
  if (costs.cogsMinor !== undefined) {
    summary.cogsMinor = costs.cogsMinor;
    summary.salesLessCostMinor = summary.salesExcludingRecordedTaxMinor - costs.cogsMinor;
    if (!Number.isSafeInteger(summary.salesLessCostMinor)) throw new Error("Financial totals exceed safe integer precision.");
    summary.unavailable.cogs = "";
  } else summary.unavailable.cogs = `${costs.unavailableSales} sale or reversal postings have incomplete historical cost evidence.`;
  assertCompanyScope(company, getActiveBusinessProfileId());
  return summary;
}
function csvCell(value:string|number){const s=String(value);const protectedValue=/^[\s]*[=+@\-\t\r]/.test(s)?`'${s}`:s;return `"${protectedValue.replace(/"/g,'""')}"`;}
export function financialCsv(summary:FinancialSummary):string {
  const supplier = summary.supplierReconciliation;
  const supplierRows: (string | number)[][] = supplier ? [
    [], ["Supplier evidence", "Minor units or count"],
    ["Purchases of unknown liability status", supplier.unknownPurchases],
    ...(summary.supplierFinanceAudit ? [
      ["Saved supplier invoices with recognized liability",summary.supplierFinanceAudit.recognizedPurchases],
      ["Manually attested supplier payments",summary.supplierFinanceAudit.manuallyAttestedPayments],
      ["Supplier payments without external reference",summary.supplierFinanceAudit.paymentsWithoutReferences],
      ["Supplier credit notes without external reference",summary.supplierFinanceAudit.supplierCreditsWithoutReferences],
      ["Historical expenses without saved currency",summary.supplierFinanceAudit.expensesWithUnknownCurrency],
      ["Historical expenses in another currency",summary.supplierFinanceAudit.expensesInOtherCurrency],
      ["Manual supplier payments in company currency this period",summary.supplierFinanceAudit.periodSupplierPaymentsInCompanyCurrencyMinor]
    ] as (string|number)[][]:[]),
    ...supplier.outstandingByCurrency.map(row => [`Recognized payable as-of, ${row.currency}`,row.amountMinor]),
    ...supplier.periodPaymentsByCurrency.map(row => [`Manual supplier payments in period, ${row.currency}`,row.amountMinor]),
    ...supplier.creditedToDateByCurrency.map(row => [`Supplier credits as-of, ${row.currency}`,row.amountMinor]),
  ] : [];
  const rows: (string | number)[][]=[
    ['Tallybook management report',summary.range.label],['Metric','Minor units'],
    ['Net saved sales',summary.revenueMinor],['Recorded tax after reversals',summary.recordedTaxMinor],
    ['Sales excluding recorded tax',summary.salesExcludingRecordedTaxMinor],['Sales count',summary.saleCount],
    ...(summary.taxEvidence ? [
      ['Sales with saved registered tax policy',summary.taxEvidence.configuredChargedSales],
      ['Sales with explicit tax OFF at checkout',summary.taxEvidence.explicitNoTaxSales],
      ['Historical sales with unverified tax configuration',summary.taxEvidence.legacyUnverifiedSales]
    ] as (string|number)[][] : []),
    ['Money collected including prepaid deposits less refunds',summary.collectionsMinor],
    ['Net prepaid cash movement',summary.walletNetCashMinor],
    ...(summary.prepaidLiabilityMinor !== undefined ? [['Prepaid wallet liability as-of (minor units)',summary.prepaidLiabilityMinor],['Customers with prepaid balance',summary.prepaidLiabilityCustomers ?? 0]] as (string | number)[][] : []),['Recorded expenses',summary.expensesMinor],
    ['Collections minus recorded expenses (excludes supplier payments)',summary.netRecordedCashMovementMinor],
    ['Current customer receivables',summary.currentReceivablesMinor],
    ...(summary.returnPolicyEvidence?[
      ['Refunds with verified company policy snapshots',summary.returnPolicyEvidence.verifiedRefunds],
      ['Historical refunds with unverified policy evidence',summary.returnPolicyEvidence.legacyRefunds],
      ['Historical sales lacking original refund terms',summary.returnPolicyEvidence.salesWithoutHistoricalTerms],
      ['Current company refund policy revision',summary.returnPolicyEvidence.activeRevision]
    ] as (string|number)[][]:[]),
    ...(summary.receivableAudit?[
      ['Sale-linked customer repayments (as-of)',summary.receivableAudit.allocatedRepaymentMinor],
      ['Legacy unallocated customer repayments (as-of)',summary.receivableAudit.unallocatedRepaymentMinor],
      ['Customers currently owing saved credit (as-of)',summary.receivableAudit.indebtedCustomers],
      ['Customers with unverified historical credit currency',summary.receivableAudit.historicalUnknownCurrencyCustomers]
    ] as (string|number)[][]:[]),
    ...(summary.prepaidCashAudit?[
      ['Recorded prepaid deposits across full history',summary.prepaidCashAudit.depositedMinor],
      ['Recorded prepaid cash refunds across full history',summary.prepaidCashAudit.refundedMinor],
      ['Prepaid consumed in wallet sales across full history',summary.prepaidCashAudit.spentMinor],
      ['Original wallet spend restored on reversal',summary.prepaidCashAudit.reversedWalletSpendMinor]
    ] as (string|number)[][]:[]),
    ...(summary.receivableAgeing ? [
      ['Receivables ageing UTC date',summary.receivableAgeing.asOfDate],
      ['Customers excluded from ageing amounts: unknown currency',summary.receivableAgeing.unknownCurrencyCustomers],
      ...summary.receivableAgeing.groups.flatMap(g => [
        [`Receivables ${g.currency}: total minor units`,g.outstandingMinor],
        [`Receivables ${g.currency}: current or due today`,g.currentMinor],
        [`Receivables ${g.currency}: 1–30 days overdue`,g.days1to30Minor],
        [`Receivables ${g.currency}: 31–60 days overdue`,g.days31to60Minor],
        [`Receivables ${g.currency}: 61–90 days overdue`,g.days61to90Minor],
        [`Receivables ${g.currency}: over 90 days overdue`,g.over90Minor],
        [`Receivables ${g.currency}: unknown original terms`,g.unknownTermsMinor],
        [`Receivables ${g.currency}: unallocated repayment history`,g.unknownAllocationMinor],
      ])
    ] as (string|number)[][] : []),
    ['Verified COGS after reversals',summary.cogsMinor ?? `Unavailable: ${summary.unavailable.cogs}`],
    ...(summary.inventoryValuation ? [
      ['Known historical-cost stock assets, minor units (AS-OF; not replacement cost)',summary.inventoryValuation.knownValueMinor],
      ['Stock units with unknown receipt cost (AS-OF)',summary.inventoryValuation.unknownCostUnits],
      ['Products with incomplete cost evidence (AS-OF)',summary.inventoryValuation.unverifiedProducts],
      ['Supplier invoices with verified receipt cost evidence (AS-OF)',summary.purchaseCostEvidence?.verifiedPurchases ?? 0],
      ['Legacy supplier invoices with unverified receipt cost evidence (AS-OF)',summary.purchaseCostEvidence?.legacyUnverifiedPurchases ?? 0],
      ['Full stock value from verified receipts (AS-OF)',summary.inventoryValuation.complete
        ? summary.inventoryValuation.totalValueMinor ?? 0
        : 'Unavailable: some stock units have no historical purchase or opening cost']
    ] as (string|number)[][] : []),
    ['Sales excluding recorded tax less cost before expenses',summary.salesLessCostMinor ?? 'Unavailable'],
    ...supplierRows,[],['Day','Net sales (minor)','Collections (minor)','Expenses (minor)'],
    ...summary.daily.map(d=>[d.day,d.revenueMinor,d.collectionsMinor,d.expensesMinor]),[],
    ['Disclaimer','Not a statutory profit, tax, or complete cash-flow statement. Supplier payments and operating expenses may duplicate the same real-world payout; they are never netted together without external disbursement evidence. Historical liabilities, tax filing obligations and legal tax rates are not inferred.'],
  ];
  return rows.map(row=>row.map(csvCell).join(',')).join('\r\n');
}
