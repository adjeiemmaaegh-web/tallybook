/** Run 16 local-commerce invariants.
 * A hold is NOT a stock movement, payment, invoice, shipment or remote order.
 * All mutable transitions require company-scoped coordinated IndexedDB writes.
 */
const fail=message=>{throw Error(message);};
const id=x=>typeof x==="string"&&/^[A-Za-z0-9:_-]{1,128}$/.test(x);
const instant=x=>typeof x==="string"&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(x)&&Number.isFinite(Date.parse(x))&&new Date(x).toISOString()===x;
const units=x=>Number.isSafeInteger(x)&&x>0&&x<=9999;
const money=x=>Number.isSafeInteger(x)&&x>=0&&x<=9_000_000_000_000;
const plain=x=>x&&typeof x==="object"&&!Array.isArray(x);
export const RUN16_PUBLIC_NETWORK_ENABLED=false;
export const RUN16_LOCAL_COMMERCE_STATES=Object.freeze([
  "draft","prepared","ready","reserved","packed","dispatched","delivered","cancelled","return-requested"
]);
export function validateRun16Hold(h){
 if(!plain(h)||!id(h.id)||!id(h.businessProfileId)||!id(h.orderId)||
    !id(h.productId)||!units(h.quantity)||!instant(h.createdAt)||!instant(h.expiresAt)||
    Date.parse(h.expiresAt)<=Date.parse(h.createdAt)||
    Date.parse(h.expiresAt)-Date.parse(h.createdAt)>7*24*3600*1000||
    (h.storeId!==undefined&&!id(h.storeId))||
    !["active","consumed","released"].includes(h.status)||
    !["owner-confirmed","pos-consumed","order-cancelled","hold-expired"].includes(h.reason)||
    (h.status==="active"&&h.reason!=="owner-confirmed")||
    (h.status==="consumed"&&h.reason!=="pos-consumed")||
    (h.status==="released"&&!["order-cancelled","hold-expired"].includes(h.reason))||
    !instant(h.updatedAt)||Date.parse(h.updatedAt)<Date.parse(h.createdAt)||
    !money(h.unitPriceMinor)||!id(h.submissionKey)||
    !["businessProfileId","createdAt","expiresAt","id","orderId","productId","quantity","reason","status","storeId","submissionKey","unitPriceMinor","updatedAt"].filter(key=>key!=="storeId"||h.storeId!==undefined).every(key=>Object.prototype.hasOwnProperty.call(h,key))||
    Object.keys(h).some(key=>!["businessProfileId","createdAt","expiresAt","id","orderId","productId","quantity","reason","status","storeId","submissionKey","unitPriceMinor","updatedAt"].includes(key)))
   fail("Invalid commerce reservation evidence.");
 return Object.freeze({...h});
}
export function reservationBalance(holds,company,productId,storeId,now,excludeOrderId){
 if(!Array.isArray(holds)||!id(company)||!id(productId)||!instant(now))
   fail("Invalid reservation audit context.");
 let reserved=0;
 const keys=new Set();
 for(const h of holds){
  validateRun16Hold(h);
  if(h.businessProfileId!==company||h.productId!==productId)
    fail("A store reservation query returned cross-company or wrong-product evidence.");
  if(keys.has(h.id)||keys.has(h.submissionKey))fail("Duplicate order hold or submission identity.");
  keys.add(h.id);keys.add(h.submissionKey);
  if(h.status!=="active"||h.orderId===excludeOrderId||Date.parse(h.expiresAt)<=Date.parse(now))continue;
  if(storeId!==undefined&&h.storeId!==storeId)continue;
  if(storeId!==undefined&&h.storeId===undefined)
    fail("Unassigned company reservation blocks store-scoped allocation.");
  reserved+=h.quantity;
  if(!Number.isSafeInteger(reserved)||reserved>9_999_999)fail("Reserved stock overflow.");
 }
 return reserved;
}
export function allowedRun16DeliveryTransition(status,action,hasSale){
 const next={
  reserved:{pack:"packed",cancel:"cancelled"},
  packed:{dispatch:"dispatched",cancel:"cancelled"},
  dispatched:{deliver:"delivered"},
  delivered:{requestReturn:"return-requested"}
 }[status]?.[action];
 if(!next)fail("Invalid or already applied commerce delivery transition.");
 if(["dispatch","deliver","requestReturn"].includes(action)&&!hasSale)
   fail("A saved company POS sale must be linked before delivery or return review.");
 return next;
}
export function validateRun16DeliveryEvidence(entry){
 if(!plain(entry)||!id(entry.id)||!id(entry.businessProfileId)||!id(entry.orderId)||
    !id(entry.actorStaffId)||!id(entry.submissionKey)||!instant(entry.createdAt)||
    !Number.isSafeInteger(entry.sequence)||entry.sequence<1||entry.sequence>10000||
    !["reserve","release","pos-consume","pack","dispatch","deliver","return-request","cancel"].includes(entry.action)||
    typeof entry.note!=="string"||entry.note.length>500||
    !["draft","prepared","ready","reserved","packed","dispatched","delivered","cancelled","return-requested"].includes(entry.fromStatus)||
    !RUN16_LOCAL_COMMERCE_STATES.includes(entry.toStatus)||
    entry.financialPostingPerformed!==false||
    Object.keys(entry).sort().join(",")!==
    "action,actorStaffId,businessProfileId,createdAt,financialPostingPerformed,fromStatus,id,note,orderId,sequence,submissionKey,toStatus")
   fail("Invalid store order delivery audit event.");
 return Object.freeze({...entry});
}
export function auditRun16PortableCommerce(orders,holds,events,products,company){
 if(![orders,holds,events,products].every(Array.isArray)||!id(company))
   fail("Damaged commerce backup evidence.");
 const orderMap=new Map(),productMap=new Map(),held=new Map(),eventKeys=new Set();
 const orderEventMap=new Map();
 for(const product of products)if(product.businessProfileId===company)productMap.set(product.id,product);
 for(const order of orders){
  if(!plain(order)||!id(order.id)||order.businessProfileId!==company||
     !RUN16_LOCAL_COMMERCE_STATES.includes(order.status)||orderMap.has(order.id)||
     !Array.isArray(order.lines)||order.lines.length<1||order.lines.length>100)
    fail("Invalid order in commerce backup.");
  orderMap.set(order.id,order);
 }
 for(const hold of holds){
  validateRun16Hold(hold);
  const order=orderMap.get(hold.orderId),product=productMap.get(hold.productId);
  if(hold.businessProfileId!==company||!order||!product||product.itemKind==="service")
    fail("Orphan or cross-company reserved stock.");
  if(!order.lines.some(line=>line.productId===hold.productId&&line.quantity===hold.quantity&&
      line.unitPriceMinor===hold.unitPriceMinor))
    fail("Reservation does not match immutable order price and units.");
  const key=JSON.stringify([hold.orderId,hold.productId]);
  if(held.has(key))fail("A product was reserved more than once for the same order.");
  held.set(key,hold);
  if(hold.status==="active"&&!["reserved","packed"].includes(order.status))
    fail("Active stock reservation exists outside reservable order state.");
  if(hold.status==="consumed"&&!order.saleId)
    fail("Consumed reservation has no original sale link.");
 }
 for(const event of events){
  validateRun16DeliveryEvidence(event);
  if(event.businessProfileId!==company||!orderMap.has(event.orderId)||
     eventKeys.has(event.id)||eventKeys.has(event.submissionKey))
    fail("Duplicated or orphan commerce delivery evidence.");
  eventKeys.add(event.id);eventKeys.add(event.submissionKey);
  const ownEvents=orderEventMap.get(event.orderId)??[];
  ownEvents.push(event);orderEventMap.set(event.orderId,ownEvents);
 }
 for(const [orderId,list] of orderEventMap){
   list.sort((a,b)=>a.sequence-b.sequence);
   let previous;
   for(let i=0;i<list.length;i++){
     const event=list[i];
     if(event.sequence!==i+1||(previous!==undefined&&event.fromStatus!==previous))
       fail("Commerce delivery history has a gap or status fork.");
     previous=event.toStatus;
   }
   if(previous!==orderMap.get(orderId).status)
     fail("Commerce delivery history does not reconcile to saved order status.");
 }
 return Object.freeze({orders:orders.length,holds:holds.length,events:events.length,
  financialPostingPerformed:false,publiclyPublished:false});
}
