/** Run 12: full-history recorded tax conservation, independently from period reports.
 * Adapted from the original supplier/tax draft to current verified sale and cash
 * return schema. No statutory tax computation, filing or bank/provider settlement.
 * Legacy tax configurations remain unknown rather than presumed exempt.
 */
const safe = x => Number.isSafeInteger(x) && x >= 0;
const fail = message => { throw Error('Run 12 recorded tax conservation: '+message); };
const time = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
const id = x => typeof x === 'string' && x.trim().length>0 && x.trim()===x && x.length<=140;
const total = x => { if(x>BigInt(Number.MAX_SAFE_INTEGER))fail('unsafe money total');return Number(x); };

export function auditRun12RecordedTaxConservation(sales,reversals,returns,company){
  if(!Array.isArray(sales)||!Array.isArray(reversals)||!Array.isArray(returns)||!id(company))
    fail('full company-scoped sale, reversal and cash-return snapshots are required');
  const originals=new Map();
  let gross=0n,known=0,unknown=0,unknownConfiguration=0;
  for(const sale of sales){
    if(!id(sale?.id)||originals.has(sale.id)||sale.businessProfileId!==company||
       !time(sale.createdAt)||!safe(sale.totalMinor))
      fail('duplicate, foreign or malformed original sale');
    originals.set(sale.id,sale);
    // A saved amount can be arithmetically valid even if the older sale
    // never captured the registered company's original tax policy.
    if(sale.taxConfigurationAtSale===undefined)unknownConfiguration++;
    if(sale.tax===undefined){ unknown++;continue; }
    if(!sale.tax||!safe(sale.tax.taxMinor)||!safe(sale.tax.taxableMinor)||
       !safe(sale.tax.totalMinor)||sale.tax.totalMinor!==sale.totalMinor||
       BigInt(sale.tax.taxableMinor)+BigInt(sale.tax.taxMinor)!==BigInt(sale.totalMinor))
      fail('invalid original recorded tax snapshot');
    gross+=BigInt(sale.tax.taxMinor);
    known++;
  }
  let reversed=0n,partial=0n,unknownRefunds=0;
  const fullIds=new Set(),usedReversals=new Set(),usedReturns=new Set(),keys=new Set(),partialBySale=new Map();
  for(const row of reversals){
    const sale=originals.get(row?.originalSaleId);
    if(!sale||!id(row?.id)||usedReversals.has(row.id)||
      row.businessProfileId!==company||!time(row.createdAt)||
      Date.parse(row.createdAt)<Date.parse(sale.createdAt)||
      row.reversedSaleTotalMinor!==-sale.totalMinor||
      fullIds.has(sale.id))
      fail('orphan, duplicate, foreign or conflicting full reversal');
    fullIds.add(sale.id);usedReversals.add(row.id);
    if(sale.tax===undefined){unknownRefunds++;continue;}
    reversed+=BigInt(sale.tax.taxMinor);
  }
  for(const row of returns){
    const sale=originals.get(row?.originalSaleId);
    if(!sale||!id(row?.id)||usedReturns.has(row.id)||!id(row.submissionKey)||
      keys.has(row.submissionKey)||row.businessProfileId!==company||
      !time(row.createdAt)||Date.parse(row.createdAt)<Date.parse(sale.createdAt)||
      fullIds.has(sale.id)||!safe(row.refundedMinor)||row.refundedMinor===0||
      !safe(row.returnedTaxMinor))
      fail('orphan, duplicate, foreign or invalid cash return');
    usedReturns.add(row.id);keys.add(row.submissionKey);
    const previous=partialBySale.get(sale.id)??{cash:0n,tax:0n};
    const cash=previous.cash+BigInt(row.refundedMinor);
    const tax=previous.tax+BigInt(row.returnedTaxMinor);
    if(cash>BigInt(sale.totalMinor)||tax>BigInt(sale.tax?.taxMinor??0) && sale.tax!==undefined)
      fail('cash returns exceed original saved invoice amounts or recorded tax');
    partialBySale.set(sale.id,{cash,tax});
    if(sale.tax===undefined){unknownRefunds++;continue;}
    partial+=BigInt(row.returnedTaxMinor);
  }
  const net=gross-reversed-partial;
  if(net<0n)fail('recorded tax does not conserve');
  return Object.freeze({
    recordedTaxSales:known,unknownTaxSales:unknown,
    unknownTaxConfigurationSales:unknownConfiguration,legacyRefundTaxUnverified:unknownRefunds,
    grossRecordedTaxMinor:total(gross),fullReversalTaxMinor:total(reversed),
    partialCashRefundTaxMinor:total(partial),netRecordedTaxMinor:total(net),
    recordedTaxEvidenceComplete:unknown===0&&unknownConfiguration===0&&unknownRefunds===0,
    statutoryTaxLiabilityVerified:false
  });
}
