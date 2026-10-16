import { withCoordinatedRetailWrite } from "@/features/backup/coordinatedRetailWrite";
/** Stage 9 transfer requests. These are proposals, NEVER stock or accounting postings. */
import { nanoid } from "nanoid";
import { db, type TallybookDB } from "@/db/TallybookDB";
import { getActiveBusinessProfileId } from "@/features/business/activeCompany";
import { requirePermission, currentStaffId } from "@/features/staff/staff";
import { assertRun7RetailWriteReady } from "@/features/backup/run7RetailWriteBarrier.mjs";
import { postPairedStoreTransfer, readStoreBalances, reservedSourceUnits } from "./storeStockLedger";
import { requireStage9Capability } from "./stage9ReleaseScope";

export interface StoreTransferRequest {
  id: string; businessProfileId: string; sourceStoreId: string; destinationStoreId: string;
  productId: string; quantity: number; status: "requested" | "dispatched" | "cancelled" | "completed"; completedAt?: string; completionKey?: string; transferId?: string;
  submissionKey?:string; dispatchKey?:string; dispatchedAt?:string; dispatchedByStaffId?:string; reversesRequestId?:string; returnProofKey?:string; returnedAt?:string; returnedByStaffId?:string;
  requestedByStaffId: string; createdAt: string; cancelledAt?: string;
}
export function validateTransferRequest(source: string, destination: string, product: string, quantity: number) {
  if (!source || !destination || source === destination) throw new Error("Select two different stores.");
  if (!product || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 9_999_999) throw new Error("Transfer quantity must be a positive whole number.");
}
export async function requestStoreTransfer(sourceStoreId: string, destinationStoreId: string, productId: string, quantity: number, database: TallybookDB = db, submissionKey = nanoid(18)) {
  return withCoordinatedRetailWrite(async () => {
    validateTransferRequest(sourceStoreId, destinationStoreId, productId, quantity);
    if(!/^[A-Za-z0-9:_-]{8,100}$/.test(submissionKey))throw new Error("Invalid transfer request submission identity.");
    const company = getActiveBusinessProfileId();
    return database.transaction("rw", [database.appMeta, database.storeTransferRequests, database.storeLocations, database.storeAssignments, database.products, database.staffMembers, database.staffAudits], async () => {
      await assertRun7RetailWriteReady(database.appMeta);
      const member = await requirePermission("staff", database, company);
      const existing=await database.storeTransferRequests.where("[businessProfileId+submissionKey]").equals([company,submissionKey]).first();
      if(existing){
        if(existing.sourceStoreId!==sourceStoreId||existing.destinationStoreId!==destinationStoreId||
          existing.productId!==productId||existing.quantity!==quantity)
          throw new Error("Transfer request key was previously used for different stock intent.");
        return existing;
      }
      const staffId = member?.id ?? currentStaffId(company);
      if (!staffId) throw new Error("Active staff identity required.");
      if (getActiveBusinessProfileId() !== company) throw new Error("Company changed.");
      const [source, destination, product, actor] = await Promise.all([database.storeLocations.get(sourceStoreId), database.storeLocations.get(destinationStoreId), database.products.get(productId), database.staffMembers.get(staffId)]);
      if ([source,destination].some(s => !s || s.businessProfileId !== company || s.status !== "active")) throw new Error("Both stores must be active in the same company.");
      if (!product || product.businessProfileId !== company || product.archivedAt || product.itemKind === "service") throw new Error("Valid stock product required.");
      if (!actor || actor.businessProfileId !== company || actor.disabledAt) throw new Error("Staff identity invalid.");
      if (actor.role !== "owner") {
        const sourceAssignment = await database.storeAssignments.where("[businessProfileId+staffId+storeId]").equals([company, staffId, sourceStoreId]).first();
        if (!sourceAssignment) throw new Error("Staff is not assigned to the source store.");
      }
      if (getActiveBusinessProfileId() !== company || currentStaffId(company) !== staffId)
        throw new Error("Company or staff session changed during request.");
      const entry: StoreTransferRequest = { id: nanoid(), businessProfileId: company, sourceStoreId, destinationStoreId, productId, quantity, status: "requested", requestedByStaffId: staffId, submissionKey, createdAt: new Date().toISOString() };
      await database.storeTransferRequests.add(entry);
      await database.staffAudits.add({id:nanoid(), businessProfileId:company, staffId, action:"store.transfer.requested", createdAt:entry.createdAt, details:entry.id});
      return entry;
    });
  });
}
export async function cancelStoreTransfer(requestId: string, database: TallybookDB = db) {
  return withCoordinatedRetailWrite(async () => {
    const company = getActiveBusinessProfileId();
    return database.transaction("rw", [database.appMeta, database.storeTransferRequests, database.staffMembers, database.staffAudits], async () => {
      await assertRun7RetailWriteReady(database.appMeta);
      const actor = await requirePermission("staff", database, company);
      const record = await database.storeTransferRequests.get(requestId);
      if (!record || record.businessProfileId !== company || getActiveBusinessProfileId() !== company) throw new Error("Request not found in company.");
      if (record.status === "cancelled") return record;
      if (record.status === "completed") throw new Error("Completed transfers cannot be cancelled.");
      if (record.status === "dispatched") throw new Error("Dispatched stock must be physically returned and separately confirmed before cancelling.");
      const updated: StoreTransferRequest = { ...record, status: "cancelled", cancelledAt: new Date().toISOString() };
      await database.storeTransferRequests.put(updated);
      if (actor) await database.staffAudits.add({id:nanoid(), businessProfileId:company, staffId:actor.id, action:"store.transfer.cancelled", createdAt:updated.cancelledAt!, details:requestId});
      return updated;
    });
  });
}
export async function listStoreTransferRequests(database: TallybookDB = db) {
  const company = getActiveBusinessProfileId();
  const records = await database.storeTransferRequests.where("businessProfileId").equals(company).toArray();
  if (getActiveBusinessProfileId() !== company || records.some(r => r.businessProfileId !== company)) throw new Error("Company changed while loading transfers.");
  return records.sort((a,b) => b.createdAt.localeCompare(a.createdAt));
}

/** Same-device, atomic paired transfer posting. This is not remote delivery
 * or multi-device inventory synchronization. */
export async function completeStoreTransfer(requestId:string,submissionKey:string,database:TallybookDB=db) {
  requireStage9Capability("executeStoreTransfer");
  return withCoordinatedRetailWrite(async()=>{
    const company=getActiveBusinessProfileId();
    if(!requestId || !/^[A-Za-z0-9:_-]{8,100}$/.test(submissionKey))
      throw new Error("Provide a valid transfer request and confirmation key.");
    return database.transaction("rw",[
      database.appMeta,database.storeStockModes,database.storeStockEntries,database.storeLocations,
      database.storeAssignments,database.storeTransferRequests,database.products,
      database.staffMembers,database.staffAudits
    ],async()=>{
      await assertRun7RetailWriteReady(database.appMeta);
      const staff=await requirePermission("inventory",database,company);
      if(!staff || currentStaffId(company)!==staff.id)
        throw new Error("Unlock inventory-authorized staff before completing transfer.");
      const request=await database.storeTransferRequests.get(requestId);
      if(!request || request.businessProfileId!==company)
        throw new Error("Transfer request missing or belongs to another company.");
      if(request.status==="completed"){
        if(request.completionKey!==submissionKey) throw new Error("Transfer already completed with a different confirmation.");
        if(!request.transferId)throw new Error("Completed transfer has no saved journal identity.");
        const legs=await database.storeStockEntries.where("transferId").equals(request.transferId).toArray();
        if(legs.length!==2 || !legs.some(e=>e.kind==="transfer-out"&&e.productId===request.productId&&e.quantityDelta===-request.quantity&&e.storeId===request.sourceStoreId) ||
          !legs.some(e=>e.kind==="transfer-in"&&e.productId===request.productId&&e.quantityDelta===request.quantity&&e.storeId===request.destinationStoreId))
          throw new Error("Completed transfer does not reconcile to saved stock legs.");
        return request;
      }
      if(request.status!=="dispatched"||!request.dispatchKey||!request.dispatchedByStaffId||!request.dispatchedAt)
        throw new Error("Store transfer must be dispatched and recorded before physical receipt.");
      if(staff.role!=="owner"&&!await database.storeAssignments.where("[businessProfileId+staffId+storeId]")
        .equals([company,staff.id,request.destinationStoreId]).first())
        throw new Error("Receiving staff is not assigned to the destination store.");
      if(getActiveBusinessProfileId()!==company || currentStaffId(company)!==staff.id)
        throw new Error("Company or staff session changed before transfer.");
      const now=new Date().toISOString();
      const transferId=await postPairedStoreTransfer(database,company,request,staff.id,submissionKey,now);
      const saved:StoreTransferRequest={...request,status:"completed",completedAt:now,completionKey:submissionKey,transferId};
      await database.storeTransferRequests.put(saved);
      await database.staffAudits.add({id:nanoid(14),businessProfileId:company,staffId:staff.id,
        action:"store.transfer.completed",createdAt:now,details:request.id});
      if(getActiveBusinessProfileId()!==company || currentStaffId(company)!==staff.id)
        throw new Error("Company or staff session changed during transfer.");
      return saved;
    });
  });
}

/** Dispatch reserves units at source; it does not silently move or sell them.
 * The separate receiving action posts both stock legs atomically.
 */
export async function dispatchStoreTransfer(requestId:string,dispatchKey:string,database:TallybookDB=db) {
  requireStage9Capability("executeStoreTransfer");
  return withCoordinatedRetailWrite(async()=>{
    const company=getActiveBusinessProfileId();
    if(!requestId||!/^[A-Za-z0-9:_-]{8,100}$/.test(dispatchKey))
      throw new Error("Invalid store dispatch identity.");
    return database.transaction("rw",[
      database.appMeta,database.storeStockModes,database.storeStockEntries,
      database.storeTransferRequests,database.storeLocations,database.products,
      database.storeAssignments,database.staffMembers,database.staffAudits
    ],async()=>{
      await assertRun7RetailWriteReady(database.appMeta);
      const actor=await requirePermission("inventory",database,company);
      if(!actor||currentStaffId(company)!==actor.id)
        throw new Error("Unlock inventory-authorized dispatch staff.");
      const request=await database.storeTransferRequests.get(requestId);
      if(!request||request.businessProfileId!==company)
        throw new Error("Request unavailable in this company.");
      if(request.status==="dispatched"||request.status==="completed") {
        if(request.dispatchKey===dispatchKey&&request.dispatchedAt)return request;
        throw new Error("Transfer is already dispatched under different evidence.");
      }
      if(request.status!=="requested")throw new Error("Cancelled transfer cannot be dispatched.");
      if(!await database.storeStockModes.get(company))
        throw new Error("Store stock must be explicitly activated first.");
      const duplicate=await database.storeTransferRequests.where("businessProfileId").equals(company)
        .filter(r=>r.id!==request.id&&r.dispatchKey===dispatchKey).first();
      if(duplicate)throw new Error("Dispatch confirmation key already belongs to another request.");
      const [source,destination,product]=await Promise.all([
        database.storeLocations.get(request.sourceStoreId),
        database.storeLocations.get(request.destinationStoreId),
        database.products.get(request.productId)
      ]);
      if(!source||!destination||source.id===destination.id||
         source.businessProfileId!==company||destination.businessProfileId!==company||
         source.status!=="active"||destination.status!=="active"||
         !product||product.businessProfileId!==company||product.archivedAt||
         product.itemKind==="service"||!Number.isSafeInteger(request.quantity)||
         request.quantity<=0||request.quantity>9999999)
        throw new Error("Transfer source, destination or stock product is invalid.");
      if(actor.role!=="owner"&&!await database.storeAssignments.where("[businessProfileId+staffId+storeId]")
        .equals([company,actor.id,source.id]).first())
        throw new Error("Dispatch staff is not assigned to the source store.");
      const balances=await readStoreBalances(database,company,product.id);
      const total=[...balances.values()].reduce((sum,n)=>sum+n,0);
      if(!Number.isSafeInteger(total)||total!==product.stockQuantity)
        throw new Error("Reconcile company and store stock before dispatch.");
      const reserved=await reservedSourceUnits(database,company,product.id,source.id);
      if((balances.get(source.id)??0)-reserved<request.quantity)
        throw new Error("Insufficient unreserved source stock to dispatch.");
      if(getActiveBusinessProfileId()!==company||currentStaffId(company)!==actor.id)
        throw new Error("Company or dispatch staff session changed.");
      const now=new Date().toISOString();
      const saved:StoreTransferRequest={...request,status:"dispatched",dispatchedAt:now,
        dispatchedByStaffId:actor.id,dispatchKey};
      await database.storeTransferRequests.put(saved);
      await database.staffAudits.add({id:nanoid(14),businessProfileId:company,staffId:actor.id,
        action:"store.transfer.dispatched",createdAt:now,details:requestId});
      return saved;
    });
  });
}

/** Confirm physically undelivered dispatched goods have returned to source
 * before releasing the reservation. No inventory movement was posted yet.
 */
export async function returnUndeliveredDispatch(
 requestId:string,returnProofKey:string,physicallyReturned:true,database:TallybookDB=db
) {
  requireStage9Capability("executeStoreTransfer");
  if(physicallyReturned!==true||!/^[A-Za-z0-9:_-]{8,100}$/.test(returnProofKey))
    throw new Error("Explicit physical-return confirmation and unique key required.");
  return withCoordinatedRetailWrite(async()=>{
    const company=getActiveBusinessProfileId();
    return database.transaction("rw",[
      database.appMeta,database.storeTransferRequests,database.storeLocations,
      database.staffMembers,database.storeAssignments,database.staffAudits
    ],async()=>{
      await assertRun7RetailWriteReady(database.appMeta);
      const actor=await requirePermission("inventory",database,company);
      if(!actor||currentStaffId(company)!==actor.id)
        throw new Error("Unlock inventory-authorized return staff.");
      const request=await database.storeTransferRequests.get(requestId);
      if(!request||request.businessProfileId!==company)
        throw new Error("Transfer request unavailable.");
      if(request.status==="cancelled") {
        if(request.returnProofKey===returnProofKey&&request.returnedAt)return request;
        throw new Error("Transfer was cancelled under different evidence.");
      }
      if(request.status!=="dispatched")
        throw new Error("Only dispatched, not received, stock can be returned without a stock movement.");
      if(actor.role!=="owner"&&!await database.storeAssignments.where("[businessProfileId+staffId+storeId]")
         .equals([company,actor.id,request.sourceStoreId]).first())
        throw new Error("Confirming staff is not assigned to source store.");
      if(getActiveBusinessProfileId()!==company||currentStaffId(company)!==actor.id)
        throw new Error("Company or staff changed before dispatch return.");
      const now=new Date().toISOString();
      const updated:StoreTransferRequest={...request,status:"cancelled",cancelledAt:now,
        returnProofKey,returnedAt:now,returnedByStaffId:actor.id};
      await database.storeTransferRequests.put(updated);
      await database.staffAudits.add({id:nanoid(14),businessProfileId:company,staffId:actor.id,
        action:"store.transfer.dispatch-returned",createdAt:now,details:requestId});
      return updated;
    });
  });
}
/** Post-receipt reversals are new, oppositely directed auditable transfers.
 * Never delete or edit the original completed transfer legs.
 */
export async function requestStoreTransferReversal(
 originalRequestId:string,submissionKey:string,database:TallybookDB=db
) {
  requireStage9Capability("executeStoreTransfer");
  if(!originalRequestId||!/^[A-Za-z0-9:_-]{8,100}$/.test(submissionKey))
    throw new Error("Invalid transfer reversal request.");
  return withCoordinatedRetailWrite(async()=>{
    const company=getActiveBusinessProfileId();
    return database.transaction("rw",[
      database.appMeta,database.storeTransferRequests,database.storeLocations,
      database.products,database.staffMembers,database.storeAssignments,database.staffAudits
    ],async()=>{
      await assertRun7RetailWriteReady(database.appMeta);
      const actor=await requirePermission("inventory",database,company);
      if(!actor||currentStaffId(company)!==actor.id)
        throw new Error("Unlock inventory-authorized transfer reversal staff.");
      const original=await database.storeTransferRequests.get(originalRequestId);
      if(!original||original.businessProfileId!==company||original.status!=="completed"||!original.transferId)
        throw new Error("Only a completed transfer can be reversed.");
      const prior=await database.storeTransferRequests.where("businessProfileId").equals(company)
        .filter(row=>row.reversesRequestId===originalRequestId).first();
      if(prior){
        if(prior.submissionKey===submissionKey)return prior;
        throw new Error("Reversal already requested for this completed transfer.");
      }
      const source=await database.storeLocations.get(original.destinationStoreId);
      const target=await database.storeLocations.get(original.sourceStoreId);
      const product=await database.products.get(original.productId);
      if(!source||!target||source.status!=="active"||target.status!=="active"||
        source.businessProfileId!==company||target.businessProfileId!==company||
        !product||product.businessProfileId!==company||product.archivedAt)
        throw new Error("Return transfer requires active stores and product.");
      if(actor.role!=="owner"&&!await database.storeAssignments.where("[businessProfileId+staffId+storeId]")
        .equals([company,actor.id,source.id]).first())
        throw new Error("Staff is not assigned to the reversing source store.");
      const now=new Date().toISOString();
      const request:StoreTransferRequest={id:nanoid(18),businessProfileId:company,
        sourceStoreId:source.id,destinationStoreId:target.id,
        productId:original.productId,quantity:original.quantity,status:"requested",
        requestedByStaffId:actor.id,createdAt:now,submissionKey,
        reversesRequestId:originalRequestId};
      await database.storeTransferRequests.add(request);
      await database.staffAudits.add({id:nanoid(14),businessProfileId:company,staffId:actor.id,
        action:"store.transfer.reversal-requested",createdAt:now,details:originalRequestId});
      return request;
    });
  });
}
