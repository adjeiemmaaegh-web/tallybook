/**
 * Run 13 immutable store-stock event validator. No database writes.
 * Store evidence remains NON-AUTHORITATIVE until every inventory entrypoint
 * (sale, purchase, return, adjustment, cost and restore) is store-scoped.
 */
const fail = message => { throw new Error(message); };
const id = v => typeof v === "string" && v.length > 0 && v.length <= 200;
const qty = v => Number.isSafeInteger(v) && v >= 0 && v <= 9999999;
const date = v => typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v) &&
  Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
const slot = (store, product) => JSON.stringify([store, product]);
export function auditStoreStockEvents({companyId, stores, products, entries}) {
  if (!id(companyId) || ![stores,products,entries].every(Array.isArray))
    fail("Store stock evidence unavailable.");
  const storeIds = new Set(), productById = new Map(), balances = new Map();
  const seenEvent = new Set(), seenKey = new Set(), transferPairs = new Map();
  const allocatedSlots = new Set();
  let transfersStarted = false;
  for (const store of stores) {
    if (!id(store?.id) || store.businessProfileId !== companyId || storeIds.has(store.id))
      fail("Invalid store identity.");
    storeIds.add(store.id);
  }
  for (const product of products) {
    if (!id(product?.id) || product.businessProfileId !== companyId ||
        productById.has(product.id) || !qty(product.stockQuantity))
      fail("Invalid company product stock.");
    productById.set(product.id, product);
  }
  for (const e of entries) {
    if (!id(e?.id) || !id(e?.submissionKey) || !id(e?.storeId) || !id(e?.productId) ||
        !id(e?.sourceId) || !date(e?.createdAt) || e.businessProfileId !== companyId ||
        !storeIds.has(e.storeId) || !productById.has(e.productId) ||
        seenEvent.has(e.id) || seenKey.has(e.submissionKey) ||
        !Number.isSafeInteger(e.quantityDelta) || Math.abs(e.quantityDelta)>9999999 ||
        !["allocation","transfer-out","transfer-in"].includes(e.kind))
      fail("Malformed, duplicated or cross-company stock event.");
    seenEvent.add(e.id); seenKey.add(e.submissionKey);
    if (e.kind==="allocation") {
      if (transfersStarted) fail("Opening allocations must precede transfer events.");
      if (e.quantityDelta<0) fail("Opening allocation cannot be negative.");
      const allocationSlot = slot(e.storeId,e.productId);
      if (allocatedSlots.has(allocationSlot)) fail("Duplicate opening allocation for store product.");
      allocatedSlots.add(allocationSlot);
    } else transfersStarted = true;
    if (e.kind!=="allocation" && (!id(e.transferId) || e.quantityDelta===0 ||
        (e.kind==="transfer-out" && e.quantityDelta>=0) ||
        (e.kind==="transfer-in" && e.quantityDelta<=0)))
      fail("Invalid paired transfer event.");
    if (e.kind==="allocation" && e.transferId!==undefined) fail("Allocation cannot reference transfer.");
    const k=slot(e.storeId,e.productId), next=(balances.get(k)||0)+e.quantityDelta;
    if (!qty(next)) fail("Store event would cause negative or unsafe stock.");
    balances.set(k,next);
    if (e.kind!=="allocation") {
      const key=JSON.stringify([e.transferId,e.productId]);
      const pair=transferPairs.get(key)||{out:[],in:[]};
      pair[e.kind==="transfer-out"?"out":"in"].push(e);
      transferPairs.set(key,pair);
    }
  }
  for (const [key,pair] of transferPairs) {
    if (pair.out.length!==1 || pair.in.length!==1) fail("Transfer must have exactly two stock legs.");
    const out=pair.out[0], incoming=pair.in[0];
    if (out.storeId===incoming.storeId || out.quantityDelta!==-incoming.quantityDelta ||
        out.createdAt!==incoming.createdAt || out.sourceId!==incoming.sourceId)
      fail("Transfer legs fail identity or quantity conservation.");
  }
  const allocated=new Map();
  for (const [k,amount] of balances) {
    const [,productId]=JSON.parse(k);
    const sum=(allocated.get(productId)||0)+amount;
    if (!Number.isSafeInteger(sum) || sum>productById.get(productId).stockQuantity)
      fail("Store total exceeds authoritative company stock.");
    allocated.set(productId,sum);
  }
  return {balances:[...balances].map(([k,quantity])=>{
    const [storeId,productId]=JSON.parse(k); return {storeId,productId,quantity};
  }),unallocated:[...productById.values()].map(p=>({
    productId:p.id,quantity:p.stockQuantity-(allocated.get(p.id)||0)
  })),pairedTransfers:transferPairs.size,authoritative:false};
}
