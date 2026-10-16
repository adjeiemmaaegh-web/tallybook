import {reconcileCreditLedger,reconcileRepaymentAllocations,inspectReceivableCurrency} from '../sales/creditLedger.mjs';

/** Read-only Run 10 customer-by-customer receivable conservation.
 * A single net number must NOT mask a customer's overpayment with another
 * customer's outstanding balance. Legacy unallocated repayments stay
 * customer-level facts and are never silently attributed to particular sales.
 */
const fail=(message)=>{throw Error('Customer receivable audit: '+message);};
const id=v=>typeof v==='string'&&v.trim().length>0&&v===v.trim();
const safe=v=>Number.isSafeInteger(v)&&v>=0;
const money=(a,b)=>{
 const x=a+b;
 if(!Number.isSafeInteger(x))fail('monetary sum exceeds safe integer precision');
 return x;
};
const instant=v=>{
 if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}T/.test(v)||
    !Number.isFinite(Date.parse(v)))fail('invalid saved posting date');
 return Date.parse(v);
};
export function auditRun10CompanyReceivables({
 company,customers,sales,repayments,reversals
}={}){
 if(!id(company)||![customers,sales,repayments,reversals].every(Array.isArray))
  fail('missing company-scoped saved financial evidence');
 const customersById=new Map(),saleById=new Map(),saleDates=new Map();
 const seenPaymentIds=new Set(),seenPaymentKeys=new Set();
 const seenReversalIds=new Set(),seenReversalSales=new Set();
 const salesByCustomer=new Map(),repaymentsByCustomer=new Map(),reversalsByCustomer=new Map();
 for(const customer of customers){
  if(!id(customer?.id)||customer.businessProfileId!==company||customersById.has(customer.id))
   fail('duplicate or foreign customer identity');
  customersById.set(customer.id,customer);
 }
 for(const sale of sales){
  if(!id(sale?.id)||sale.businessProfileId!==company||saleById.has(sale.id)||
     !safe(sale.outstandingMinor)||!safe(sale.totalMinor)||!safe(sale.amountPaidMinor))
   fail('duplicate, foreign or invalid original sale');
  const date=instant(sale.createdAt);
  if(sale.customerId!==undefined&&(!id(sale.customerId)||!customersById.has(sale.customerId)))
   fail('sale belongs to a missing or foreign customer');
  if(sale.outstandingMinor>0&&!sale.customerId)
   fail('unattributed credit sale cannot be customer receivable');
  saleById.set(sale.id,sale);saleDates.set(sale.id,date);
  if(sale.customerId){
   const rows=salesByCustomer.get(sale.customerId)??[];
   rows.push(sale);salesByCustomer.set(sale.customerId,rows);
  }
 }
 for(const repayment of repayments){
  if(!id(repayment?.id)||seenPaymentIds.has(repayment.id)||
     repayment.businessProfileId!==company||!id(repayment.customerId)||
     !customersById.has(repayment.customerId)||!safe(repayment.amountMinor)||
     repayment.amountMinor===0)
   fail('duplicate, foreign, orphan or invalid repayment');
  instant(repayment.createdAt);
  seenPaymentIds.add(repayment.id);
  if(repayment.submissionKey!==undefined){
   if(!id(repayment.submissionKey)||seenPaymentKeys.has(repayment.submissionKey))
    fail('repeated or malformed repayment submission key');
   seenPaymentKeys.add(repayment.submissionKey);
  }
  if(repayment.saleAllocations!==undefined){
   if(!Array.isArray(repayment.saleAllocations))fail('invalid sale-linked repayment');
   for(const entry of repayment.saleAllocations){
    const sale=saleById.get(entry?.saleId);
    if(!sale||sale.customerId!==repayment.customerId||
       instant(repayment.createdAt)<saleDates.get(sale.id))
      fail('repayment predates its target sale or crosses a customer');
   }
  }
  const rows=repaymentsByCustomer.get(repayment.customerId)??[];
  rows.push(repayment);repaymentsByCustomer.set(repayment.customerId,rows);
 }
 for(const reversal of reversals){
  if(!id(reversal?.id)||seenReversalIds.has(reversal.id)||
     !id(reversal.originalSaleId)||seenReversalSales.has(reversal.originalSaleId)||
     reversal.businessProfileId!==company)
   fail('duplicate or foreign full-sale reversal');
  const sale=saleById.get(reversal.originalSaleId);
  if(!sale||sale.customerId!==reversal.customerId||
     instant(reversal.createdAt)<saleDates.get(sale.id))
   fail('orphaned, premature or cross-customer sale reversal');
  seenReversalIds.add(reversal.id);seenReversalSales.add(sale.id);
  if(sale.customerId){
   const rows=reversalsByCustomer.get(sale.customerId)??[];
   rows.push(reversal);reversalsByCustomer.set(sale.customerId,rows);
  }
 }
 let outstandingMinor=0,salesOutstandingMinor=0,repaidMinor=0;
 let allocatedRepaymentMinor=0,unallocatedRepaymentMinor=0;
 let indebtedCustomers=0,historicalUnknownCurrencyCustomers=0;
 for(const customer of customers){
  const customerSales=salesByCustomer.get(customer.id)??[];
  const customerRepayments=repaymentsByCustomer.get(customer.id)??[];
  const customerReversals=reversalsByCustomer.get(customer.id)??[];
  let debt,allocations,currency;
  try{
   debt=reconcileCreditLedger(customerSales,customerReversals,customerRepayments);
   allocations=reconcileRepaymentAllocations(customerSales,customerReversals,customerRepayments);
   currency=inspectReceivableCurrency(customerSales,customerRepayments);
  }catch(err){fail('customer '+customer.id+' has unreconciled debt: '+(err?.message??String(err)));}
  outstandingMinor=money(outstandingMinor,debt.outstandingMinor);
  salesOutstandingMinor=money(salesOutstandingMinor,debt.salesOutstandingMinor);
  repaidMinor=money(repaidMinor,debt.repaidMinor);
  unallocatedRepaymentMinor=money(unallocatedRepaymentMinor,allocations.unallocatedMinor);
  for(const repayment of customerRepayments){
   if(repayment.saleAllocations!==undefined)
    allocatedRepaymentMinor=money(allocatedRepaymentMinor,repayment.amountMinor);
  }
  if(debt.outstandingMinor>0)indebtedCustomers++;
  if(currency.hasUnknownMoney)historicalUnknownCurrencyCustomers++;
 }
 if(money(outstandingMinor,repaidMinor)!==salesOutstandingMinor ||
    money(allocatedRepaymentMinor,unallocatedRepaymentMinor)!==repaidMinor)
  fail('total customer credit, sale allocation and repayments do not conserve');
 return Object.freeze({
  outstandingMinor,salesOutstandingMinor,repaidMinor,
  allocatedRepaymentMinor,unallocatedRepaymentMinor,
  indebtedCustomers,historicalUnknownCurrencyCustomers,
  customerCount:customers.length
 });
}
