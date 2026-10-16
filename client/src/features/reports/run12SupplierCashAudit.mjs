/** Run 12: keep period cash outflows, recorded expenses, and recognized
 * supplier liabilities separate. No bank settlement or statutory tax implied.
 */
const safe=x=>Number.isSafeInteger(x)&&x>=0;
const money=(value,label)=>{
 if(!safe(value))throw Error('Run 12 '+label+' contains unsafe money.');
 return BigInt(value);
};
const sum=(rows,field)=>{
 let n=0n;
 for(const r of rows)n+=money(r[field],field);
 if(n>BigInt(Number.MAX_SAFE_INTEGER))throw Error('Run 12 cash reconciliation overflow.');
 return Number(n);
};
export function auditRun12SupplierCashConservation(summary,report,companyCurrency){
 if(!summary||!report||typeof companyCurrency!=='string'||
    !/^[A-Z]{3}$/.test(companyCurrency))
  throw Error('Run 12 cash audit needs an exact company currency and complete evidence.');
 const by=(rows,field)=>{
  if(!Array.isArray(rows))throw Error('Run 12 supplier rows unavailable.');
  const map=new Map();
  for(const row of rows){
   if(!row||typeof row.currency!=='string'||!/^[A-Z]{3}$/.test(row.currency)||
      map.has(row.currency)||!safe(row[field]))
    throw Error('Run 12 supplier currency rows contain duplicates or unsafe money.');
   map.set(row.currency,row[field]);
  }
  return map;
 };
 const recognized=by(report.recognizedByCurrency,'amountMinor');
 const paid=by(report.paidToDateByCurrency,'amountMinor');
 const credits=by(report.creditedToDateByCurrency,'amountMinor');
 const due=by(report.outstandingByCurrency,'amountMinor');
 const period=by(report.periodPaymentsByCurrency,'amountMinor');
 const currencies=new Set([...recognized.keys(),...paid.keys(),...credits.keys(),...due.keys(),...period.keys()]);
 for(const currency of currencies){
  const total=money(recognized.get(currency)??0,'recognized'),
   paidAmount=money(paid.get(currency)??0,'paid'),
   creditAmount=money(credits.get(currency)??0,'credit'),
   outstanding=money(due.get(currency)??0,'outstanding'),
   outflow=money(period.get(currency)??0,'period payment');
  if(total!==paidAmount+creditAmount+outstanding)
   throw Error('Run 12 supplier liability does not conserve its recognized amount.');
  // Period supplier outflow may be larger than a given as-of paid balance
  // only if the report is time-travelled. Current as-of report must not.
  if(outflow>paidAmount)
   throw Error('Run 12 period supplier cash exceeds saved lifetime supplier payments.');
 }
 const expenses=money(summary.expensesMinor,'expenses');
 const collections=money(summary.collectionsMinor,'collections');
 if(!Number.isSafeInteger(summary.netRecordedCashMovementMinor)||
    BigInt(summary.netRecordedCashMovementMinor)!==collections-expenses)
  throw Error('Run 12 customer collections and recorded expenses do not reconcile.');
 const local=BigInt(period.get(companyCurrency)??0);
 const consolidated=collections-expenses-local;
 if(consolidated>BigInt(Number.MAX_SAFE_INTEGER)||
    consolidated<BigInt(Number.MIN_SAFE_INTEGER))
  throw Error('Run 12 consolidated cash exceeds safe money precision.');
 const foreign=[...period].filter(([currency,amount])=>currency!==companyCurrency&&amount>0)
  .map(([currency,amountMinor])=>({currency,amountMinor}));
 return Object.freeze({
  companyCurrency,localSupplierPaymentsMinor:Number(local),
  collectionsLessExpensesAndLocalSupplierPaymentsMinor:Number(consolidated),
  foreignCurrencySupplierPayments:foreign,
  foreignSupplierPaymentsExcluded:foreign.length>0,
  unknownSupplierLiabilityPurchases:report.unknownPurchases,
  supplierLiabilityComplete:report.complete===true
 });
}
