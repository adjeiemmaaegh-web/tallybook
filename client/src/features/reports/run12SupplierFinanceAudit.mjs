import {reconcileSupplierFinancialReport} from './supplierReporting.mjs';
import {isValidFinancialPostingTimestamp} from './financialPeriodConservation.mjs';

/** Run 12: independent read-only supplier ownership and evidence conservation.
 * Supplier payments are manually ATTESTED outflows. Credits are noncash.
 * Expenses and supplier payments are distinct sources which may overlap if
 * staff entered one external payment twice: NEVER imply a certified net cash
 * figure without an independent disbursement/deduplication reconciliation.
 */
const fail=message=>{throw Error('Run 12 supplier financial audit: '+message);};
const ident=v=>typeof v==='string'&&v.length>0&&v.length<=100&&v.trim()===v;
const minor=v=>Number.isSafeInteger(v)&&v>=0;
const cur=v=>typeof v==='string'&&/^[A-Z]{3}$/.test(v);
const add=(a,b)=>{const n=a+BigInt(b);if(n>BigInt(Number.MAX_SAFE_INTEGER))fail('unsafe supplier monetary aggregate');return n;};
const inRange=(at,range)=>at>=range.start.getTime()&&at<range.end.getTime();
export function auditRun12SupplierFinance({
 company,companyCurrency,suppliers,purchases,entries,expenses,range
}={}){
 if(!ident(company)||!cur(companyCurrency)||
    ![suppliers,purchases,entries,expenses].every(Array.isArray)||
    !(range?.start instanceof Date)||!(range?.end instanceof Date)||
    !Number.isFinite(range.start.getTime())||!Number.isFinite(range.end.getTime())||
    range.end<=range.start)
   fail('missing company, currency, tables or reporting period');
 const suppliersById=new Map(),purchasesById=new Map();
 for(const supplier of suppliers){
  if(!ident(supplier?.id)||supplier.businessProfileId!==company||
     suppliersById.has(supplier.id))fail('duplicate or foreign supplier identity');
  suppliersById.set(supplier.id,supplier);
 }
 for(const purchase of purchases){
  if(!ident(purchase?.id)||purchase.businessProfileId!==company||
     purchasesById.has(purchase.id)||!suppliersById.has(purchase.supplierId)||
     !minor(purchase.totalCostMinor)||purchase.totalCostMinor===0||
     !isValidFinancialPostingTimestamp(purchase.createdAt)||
     (purchase.currency!==undefined&&!cur(purchase.currency)))
   fail('orphan, invalid or cross-company purchase receipt');
  purchasesById.set(purchase.id,purchase);
 }
 let manualPayments=0,unsupportedCreditNotes=0,unreferencedPayments=0;
 for(const entry of entries){
  const purchase=purchasesById.get(entry?.purchaseId);
  if(!purchase||entry.businessProfileId!==company||
     entry.supplierId!==purchase.supplierId||
     entry.currency!==purchase.currency||
     !isValidFinancialPostingTimestamp(entry.createdAt)||
     Date.parse(entry.createdAt)<Date.parse(purchase.createdAt)||
     !minor(entry.amountMinor)||entry.amountMinor===0||
     (entry.reference!==undefined&&(typeof entry.reference!=='string'||entry.reference.length>120)))
   fail('foreign, early or unsafe supplier payable posting');
  if(entry.kind==='payment'){
   manualPayments++;
   if(!entry.reference?.trim())unreferencedPayments++;
  }else if(entry.kind==='credit'){
   if(!entry.reference?.trim())unsupportedCreditNotes++;
  }
 }
 let operatingExpenseCount=0;
 for(const expense of expenses){
  if(!ident(expense?.id)||expense.businessProfileId!==company||
     !minor(expense.amountMinor)||expense.amountMinor===0||
     !isValidFinancialPostingTimestamp(expense.createdAt)||
     typeof expense.expenseDate!=='string'||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(expense.expenseDate))
   fail('invalid or foreign operating expense');
  if(expense.currency!==companyCurrency){
   // A live single-currency report must never silently relabel a saved
   // different or UNKNOWN expense as today's business denomination.
   fail('operating expense currency is missing or differs from company currency');
  }
  const expenseDay=Date.parse(expense.expenseDate+'T12:00:00Z');
  if(!Number.isFinite(expenseDay)||new Date(expenseDay).toISOString().slice(0,10)!==expense.expenseDate)
   fail('invalid expense calendar date');
  operatingExpenseCount++;
  // The existing operating expense report owns local-calendar period rules.
  // We do not override its range computation using UTC noon.
 }
 const supplier=reconcileSupplierFinancialReport(purchases,entries,range);
 let periodSupplierPaymentsInCompanyCurrencyMinor=0n;
 const otherCurrencyPayments=[];
 for(const row of supplier.periodPaymentsByCurrency){
  if(row.currency===companyCurrency)
   periodSupplierPaymentsInCompanyCurrencyMinor=add(periodSupplierPaymentsInCompanyCurrencyMinor,row.amountMinor);
  else if(row.amountMinor>0)
   otherCurrencyPayments.push({currency:row.currency,amountMinor:row.amountMinor});
 }
 // Monetary conservation is validated PER denomination. Adding GHS and USD
 // together would invent a false financial amount, even for a checksum.
 const map=rows=>new Map(rows.map(row=>[row.currency,BigInt(row.amountMinor)]));
 const paidBy=map(supplier.paidToDateByCurrency);
 const creditsBy=map(supplier.creditedToDateByCurrency);
 const dueBy=map(supplier.outstandingByCurrency);
 for(const row of supplier.recognizedByCurrency){
  const known=BigInt(row.amountMinor);
  if(known!==(paidBy.get(row.currency)??0n)+
     (creditsBy.get(row.currency)??0n)+(dueBy.get(row.currency)??0n))
   fail('supplier payable recognition, payments, credits and due do not conserve by currency');
 }
 return Object.freeze({
  unknownPurchases:supplier.unknownPurchases,
  recognizedPurchases:purchases.length-supplier.unknownPurchases,
  manuallyAttestedPayments:manualPayments,
  paymentsWithoutReferences:unreferencedPayments,
  supplierCreditsWithoutReferences:unsupportedCreditNotes,
  periodSupplierPaymentsByCurrency:supplier.periodPaymentsByCurrency,
  periodSupplierPaymentsInCompanyCurrencyMinor:
    Number(periodSupplierPaymentsInCompanyCurrencyMinor),
  otherCurrencyPayments,
  recordedOperatingExpenseCount:operatingExpenseCount,
  /** Never merge manual cash records and credits into an unqualified net. */
  providerSettlementVerified:false,
  potentialExpensePaymentOverlapUnresolved:true
 });
}
