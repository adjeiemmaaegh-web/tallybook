/** Run 13: verify portable store stock is complete before restoring anything.
 * No mutation, inferred allocations or new financial authority.
 */
const deny=message=>{throw Error(message);};
const id=x=>typeof x==="string"&&x.length>0&&x.length<=200;
const whole=x=>Number.isSafeInteger(x)&&x>=0&&x<=9999999;
const slot=(s,p)=>JSON.stringify([s,p]);
export function auditRun13StoreBackup(company,modes,entries,products,stores,requests,movements) {
  if(!id(company)||![modes,entries,products,stores,requests,movements].every(Array.isArray))
    deny("Malformed store backup evidence.");
  if(modes.length>1 || modes.some(m=>m.businessProfileId!==company ||
      m.evidence!=="owner-confirmed-opening-allocations" || !id(m.activatedByStaffId) ||
      !Number.isFinite(Date.parse(m.activatedAt))))
    deny("Invalid store stock activation evidence.");
  if(!modes.length) {
    if(entries.length)deny("Orphan store stock journal without activation.");
    if(requests.some(r=>r.status==="completed"))deny("Completed transfer missing stock activation.");
    return {active:false,entryCount:0};
  }
  const movementById=new Map(movements.map(m=>[m.id,m]));
  if(movementById.size!==movements.length)deny("Duplicate company inventory movement identity.");
  const storeById=new Map(stores.map(s=>[s.id,s]));
  const productById=new Map(products.map(p=>[p.id,p]));
  const seenIds=new Set(),seenKeys=new Set(),sequence=new Map(),
    balances=new Map(),openings=new Set(),transfers=new Map();
  const ordered=[...entries].sort((a,b)=>String(a?.productId).localeCompare(String(b?.productId)) || Number(a?.sequence)-Number(b?.sequence));
  for(const e of ordered) {
    if(!id(e?.id)||!id(e?.storeId)||!id(e?.productId)||!id(e?.sourceId)||
       !id(e?.submissionKey)||e.businessProfileId!==company||
       !storeById.has(e.storeId)||storeById.get(e.storeId).businessProfileId!==company||
       !productById.has(e.productId)||productById.get(e.productId).businessProfileId!==company||
       !Number.isSafeInteger(e.quantityDelta)||Math.abs(e.quantityDelta)>9999999||
       !Number.isSafeInteger(e.sequence)||e.sequence<1 ||
       !Number.isFinite(Date.parse(e.createdAt)) ||
       new Date(e.createdAt).toISOString()!==e.createdAt ||
       !["opening","sale","purchase","refund","adjustment","transfer-out","transfer-in"].includes(e.kind) ||
       seenIds.has(e.id)||seenKeys.has(e.submissionKey))
      deny("Invalid or duplicated store stock evidence.");
    seenIds.add(e.id);seenKeys.add(e.submissionKey);
    if(!(e.kind==="opening"&&e.sourceId.startsWith("opening:"))) {
      if(e.kind!=="transfer-in"&&e.kind!=="transfer-out") {
        const movement=movementById.get(e.sourceId);
        if(!movement||movement.businessProfileId!==company||movement.productId!==e.productId||
           movement.quantityDelta!==e.quantityDelta||movement.createdAt!==e.createdAt)
          deny("Store stock entry is not linked to original company inventory movement.");
      }
    }
    const group=JSON.stringify([e.businessProfileId,e.productId]);
    const nextSequence=(sequence.get(group)||0)+1;
    if(e.sequence!==nextSequence)deny("Store stock journal sequence must be complete and ordered.");
    sequence.set(group,nextSequence);
    if(e.kind==="opening") {
      const k=slot(e.storeId,e.productId);
      if(openings.has(k)||e.quantityDelta<0||e.transferId!==undefined)
        deny("Duplicate or invalid opening store stock.");
      openings.add(k);
    }
    if(e.kind==="transfer-in"||e.kind==="transfer-out") {
      if(!id(e.transferId)||e.quantityDelta===0)deny("Missing transfer identity.");
      const item=transfers.get(e.transferId)||[];
      item.push(e);transfers.set(e.transferId,item);
    } else if(e.transferId!==undefined)deny("Non-transfer event has transfer identity.");
    const key=slot(e.storeId,e.productId),after=(balances.get(key)||0)+e.quantityDelta;
    if(!whole(after))deny("Store stock event produces invalid physical balance.");
    balances.set(key,after);
  }
  const completed=new Map();
  for(const r of requests) if(r.status==="completed") {
    if(!id(r.id)||!id(r.transferId)||!id(r.completionKey)||!Number.isFinite(Date.parse(r.completedAt)))
      deny("Completed transfer lacks durable evidence.");
    if(completed.has(r.transferId))deny("Transfer linked to multiple requests.");
    completed.set(r.transferId,r);
  }
  if(transfers.size!==completed.size)deny("Store transfer journal and request status disagree.");
  for(const [transferId,legs] of transfers) {
    const request=completed.get(transferId);
    if(!request||legs.length!==2)deny("Store transfer legs incomplete.");
    const out=legs.find(x=>x.kind==="transfer-out"),incoming=legs.find(x=>x.kind==="transfer-in");
    if(!out||!incoming||out.productId!==incoming.productId||
      out.storeId===incoming.storeId||out.quantityDelta>=0||
      incoming.quantityDelta!==-out.quantityDelta||out.sourceId!==request.id||
      incoming.sourceId!==request.id||out.productId!==request.productId||
      out.storeId!==request.sourceStoreId||incoming.storeId!==request.destinationStoreId||
      incoming.quantityDelta!==request.quantity||out.createdAt!==incoming.createdAt)
      deny("Transfer legs do not conserve and match saved request.");
  }
  const totals=new Map();
  for(const [key,value] of balances){
    const [,productId]=JSON.parse(key);
    const total=(totals.get(productId)||0)+value;
    if(!whole(total))deny("Store stock totals overflow.");
    totals.set(productId,total);
  }
  for(const p of products) if(p.itemKind!=="service") {
    if(!whole(p.stockQuantity)||(totals.get(p.id)||0)!==p.stockQuantity)
      deny("Store quantities do not equal company-authoritative stock.");
  }
  return {active:true,entryCount:entries.length,transferCount:transfers.size};
}
