/** Run 17 — deterministic, PII-minimizing, merchant analytics evidence.
 * Report findings are review suggestions, not theft conclusions, audited money,
 * provider settlement confirmations, inventory transactions or forecasts.
 * The caller owns the company-scoped read transaction and staff authorization.
 */
const deny=(message)=>{throw new Error("Run 17 analytics: "+message);};
const ID=/^[A-Za-z0-9:_-]{1,128}$/;
const CCY=/^[A-Z]{3}$/;
const isDate=x=>typeof x==="string"&&Number.isFinite(Date.parse(x))&&new Date(x).toISOString()===x;
const qty=x=>Number.isSafeInteger(x)&&x>=0&&x<=9_999_999;
const minor=x=>Number.isSafeInteger(x)&&x>=0&&x<=9_000_000_000_000;
const safeAdd=(a,b)=>{const n=a+b;if(!Number.isSafeInteger(n)||n>9_000_000_000_000)deny("total exceeded safe integer bounds");return n;};
const source=(kind,id)=>Object.freeze({kind,id});
const fingerprint=(kind,id,fields)=>{
  // Deterministic UI evidence key, never a cryptographic security signature.
  return JSON.stringify([kind,id,...fields]);
};
function companyRows(rows,company,name){
 if(!Array.isArray(rows)||rows.length>100000)deny(name+" source is malformed or too large");
 const seen=new Set();
 for(const row of rows){
  if(!row||typeof row!=="object"||!ID.test(row.id)||row.businessProfileId!==company||seen.has(row.id))
   deny(name+" contains duplicate, foreign or invalid identity");
  seen.add(row.id);
 }
 return rows;
}
const finding=(kind,id,severity,title,detail,action,href,refs,fields,confidence="observed")=>Object.freeze({
  id:kind+":"+id,kind,severity,title,evidence:detail,action,href,
  sourceRefs:Object.freeze(refs),evidenceKey:fingerprint(kind,id,fields),
  confidence,automaticAction:false,financialPostingPerformed:false,
});
export function deriveRun17Evidence(input){
 if(!input||!ID.test(input.companyId)||!CCY.test(input.currency)||
    !isDate(input.asOf)||!["today","last7","all"].includes(input.period)||
    !Number.isSafeInteger(input.startMs)||!Number.isSafeInteger(input.endMs)||
    input.startMs<0||input.endMs<=input.startMs||input.endMs>Date.parse(input.asOf)+24*3600*1000)
   deny("invalid selected company, date or report period");
 const {companyId:company,asOf}=input;
 const products=companyRows(input.products,company,"product");
 const sales=companyRows(input.sales,company,"sale");
 const lines=companyRows(input.saleLines,company,"sale line");
 const reversals=companyRows(input.saleReversals,company,"reversal");
 const partialReturns=companyRows(input.cashPartialReturns,company,"partial return");
 const holds=companyRows(input.commerceHolds,company,"customer stock hold");
 const orders=companyRows(input.commerceOrders,company,"commerce order");
 const transfers=companyRows(input.storeTransferRequests,company,"store transfer");
 const stores=companyRows(input.storeLocations,company,"store");
 const productIds=new Set(products.map(x=>x.id));
 const saleMap=new Map(sales.map(x=>[x.id,x]));
 const orderMap=new Map(orders.map(x=>[x.id,x]));
 const storeIds=new Set(stores.map(x=>x.id));
 const selected=[],fullReversed=new Set(),partiallyReturned=new Set();
 for(const sale of sales){
  if(!isDate(sale.createdAt)||!minor(sale.totalMinor)||sale.currency!==input.currency||
     !["completed","reversed"].includes(sale.status)||
     (sale.storeId!==undefined&&!storeIds.has(sale.storeId)))
    deny("sale money, store or chronology requires reconciliation");
  const ts=Date.parse(sale.createdAt);
  if(ts>=input.startMs&&ts<input.endMs&&ts<=Date.parse(asOf))selected.push(sale);
 }
 for(const reversal of reversals){
  if(!saleMap.has(reversal.originalSaleId)||!isDate(reversal.createdAt))
    deny("orphan reversal evidence");
  if(Date.parse(reversal.createdAt)<=Date.parse(asOf))fullReversed.add(reversal.originalSaleId);
 }
 for(const returned of partialReturns){
  if(!saleMap.has(returned.originalSaleId)||!isDate(returned.createdAt))
    deny("orphan partial return evidence");
  if(Date.parse(returned.createdAt)<=Date.parse(asOf))partiallyReturned.add(returned.originalSaleId);
 }

 const eligibleSales=new Set(selected.filter(s=>!fullReversed.has(s.id)&&!partiallyReturned.has(s.id)).map(s=>s.id));
 const byProduct=new Map();
 for(const line of lines){
  if(!saleMap.has(line.saleId)||!productIds.has(line.productId)||
     !qty(line.quantity)||line.quantity===0||!minor(line.lineTotalMinor))
    deny("orphan sale quantity or untrusted invoice evidence");
  if(!eligibleSales.has(line.saleId))continue;
  const previous=byProduct.get(line.productId)??{units:0,rows:[]};
  const total=safeAdd(previous.units,line.quantity);
  byProduct.set(line.productId,{units:total,rows:[...previous.rows,line.id]});
 }
 let grossMinor=0;
 for(const s of selected)grossMinor=safeAdd(grossMinor,s.totalMinor);
 const selectedFull=selected.filter(s=>fullReversed.has(s.id)).length;
 const selectedPart=selected.filter(s=>partiallyReturned.has(s.id)).length;
  const perStore=new Map(stores.map(s=>[s.id,{storeId:s.id,storeName:s.name,
    grossRecordedInvoiceMinor:0,recordedSaleCount:0,fullyReversedSaleCount:0}]));
  for(const sale of selected){
    if(!sale.storeId)continue;
    const row=perStore.get(sale.storeId);
    if(!row)deny("sale refers to missing company store");
    row.recordedSaleCount++;
    row.grossRecordedInvoiceMinor=safeAdd(row.grossRecordedInvoiceMinor,sale.totalMinor);
    if(fullReversed.has(sale.id))row.fullyReversedSaleCount++;
  }
  const findings=[];
 for(const product of products){
  if(product.archivedAt||product.itemKind==="service")continue;
  if(!qty(product.stockQuantity)||!qty(product.lowStockThreshold))
    deny("invalid inventory balance or low-stock threshold");
  if(product.stockQuantity<=product.lowStockThreshold)
   findings.push(finding("stock",product.id,"attention",
    product.stockQuantity===0?"Out of stock: "+product.name:"Low stock: "+product.name,
    "Saved quantity "+product.stockQuantity+" units; configured threshold "+product.lowStockThreshold+
    ". Quantity is a recorded company total, not a physical count.",
    "Review saved stock, reservations and physical shelf count before ordering.",
    "/inventory",[source("products",product.id)],
    [product.stockQuantity,product.lowStockThreshold,product.updatedAt??""]
   ));
 }
 const cutoff=Date.parse(asOf);
 for(const hold of holds){
  if(!productIds.has(hold.productId)||!orderMap.has(hold.orderId)||
     !qty(hold.quantity)||hold.quantity===0||!isDate(hold.expiresAt)||
     !["active","released","consumed"].includes(hold.status))
    deny("orphan or malformed customer reservation");
  if(hold.status==="active"&&Date.parse(hold.expiresAt)<=cutoff){
    const order=orderMap.get(hold.orderId);
    if(order.saleId)deny("already sold order contains an expired active hold");
    findings.push(finding("hold",hold.id,"attention","Expired local order reservation",
     "Saved reservation expired at "+hold.expiresAt+"; "+hold.quantity+
     " units remain recorded as active. This is not a payment or shipment.",
     "Manually review the order and release an expired reservation; do not silently delete the hold.",
     "/commerce",[source("commerceHolds",hold.id),source("commerceOrders",hold.orderId)],
     [hold.status,hold.expiresAt,hold.quantity]));
  }
 }
 for(const order of orders){
   if(!["draft","prepared","ready","reserved","packed","dispatched","delivered","return-requested","cancelled"].includes(order.status)||
     !isDate(order.createdAt)||!isDate(order.updatedAt))deny("invalid customer order lifecycle");
   if(order.saleId&&!saleMap.has(order.saleId))deny("customer order references unavailable original sale");
   if(order.saleId&&["reserved","packed"].includes(order.status)&&
      cutoff-Date.parse(order.updatedAt)>24*3600*1000)
     findings.push(finding("fulfillment",order.id,"review","Saved POS order awaiting preparation",
       "The local order links to a saved POS receipt but still shows "+order.status+
       " more than 24 hours after its last recorded change. Delivery and settlement are not inferred.",
       "Review merchant fulfillment notes and the original receipt before contacting the customer.",
       "/commerce",[source("commerceOrders",order.id),source("sales",order.saleId)],
       [order.status,order.updatedAt,order.saleId]));
   if(order.status==="return-requested")
     findings.push(finding("return-request",order.id,"review","Customer return request needs policy review",
       "An order is marked return-requested. No refund, stock restock or customer credit adjustment has occurred merely because of this status.",
       "Review the original receipt and business-specific return policy; use the authorized refund workflow only.",
       "/commerce",[source("commerceOrders",order.id)],[order.status,order.updatedAt,order.saleId??""]));
 }
 for(const transfer of transfers){
  if(!["requested","cancelled","dispatched","completed"].includes(transfer.status)||
     !productIds.has(transfer.productId)||!storeIds.has(transfer.sourceStoreId)||
     !storeIds.has(transfer.destinationStoreId))deny("transfer references invalid store or product");
  if(transfer.status==="dispatched"){
   if(!isDate(transfer.dispatchedAt))deny("dispatched transfer lacks verifiable date");
   const age=cutoff-Date.parse(transfer.dispatchedAt);
   if(age>24*3600*1000)
    findings.push(finding("transfer",transfer.id,"attention","Unreceived store transfer",
      "Stock transfer has been recorded dispatched for more than 24 hours; arrival, loss or theft cannot be inferred.",
      "Review source and destination physical receipts before any inventory adjustment.",
      "/stores",[source("storeTransferRequests",transfer.id)],
      [transfer.status,transfer.dispatchedAt,transfer.productId,transfer.quantity]));
  }
 }
 const historicalMissingStore=stores.length>0?selected.filter(s=>!s.storeId).length:0;
 if(historicalMissingStore)
  findings.push(finding("coverage","store-origin","information","Some saved sales have no store attribution",
    historicalMissingStore+" saved sale records in this period have no verified origin store.",
    "Review the original source. Do not allocate historical sales to a store by guesswork.",
    "/reports",[],[historicalMissingStore,input.period],"limited"));
 if(selectedPart)
  findings.push(finding("coverage","partial-returns","information","Partially returned sales excluded from unit-demand ranking",
    selectedPart+" selected sales have a saved partial-return event; this dashboard avoids claiming accurate net units for those receipts.",
    "Review original sale lines and partial-return stock evidence before estimating net demand.",
    "/reports",[],[selectedPart,input.period],"limited"));
 const ranked=[...byProduct.entries()].map(([id,value])=>({
  productId:id,name:products.find(p=>p.id===id)?.name??id,units:value.units,
  sourceSaleLineIds:value.rows
 })).sort((a,b)=>b.units-a.units||a.name.localeCompare(b.name)).slice(0,10);
 const out=Object.freeze({
  companyId:company,currency:input.currency,period:input.period,asOf,
  scopeLabel:"Device-local recorded evidence; not bank-verified, not audited financial statements",
  summary:Object.freeze({
    grossRecordedInvoiceMinor:grossMinor,recordedSaleCount:selected.length,
    fullyReversedSaleCount:selectedFull,partialReturnAffectedSaleCount:selectedPart,
    storeOriginUnknownSaleCount:historicalMissingStore,localOrderCount:orders.length,
    pendingDispatchedTransferCount:transfers.filter(x=>x.status==="dispatched").length,
    deliveredOrderCount:orders.filter(x=>x.status==="delivered").length,
    financialReconciliation:false,predictionPerformed:false,
  }),
  topObservedUnits:Object.freeze(ranked),
  stores:Object.freeze([...perStore.values()].sort((a,b)=>a.storeName.localeCompare(b.storeName))),
  findings:Object.freeze(findings.sort((a,b)=>{
    const rank=x=>x.severity==="attention"?0:x.severity==="review"?1:2;
    return rank(a)-rank(b)||a.id.localeCompare(b.id);
  }).slice(0,100)),
  incompleteFindingCount:Math.max(0,findings.length-100),
  automaticAction:false,financialPostingPerformed:false,remoteDataUsed:false,
 });
 return out;
}
