/** Run 12: recorded-tax evidence only. No statutory rate, VAT return,
 * exemption, recoverable input tax or tax remittance is inferred.
 */
const safe=x=>Number.isSafeInteger(x)&&x>=0;
const instant=x=>typeof x==='string'&&Number.isFinite(Date.parse(x));
export function auditRun12RecordedTax(sales,reversals,partialReturns,profile){
 if(!Array.isArray(sales)||!Array.isArray(reversals)||!Array.isArray(partialReturns)||
    !profile||typeof profile.id!=='string')
  throw Error('Run 12 tax audit needs complete company-scoped records.');
 const seen=new Set(),original=new Map();
 let recordedSales=0,unknownTaxSales=0,recordedGrossTax=0n;
 for(const sale of sales){
  if(!sale||typeof sale.id!=='string'||!sale.id||seen.has(sale.id)||
     sale.businessProfileId!==profile.id||!instant(sale.createdAt)||
     !safe(sale.totalMinor))
   throw Error('Run 12 tax audit has a duplicate, foreign or invalid sale.');
  seen.add(sale.id);original.set(sale.id,sale);
  if(sale.tax===undefined){unknownTaxSales++;continue;}
  const t=sale.tax;
  if(!t||!safe(t.taxMinor)||!safe(t.taxableMinor)||!safe(t.totalMinor)||
     t.totalMinor!==sale.totalMinor||t.taxableMinor+t.taxMinor!==t.totalMinor||
     t.policy?.enabled!==true||t.policy.registrationStatus!=='registered'||
     !Number.isSafeInteger(t.policy.rateBasisPoints)||
     t.policy.rateBasisPoints<0||t.policy.rateBasisPoints>10000)
   throw Error('Run 12 tax snapshot lacks a valid recorded rate or amount.');
  recordedSales++;recordedGrossTax+=BigInt(t.taxMinor);
 }
 const used=new Set();
 let reversedTax=0n,partialRefundTax=0n,legacyRefunds=0;
 for(const [rows,kind] of [[reversals,'full'],[partialReturns,'partial']]){
  for(const row of rows){
   const sale=original.get(row?.originalSaleId);
   if(!sale||row.businessProfileId!==profile.id||
      !instant(row.createdAt)||Date.parse(row.createdAt)<Date.parse(sale.createdAt)||
      !safe(row.refundMinor??row.totalMinor??0))
    throw Error('Run 12 tax refund has orphan, foreign or invalid posting evidence.');
   if(kind==='full'){
    if(used.has(sale.id))throw Error('Run 12 duplicate full reversal tax evidence.');
    used.add(sale.id);
    if(sale.tax===undefined){legacyRefunds++;continue;}
    reversedTax+=BigInt(sale.tax.taxMinor);
   }else{
    if(sale.tax===undefined){legacyRefunds++;continue;}
    const tax=row.taxRefundMinor;
    if(tax===undefined){legacyRefunds++;continue;}
    if(!safe(tax))throw Error('Run 12 cash refund tax amount is invalid.');
    partialRefundTax+=BigInt(tax);
   }
  }
 }
 const net=recordedGrossTax-reversedTax-partialRefundTax;
 if(net<0n||recordedGrossTax>BigInt(Number.MAX_SAFE_INTEGER)||
    net>BigInt(Number.MAX_SAFE_INTEGER))
  throw Error('Run 12 recorded tax evidence does not conserve.');
 return Object.freeze({
  recordedTaxSales:recordedSales,unknownTaxSales,
  grossRecordedTaxMinor:Number(recordedGrossTax),
  fullReversalTaxMinor:Number(reversedTax),
  partialCashRefundTaxMinor:Number(partialRefundTax),
  netRecordedTaxMinor:Number(net),
  legacyRefundTaxUnverified:legacyRefunds,
  currentTaxConfigured:profile.taxPolicy?.enabled===true,
  statutoryTaxLiabilityVerified:false
 });
}
