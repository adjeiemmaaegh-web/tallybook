/** Run 9: reconcile supplier invoice lines to physical stock receipts AND
 * immutable cost layers. Legacy purchases predating FIFO recording are
 * explicitly unverified, never assigned an invented unit acquisition cost.
 */
const fail=x=>{throw Error('Supplier receipt cost evidence does not reconcile: '+x);};
const whole=x=>Number.isSafeInteger(x)&&x>=0;
const identity=x=>typeof x==='string'&&x.trim().length>0;
const safeSum=(a,b)=>{
 const n=a+b;if(!Number.isSafeInteger(n))fail('integer cost total overflow');
 return n;
};
export function assertRun9PurchaseCostCompleteness({
 purchases,purchaseLines,movements,events,company,expectedCurrency
}={}){
 if(![purchases,purchaseLines,movements,events].every(Array.isArray)||
    !identity(company))fail('missing saved supplier and stock snapshots');
 const purchaseById=new Map(),linesByPurchase=new Map(),stockByPurchase=new Map(),
  costByPurchase=new Map(),ids=new Set();
 for(const purchase of purchases){
  if(!identity(purchase?.id)||purchase.businessProfileId!==company||
     purchaseById.has(purchase.id)||!whole(purchase.totalCostMinor))
    fail('invalid or repeated supplier purchase');
  purchaseById.set(purchase.id,purchase);
 }
 for(const line of purchaseLines){
  if(!identity(line?.id)||ids.has(line.id)||line.businessProfileId!==company||
     !purchaseById.has(line.purchaseId)||!identity(line.productId)||
     !whole(line.quantity)||line.quantity===0||!whole(line.unitCostMinor)||
     !whole(line.lineTotalMinor)||
     BigInt(line.quantity)*BigInt(line.unitCostMinor)!==BigInt(line.lineTotalMinor))
    fail('supplier line cost and quantity are invalid');
  ids.add(line.id);
  const rows=linesByPurchase.get(line.purchaseId)??[];
  rows.push(line);linesByPurchase.set(line.purchaseId,rows);
 }
 const movementIds=new Set();
 for(const movement of movements){
  if(!identity(movement?.id)||movementIds.has(movement.id))fail('duplicate stock movement');
  movementIds.add(movement.id);
  if(movement.purchaseId===undefined)continue;
  if(movement.businessProfileId!==company||!purchaseById.has(movement.purchaseId)||
     movement.movementType!=='purchase'||!whole(movement.quantityDelta)||
     movement.quantityDelta===0)
    fail('orphaned physical supplier receipt');
  const rows=stockByPurchase.get(movement.purchaseId)??[];
  rows.push(movement);stockByPurchase.set(movement.purchaseId,rows);
 }
 const costIds=new Set();
 for(const event of events){
  if(!identity(event?.id)||costIds.has(event.id))fail('duplicate cost event');
  costIds.add(event.id);
  if(event.purchaseId===undefined)continue;
  if(event.businessProfileId!==company||!purchaseById.has(event.purchaseId)||
     event.kind!=='receipt'||!whole(event.unitCostMinor)||
     !whole(event.quantityDelta)||event.quantityDelta===0)
    fail('unlinked or invalid supplier acquisition cost');
  const rows=costByPurchase.get(event.purchaseId)??[];
  rows.push(event);costByPurchase.set(event.purchaseId,rows);
 }
 let verifiedPurchases=0,legacyUnverifiedPurchases=0;
 for(const purchase of purchases){
  const lines=linesByPurchase.get(purchase.id)??[];
  if(!lines.length)fail('supplier purchase without invoice lines');
  let total=0;const productIds=new Set();
  for(const line of lines){
   total=safeSum(total,line.lineTotalMinor);
   if(productIds.has(line.productId))fail('purchase repeats a product');
   productIds.add(line.productId);
  }
  if(total!==purchase.totalCostMinor)fail('invoice total differs from saved line costs');
  const linked=costByPurchase.get(purchase.id)??[];
  if(!linked.length){
   // Historical stock receipt records were never a verified receipt-cost
   // reconstruction. Retain them as incomplete evidence, not fabricated COGS.
   legacyUnverifiedPurchases++;
   continue;
  }
  if(expectedCurrency!==undefined&&purchase.currency!==expectedCurrency)
   fail('purchase cost currency is absent or differs from the reporting currency');
  const physical=stockByPurchase.get(purchase.id)??[];
  if(linked.length!==lines.length||physical.length!==lines.length)
   fail('purchase has missing or duplicated receipt layers');
  const used=new Set();
  for(const line of lines){
   const matches=linked.filter(event=>event.productId===line.productId);
   const moves=physical.filter(row=>row.productId===line.productId);
   if(matches.length!==1||moves.length!==1)
    fail('purchase cost evidence is not one-to-one per SKU');
   const event=matches[0],movement=moves[0];
   if(used.has(event.id)||event.sourceId!==movement.id||
      event.createdAt!==purchase.createdAt||
      event.createdAt!==movement.createdAt||
      event.quantityDelta!==line.quantity||
      movement.quantityDelta!==line.quantity||
      event.unitCostMinor!==line.unitCostMinor||
      movement.resultingQuantity-movement.previousQuantity!==line.quantity)
    fail('saved unit cost or physical supplier receipt differs from invoice');
   used.add(event.id);
  }
  verifiedPurchases++;
 }
 return Object.freeze({verifiedPurchases,legacyUnverifiedPurchases});
}
