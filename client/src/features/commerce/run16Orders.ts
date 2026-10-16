/** Run 16 — owner/attendant reviewed local commerce reservations and delivery.
 * No unauthenticated public internet intake, automatic financial posting, or
 * remote orders. Retails goods only through the existing authorized POS.
 */
import {nanoid} from "nanoid";
import {db,type TallybookDB} from "@/db/TallybookDB";
import {getActiveBusinessProfileId} from "@/features/business/activeCompany";
import {requirePermission,currentStaffId} from "@/features/staff/staff";
import {withCoordinatedRetailWrite} from "@/features/backup/coordinatedRetailWrite";
import {assertRun7RetailWriteReady} from "@/features/backup/run7RetailWriteBarrier.mjs";
import {currentCompanyReturnPolicy} from "@/features/business/returnPolicy.mjs";
import {readStoreBalances,reservedSourceUnits} from "@/features/stores/storeStockLedger";
import {requireCommerceCapability,type CommerceOrder} from "./commerce";
import {reservedRun16Units} from "./run16Availability";
import {allowedRun16DeliveryTransition,validateRun16Hold,validateRun16DeliveryEvidence,
 type Run16CommerceHold,type Run16OrderEvent} from "./run16Rules.mjs";
const ID=/^[A-Za-z0-9:_-]{1,128}$/;
const time=()=>new Date().toISOString();
function requireCompany(company:string){
 if(!ID.test(company)||getActiveBusinessProfileId()!==company)
  throw Error("Commerce company switched during a sensitive operation.");
}
async function actorWith(database:TallybookDB,company:string,permission:"sell"|"inventory"|"refund") {
 const actor=await requirePermission(permission,database,company);
 if(!actor||currentStaffId(company)!==actor.id)
  throw Error("Unlock the appropriate staff member for commerce operations.");
 return actor;
}
async function appendEvent(database:TallybookDB,company:string,order:CommerceOrder,
 action:Run16OrderEvent["action"],next:string,staffId:string,note:string,submissionKey:string,now:string) {
 const event:Run16OrderEvent={id:nanoid(18),businessProfileId:company,orderId:order.id,
 actorStaffId:staffId,submissionKey,action,fromStatus:order.status,toStatus:next,
 createdAt:now,note,financialPostingPerformed:false};
 validateRun16DeliveryEvidence(event);
 await database.commerceDeliveryEvents.add(event);
 return event;
}
export async function reserveRun16Order(
 orderId:string,storeId:string|undefined,ttlMinutes:number,submissionKey:string,
 database:TallybookDB=db
):Promise<CommerceOrder>{
 requireCommerceCapability("reserveStock");
 const company=getActiveBusinessProfileId();requireCompany(company);
 if(!ID.test(orderId)||!ID.test(submissionKey)||
    !Number.isSafeInteger(ttlMinutes)||ttlMinutes<5||ttlMinutes>10080||
    (storeId!==undefined&&!ID.test(storeId)))
   throw Error("Invalid commerce reservation request.");
 return withCoordinatedRetailWrite(()=>database.transaction("rw",[
   database.appMeta,database.businessProfiles,database.products,database.commerceOrders,
   database.commerceHolds,database.commerceDeliveryEvents,database.storeLocations,
   database.storeStockModes,database.storeStockEntries,database.storeTransferRequests,
   database.storeAssignments,database.staffMembers,database.staffAudits
 ],async()=>{
   await assertRun7RetailWriteReady(database.appMeta);
   const actor=await actorWith(database,company,"sell");
   const order=await database.commerceOrders.get(orderId);
   if(!order||order.businessProfileId!==company)
     throw Error("Order unavailable in this company.");
   const oldHolds=await database.commerceHolds.where("orderId").equals(orderId).toArray();
   if(order.status==="reserved"||order.status==="packed"){
     if(order.reservationKey===submissionKey&&order.storeId===storeId&&
        Boolean(order.reservationExpiresAt)&&Date.parse(order.reservationExpiresAt!)>Date.now()&&
        oldHolds.every(h=>h.status==="active"&&Date.parse(h.expiresAt)>Date.now()))
       return order;
     throw Error("Order already reserved with different or expired intent.");
   }
   if(!["draft","prepared","ready"].includes(order.status)||oldHolds.length)
     throw Error("Order cannot be reserved again without an explicit cancellation.");
   const activeStoreMode=await database.storeStockModes.get(company);
   if(Boolean(activeStoreMode)!==Boolean(storeId))
     throw Error(activeStoreMode?"Choose an active store for reservation.":"Store-specific stock has not been activated.");
   if(storeId){
     const store=await database.storeLocations.get(storeId);
     if(!store||store.businessProfileId!==company||store.status!=="active")
       throw Error("Reservation store is not active.");
     if(actor.role!=="owner"&&!await database.storeAssignments.where("[businessProfileId+staffId+storeId]")
       .equals([company,actor.id,storeId]).first())
       throw Error("Staff is not assigned to the reserving store.");
   }
   const now=time();
   const expiresAt=new Date(Date.parse(now)+ttlMinutes*60000).toISOString();
   const newHolds:Run16CommerceHold[]=[];
   if(!Array.isArray(order.lines)||order.lines.length<1||order.lines.length>100)
     throw Error("Order lines invalid for reservation.");
   for(const line of order.lines){
     const product=await database.products.get(line.productId);
     if(!product||product.businessProfileId!==company||product.archivedAt||
        !Number.isSafeInteger(line.quantity)||line.quantity<1||
        !Number.isSafeInteger(line.unitPriceMinor)||line.unitPriceMinor!==product.sellingPriceMinor)
       throw Error("Product or saved price changed. Review the order before reserving.");
     if(product.itemKind==="service")continue;
     const otherHolds=await reservedRun16Units(database,company,product.id,storeId,now);
     let physical=product.stockQuantity,dispatch=0;
     if(storeId) {
       const balances=await readStoreBalances(database,company,product.id);
       physical=balances.get(storeId)??0;
       dispatch=await reservedSourceUnits(database,company,product.id,storeId);
       const companyTotal=[...balances.values()].reduce((sum,n)=>sum+n,0);
       if(!Number.isSafeInteger(companyTotal)||companyTotal!==product.stockQuantity)
         throw Error("Store/company quantity mismatch during reservation.");
     }
     if(!Number.isSafeInteger(physical-otherHolds-dispatch)||
         line.quantity>physical-otherHolds-dispatch)
       throw Error("Insufficient uncommitted stock for this customer order.");
     const hold:Run16CommerceHold={
       id:nanoid(18),businessProfileId:company,orderId,productId:product.id,
       ...(storeId?{storeId}:{}),quantity:line.quantity,unitPriceMinor:line.unitPriceMinor,
       submissionKey:nanoid(18),createdAt:now,expiresAt,updatedAt:now,
       status:"active",reason:"owner-confirmed"};
     validateRun16Hold(hold);
     newHolds.push(hold);
   }
   requireCompany(company);
   if(newHolds.length)await database.commerceHolds.bulkAdd(newHolds);
   const changed:CommerceOrder={...order,status:"reserved",reservationKey:submissionKey,
     reservationExpiresAt:expiresAt,...(storeId?{storeId}:{}),updatedAt:now};
   await database.commerceOrders.put(changed);
   await appendEvent(database,company,order,"reserve","reserved",actor.id,
     "Staff confirmed inventory reservation; no payment or stock decrement",submissionKey,now);
   await database.staffAudits.add({id:nanoid(18),businessProfileId:company,
     staffId:actor.id,action:"commerce.reserved",createdAt:now,details:orderId});
   return changed;
 }));
}
export async function reservedRun16StockSummary(database:TallybookDB=db) {
 const company=getActiveBusinessProfileId();
 return database.transaction("r",database.staffMembers,database.products,
   database.commerceOrders,database.commerceHolds,async()=>{
   await actorWith(database,company,"sell");
   const [orders,holds]=await Promise.all([
     database.commerceOrders.where("businessProfileId").equals(company).toArray(),
     database.commerceHolds.where("businessProfileId").equals(company).toArray(),
   ]);
   requireCompany(company);
   return {orders,holds,publiclyPublished:false as const,
     paymentPerformed:false as const};
 });
}
/** Cancel only before a POS sale. After sale, use company's refund/return
 * policies and existing financial reversal services; never issue money here.
 */
export async function cancelRun16Order(orderId:string,submissionKey:string,reason:string,
 database:TallybookDB=db):Promise<CommerceOrder> {
 const company=getActiveBusinessProfileId();requireCompany(company);
 if(!ID.test(orderId)||!ID.test(submissionKey)||!reason.trim()||reason.length>240)
   throw Error("Cancellation needs order ID, unique key and explanation.");
 return withCoordinatedRetailWrite(()=>database.transaction("rw",[
   database.appMeta,database.commerceOrders,database.commerceHolds,
   database.commerceDeliveryEvents,database.staffMembers,database.staffAudits
 ],async()=>{
   await assertRun7RetailWriteReady(database.appMeta);
   const actor=await actorWith(database,company,"sell");
   const order=await database.commerceOrders.get(orderId);
   if(!order||order.businessProfileId!==company)throw Error("Order not in company.");
   if(order.status==="cancelled"){
     if(order.cancellationKey===submissionKey)return order;
     throw Error("Previously cancelled order cannot be changed.");
   }
   if(order.saleId||!["draft","prepared","ready","reserved","packed"].includes(order.status))
     throw Error("Paid, dispatched or delivered orders require formal return review, not cancellation.");
   const now=time(),all=await database.commerceHolds.where("orderId").equals(orderId).toArray();
   for(const h of all){
     if(h.businessProfileId!==company||h.status==="consumed")throw Error("Cannot cancel consumed or foreign reservation.");
     if(h.status==="active")await database.commerceHolds.put({...h,status:"released",
       reason:"order-cancelled",updatedAt:now});
   }
   const result:CommerceOrder={...order,status:"cancelled",cancellationKey:submissionKey,updatedAt:now};
   await appendEvent(database,company,order,"cancel","cancelled",actor.id,reason,submissionKey,now);
   requireCompany(company);
   await database.commerceOrders.put(result);
   await database.staffAudits.add({id:nanoid(18),businessProfileId:company,
     staffId:actor.id,action:"commerce.cancelled",createdAt:now,details:orderId});
   return result;
 }));
}
/** Manual expiration preserves complete old hold and order evidence; client
 * clocks are not trusted for remote public commitments.
 */
export async function expireRun16Order(orderId:string,database:TallybookDB=db) {
 const company=getActiveBusinessProfileId();
 return withCoordinatedRetailWrite(()=>database.transaction("rw",[
   database.appMeta,database.commerceOrders,database.commerceHolds,
   database.commerceDeliveryEvents,database.staffMembers
 ],async()=>{
   await assertRun7RetailWriteReady(database.appMeta);
   const actor=await actorWith(database,company,"sell");
   const order=await database.commerceOrders.get(orderId);
   if(!order||order.businessProfileId!==company||order.saleId||
      !["reserved","packed"].includes(order.status))
     throw Error("Only unfulfilled local orders may expire.");
   const now=time(),holds=await database.commerceHolds.where("orderId").equals(orderId).toArray();
   if(!order.reservationExpiresAt||Date.parse(order.reservationExpiresAt)>Date.parse(now)||
      holds.some(h=>h.businessProfileId!==company||h.status!=="active"||
      Date.parse(h.expiresAt)>Date.parse(now)))
     throw Error("Reservation is not entirely expired.");
   for(const hold of holds)await database.commerceHolds.put({...hold,status:"released",
     reason:"hold-expired",updatedAt:now});
   await appendEvent(database,company,order,"release","cancelled",actor.id,
     "Local reservation expired, no sale or refund",nanoid(18),now);
   const saved:CommerceOrder={...order,status:"cancelled",updatedAt:now};
   await database.commerceOrders.put(saved);
   return saved;
 }));
}
/** Called ONLY inside completeSale's existing atomic transaction, never as
 * an independent pre-approval to remove holds or charge a customer.
 */
export async function consumeRun16OrderForSale(
 database:TallybookDB,company:string,order:CommerceOrder,saleId:string,now:string,
 staffId:string
) {
 requireCompany(company);
 if(!ID.test(saleId)||order.businessProfileId!==company||
    order.status!=="reserved"||order.saleId||
    !order.reservationExpiresAt||Date.parse(order.reservationExpiresAt)<=Date.parse(now))
   throw Error("Order reservation expired, changed, or already sold.");
 const holds=await database.commerceHolds.where("orderId").equals(order.id).toArray();
 const stockLines=order.lines.filter(x=>x.quantity>0);
 const stocked=[];
 for(const line of stockLines){
   const candidate=await database.products.get(line.productId);
   if(!candidate||candidate.businessProfileId!==company)throw Error("Original order product is missing.");
   if(candidate.itemKind!=="service")stocked.push(line.productId);
 }
 if(holds.length!==stocked.length||new Set(holds.map(h=>h.productId)).size!==holds.length)
   throw Error("Reserved product set does not match the exact immutable POS cart.");
 for(const line of stockLines){
   const product=await database.products.get(line.productId);
   if(!product||product.businessProfileId!==company)throw Error("Reserved product no longer belongs to company.");
   if(product.itemKind==="service")continue;
   const hold=holds.find(h=>h.productId===line.productId);
   if(!hold||hold.businessProfileId!==company||hold.status!=="active"||
      hold.quantity!==line.quantity||hold.storeId!==order.storeId||
      Date.parse(hold.expiresAt)<=Date.parse(now))
     throw Error("POS sale requires exact current active stock reservation.");
 }
 for(const hold of holds)await database.commerceHolds.put({...hold,status:"consumed",
   reason:"pos-consumed",updatedAt:now});
 await appendEvent(database,company,order,"pos-consume","reserved",staffId,
   "Company POS receipt linked; stock movement handled by completeSale",
   "pos-consume:"+saleId,now);
 await database.commerceOrders.put({...order,saleId,updatedAt:now});
 return holds;
}
/** Logistics are human-reviewed, never evidence of payment or automatic refund. */
export async function recordRun16Delivery(
 orderId:string,action:"pack"|"dispatch"|"deliver"|"requestReturn",
 submissionKey:string,note:string,database:TallybookDB=db
):Promise<CommerceOrder>{
 requireCommerceCapability("fulfillOrders");
 const company=getActiveBusinessProfileId();requireCompany(company);
 if(!ID.test(orderId)||!ID.test(submissionKey)||typeof note!=="string"||
    !note.trim()||note.length>500)
   throw Error("Delivery action requires stable identity and factual note.");
 return withCoordinatedRetailWrite(()=>database.transaction("rw",[
   database.appMeta,database.businessProfiles,database.commerceOrders,
   database.commerceDeliveryEvents,database.sales,database.saleReversals,
   database.staffMembers,database.staffAudits
 ],async()=>{
   await assertRun7RetailWriteReady(database.appMeta);
   const actor=await actorWith(database,company,action==="requestReturn"?"refund":
     action==="dispatch"?"inventory":"sell");
   const order=await database.commerceOrders.get(orderId);
   if(!order||order.businessProfileId!==company)throw Error("Order no longer available.");
   const prior=await database.commerceDeliveryEvents.where("[businessProfileId+submissionKey]")
     .equals([company,submissionKey]).first();
   if(prior){
     if(prior.orderId===orderId&&prior.action===(action==="requestReturn"?"return-request":action)&&
        prior.note===note)return order;
     throw Error("Delivery submission identity reused with changed intent.");
   }
   const sale=order.saleId?await database.sales.get(order.saleId):undefined;
   const linked=Boolean(sale&&sale.businessProfileId===company);
   if(["dispatch","deliver","requestReturn","pack"].includes(action)&&!linked)
     throw Error("No original saved POS receipt for this order.");
   if(action==="requestReturn"){
     const profile=await database.businessProfiles.get(company);
     const policy=currentCompanyReturnPolicy(profile?.returnPolicyHistory);
     if(!policy.enabled||!(policy.allowFullReversal||policy.allowCashPartial)||
        !sale?.returnPolicyAtSale?.enabled||
        !(sale.returnPolicyAtSale.allowFullReversal||sale.returnPolicyAtSale.allowCashPartial))
       throw Error("Business return policy does not allow a return review for this sale.");
   }
   const next=allowedRun16DeliveryTransition(order.status,action,linked);
   const now=time();
   await appendEvent(database,company,order,
     action==="requestReturn"?"return-request":action,next,actor.id,note,submissionKey,now);
   const saved:CommerceOrder={...order,status:next as CommerceOrder["status"],
     updatedAt:now,...(action==="dispatch"?{dispatchedAt:now}:{}) ,
     ...(action==="deliver"?{deliveredAt:now}:{})};
   requireCompany(company);
   await database.commerceOrders.put(saved);
   await database.staffAudits.add({id:nanoid(18),businessProfileId:company,
     staffId:actor.id,action:"commerce."+action,createdAt:now,details:order.id});
   return saved;
 }));
}
