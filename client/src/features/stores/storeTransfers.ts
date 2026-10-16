import { withCoordinatedRetailWrite } from "@/features/backup/coordinatedRetailWrite";
/** Stage 9 transfer requests. These are proposals, NEVER stock or accounting postings. */
import { nanoid } from "nanoid";
import { db, type TallybookDB } from "@/db/TallybookDB";
import { getActiveBusinessProfileId } from "@/features/business/activeCompany";
import { requirePermission, currentStaffId } from "@/features/staff/staff";
import { assertRun7RetailWriteReady } from "@/features/backup/run7RetailWriteBarrier.mjs";
import { postPairedStoreTransfer } from "./storeStockLedger";
import { requireStage9Capability } from "./stage9ReleaseScope";

export interface StoreTransferRequest {
  id: string; businessProfileId: string; sourceStoreId: string; destinationStoreId: string;
  productId: string; quantity: number; status: "requested" | "cancelled" | "completed"; completedAt?: string; completionKey?: string; transferId?: string;
  requestedByStaffId: string; createdAt: string; cancelledAt?: string;
}
export function validateTransferRequest(source: string, destination: string, product: string, quantity: number) {
  if (!source || !destination || source === destination) throw new Error("Select two different stores.");
  if (!product || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 9_999_999) throw new Error("Transfer quantity must be a positive whole number.");
}
export async function requestStoreTransfer(sourceStoreId: string, destinationStoreId: string, productId: string, quantity: number, database: TallybookDB = db) {
  return withCoordinatedRetailWrite(async () => {
    validateTransferRequest(sourceStoreId, destinationStoreId, productId, quantity);
    const company = getActiveBusinessProfileId();
    return database.transaction("rw", [database.appMeta, database.storeTransferRequests, database.storeLocations, database.storeAssignments, database.products, database.staffMembers, database.staffAudits], async () => {
      await assertRun7RetailWriteReady(database.appMeta);
      const member = await requirePermission("staff", database, company);
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
      const entry: StoreTransferRequest = { id: nanoid(), businessProfileId: company, sourceStoreId, destinationStoreId, productId, quantity, status: "requested", requestedByStaffId: staffId, createdAt: new Date().toISOString() };
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
      if(request.status!=="requested") throw new Error("Cancelled request cannot be executed.");
      if(staff.role!=="owner"){
        for(const storeId of [request.sourceStoreId,request.destinationStoreId]) {
          const assignment=await database.storeAssignments.where("[businessProfileId+staffId+storeId]")
            .equals([company,staff.id,storeId]).first();
          if(!assignment) throw new Error("Staff not assigned to both transfer stores.");
        }
      }
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
