import {auditRun10CompanyReceivables} from './run10ReceivablesAudit.mjs';
import {reconcileCreditLedger,reconcileRepaymentAllocations,inspectReceivableCurrency} from '../sales/creditLedger.mjs';
import {validateCreditTerms} from '../credit/creditTerms.mjs';
const sum=(a,b)=>{const n=a+b;if(!Number.isSafeInteger(n)||n<0)throw Error('Ageing balance exceeds safe bounds.');return n;};
export function summarizeReceivableAgeing(input,asOfDate){
 if(typeof asOfDate!=='string'||!/^\d{4}-\d\d-\d\d$/.test(asOfDate)||
  !Number.isFinite(Date.parse(asOfDate+'T00:00:00Z'))||new Date(asOfDate+'T00:00:00Z').toISOString().slice(0,10)!==asOfDate)
  throw Error('Ageing requires a valid UTC reporting date.');
 auditRun10CompanyReceivables(input);
 for(const sale of input.sales)validateCreditTerms(sale);
 const groups=new Map();let unknownCurrencyCustomers=0;
 for(const customer of input.customers){
  const sales=input.sales.filter(s=>s.customerId===customer.id);
  const repayments=input.repayments.filter(r=>r.customerId===customer.id);
  const reversals=input.reversals.filter(r=>r.customerId===customer.id);
  if([...sales,...repayments,...reversals].some(r=>new Date(r.createdAt).toISOString().slice(0,10)>asOfDate))
   throw Error('Future-dated customer postings require review before ageing.');
  const debt=reconcileCreditLedger(sales,reversals,repayments);
  if(debt.outstandingMinor===0)continue;
  const currency=inspectReceivableCurrency(sales,repayments);
  if(currency.hasUnknownMoney||!currency.currency){unknownCurrencyCustomers++;continue;}
  let group=groups.get(currency.currency);
  if(!group){group={currency:currency.currency,outstandingMinor:0,currentMinor:0,days1to30Minor:0,
   days31to60Minor:0,days61to90Minor:0,over90Minor:0,unknownTermsMinor:0,unknownAllocationMinor:0};groups.set(currency.currency,group);}
  group.outstandingMinor=sum(group.outstandingMinor,debt.outstandingMinor);
  const allocation=reconcileRepaymentAllocations(sales,reversals,repayments);
  if(allocation.unallocatedMinor>0){group.unknownAllocationMinor=sum(group.unknownAllocationMinor,debt.outstandingMinor);continue;}
  const reversed=new Set(reversals.map(r=>r.originalSaleId));
  for(const sale of sales){
   if(reversed.has(sale.id))continue;
   const remaining=sale.outstandingMinor-(allocation.allocatedBySale.get(sale.id)??0);
   if(!Number.isSafeInteger(remaining)||remaining<0)throw Error('Sale balance does not reconcile for ageing.');
   if(remaining===0)continue;
   const due=sale.creditTermsAtSale?.dueDateUtc;
   let key='unknownTermsMinor';
   if(due){const days=(Date.parse(asOfDate+'T00:00:00Z')-Date.parse(due+'T00:00:00Z'))/86400000;
    key=days<=0?'currentMinor':days<=30?'days1to30Minor':days<=60?'days31to60Minor':days<=90?'days61to90Minor':'over90Minor';}
   group[key]=sum(group[key],remaining);
  }
 }
 for(const g of groups.values()){
  const total=['currentMinor','days1to30Minor','days31to60Minor','days61to90Minor','over90Minor','unknownTermsMinor','unknownAllocationMinor']
   .reduce((n,key)=>sum(n,g[key]),0);
  if(total!==g.outstandingMinor)throw Error('Ageing buckets do not conserve receivables.');
 }
 return {asOfDate,groups:[...groups.values()].sort((a,b)=>a.currency.localeCompare(b.currency)),unknownCurrencyCustomers};
}
