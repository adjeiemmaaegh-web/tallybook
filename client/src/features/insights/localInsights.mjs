/** Offline Stage 11 evidence rules. This module does not mutate financial records. */
export function createLocalInsights(snapshot) {
  if (!snapshot || !Array.isArray(snapshot.inventory) || !Array.isArray(snapshot.debts) || !Array.isArray(snapshot.sales)) throw new TypeError('A verified local report snapshot is required');
  const findings = [];
  const low = snapshot.inventory.filter(p => p && p.isLowStock === true && Number.isFinite(p.stockQuantity) && Number.isFinite(p.lowStockThreshold) && p.stockQuantity >= 0 && p.lowStockThreshold >= 0);
  const sorted = low.sort((a,b) => a.stockQuantity - b.stockQuantity || String(a.productName).localeCompare(String(b.productName)));
  if (sorted.length) findings.push({id:'stock', kind:'stock', severity:'attention', title:`${sorted.length} product${sorted.length === 1?'':'s'} at or below low-stock threshold`, evidence:`${sorted.slice(0,3).map(p=>`${p.productName}: ${p.stockQuantity} remaining (threshold ${p.lowStockThreshold})`).join('; ')}${sorted.length > 3 ? '; more in inventory' : ''}`, action:'Review saved quantities and reorder needs', href:'/inventory'});
  const debt = snapshot.debts.filter(d => d && Number.isSafeInteger(d.outstandingMinor) && d.outstandingMinor > 0);
  if (debt.length) findings.push({id:'debt', kind:'debt', severity:'attention', title:`${debt.length} customer${debt.length === 1?'':'s'} with outstanding balances`, evidence:`Current recorded outstanding debt: ${debt.reduce((n,d)=> n+d.outstandingMinor,0)} minor currency units`, action:'Review individual customer balances before contacting anyone', href:'/customers'});
  const salesCount = snapshot.sales.length;
  if (salesCount === 0) findings.push({id:'sales',kind:'sales',severity:'information',title:'No completed sales in selected period',evidence:`${snapshot.range?.label ?? 'Selected period'} contains no completed-sale rows`, action:'Check the selected period or review your saved sales',href:'/reports'});
  else findings.push({id:'sales',kind:'sales',severity:'information',title:`${salesCount} completed-sale record${salesCount===1?'':'s'} in selected period`,evidence:`${snapshot.range?.label ?? 'Selected period'}; reported transactions are historical, not a forecast`,action:'Review sales and payment records',href:'/reports'});
  return findings;
}

/** Advisory-only rules. All estimates are labeled; no stock, debt or payment writes. */
export function createAdvancedInsights(snapshot, options = {}) {
  if (!snapshot || !Array.isArray(snapshot.inventory) || !Array.isArray(snapshot.sales) || !Array.isArray(snapshot.debts)) throw new TypeError('Verified reporting evidence required');
  const horizonDays = options.horizonDays ?? 14;
  if (!Number.isSafeInteger(horizonDays) || horizonDays < 1 || horizonDays > 90) throw new RangeError('Invalid planning horizon');
  const findings = [];
  const seen = new Set();
  for (const item of snapshot.inventory) {
    if (!item || typeof item.productId !== 'string' || seen.has(item.productId) || !Number.isSafeInteger(item.stockQuantity) || item.stockQuantity < 0 || !Number.isSafeInteger(item.lowStockThreshold) || item.lowStockThreshold < 0) continue;
    seen.add(item.productId);
    if (item.stockQuantity <= item.lowStockThreshold) findings.push({id:`reorder:${item.productId}`,kind:'reorder',severity:'attention',title:`Reorder review: ${String(item.productName || 'Unnamed product')}`,evidence:`Saved stock ${item.stockQuantity}; threshold ${item.lowStockThreshold}. Demand rate unavailable from summary rows.`,action:'Review purchase history and physical stock before placing an order',href:'/inventory'});
  }
  const totals = snapshot.sales.map(s=>s?.totalMinor);
  if (snapshot.sales.length >= 2 && totals.every(v=>Number.isSafeInteger(v) && v>=0) && snapshot.range?.period !== 'all') {
    const days = snapshot.range?.period === 'today' ? 1 : 7;
    const sum = totals.reduce((a,b)=>a+b,0);
    if (Number.isSafeInteger(sum)) findings.push({id:'demand',kind:'demand',severity:'information',title:'Observed sales pace (not a forecast)',evidence:`${snapshot.sales.length} recorded sales over a ${days}-day reporting window; ${sum} minor currency units total, approximately ${Math.round(sum/days)} per day. Not product-unit demand.`,action:'Use line-level sales history and historical cost before estimating product replenishment',href:'/reports'});
  }
  const debt = snapshot.debts.filter(d=>d && Number.isSafeInteger(d.outstandingMinor) && d.outstandingMinor>0);
  if (debt.length) {
    const sum = debt.reduce((a,d)=>a+d.outstandingMinor,0);
    if (Number.isSafeInteger(sum)) findings.push({id:'repayment',kind:'repayment',severity:'attention',title:'Outstanding balance review',evidence:`${debt.length} customer balances total ${sum} minor currency units. Due dates and payment promises are not available in this report.`,action:'Review customer ledgers before sending any reminder; ageing buckets cannot be verified here',href:'/customers'});
  }
  const batchRows = options.batchRows;
  if (Array.isArray(batchRows)) {
    const now = options.now ? new Date(options.now) : new Date();
    if (!Number.isFinite(now.getTime())) throw new TypeError('Invalid review date');
    for (const b of batchRows) {
      if (!b || b.companyId !== options.companyId || typeof b.batchId !== 'string' || typeof b.productName !== 'string' || !Number.isSafeInteger(b.remainingQuantity) || b.remainingQuantity <= 0 || typeof b.expiryDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(b.expiryDate)) continue;
      const expiry = new Date(`${b.expiryDate}T00:00:00.000Z`);
      if (!Number.isFinite(expiry.getTime()) || expiry.toISOString().slice(0,10)!==b.expiryDate) continue;
      const days = Math.ceil((expiry.getTime()-now.getTime())/86400000);
      if (days <= horizonDays) findings.push({id:`expiry:${b.batchId}`,kind:'expiry',severity:days<0?'attention':'information',title:`${days<0?'Expired':'Expiring'} batch: ${b.productName}`,evidence:`Batch ${b.batchId}; ${b.remainingQuantity} recorded units; expiry ${b.expiryDate}.`,action:'Verify the actual batch on the shelf before taking action',href:'/inventory'});
    }
  }
  return findings;
}
/** Default automation policy: recommendations only; never invoke an external action. */
export function evaluateAdvisoryRules(findings, policy = {}) {
  if (!Array.isArray(findings)) throw new TypeError('Findings required');
  const enabled = policy.enabled === true;
  const allowedKinds = new Set(['reorder','demand','repayment','expiry']);
  return enabled ? findings.filter(f=>f && allowedKinds.has(f.kind)).map(f=>({id:f.id,kind:f.kind,mode:'review-only',requiresHumanApproval:true,action:f.action})) : [];
}
