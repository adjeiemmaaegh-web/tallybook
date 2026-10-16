/** Run 13: audited read-only store assignment and stock-scope decision.
 * Never authorizes a write by itself. Final authority belongs inside the
 * atomic financial posting transaction, not the UI or a stale preview.
 */
export function reviewStoreAttendantScope({
 companyId, storeId, actorId, staff, stores, assignments, action
}) {
 const fail = message => { throw new Error(message); };
 const id = v => typeof v==="string" && v.length>0 && v.length<=200;
 if (![companyId,storeId,actorId].every(id) ||
     !Array.isArray(staff)||!Array.isArray(stores)||!Array.isArray(assignments) ||
     !["sell","receive","inventory","transfer","refund"].includes(action))
   fail("Store-attendant review requires valid context.");
 const actor = staff.find(x=>x.id===actorId);
 const store = stores.find(x=>x.id===storeId);
 if (!actor || actor.businessProfileId!==companyId || actor.disabledAt ||
     !store || store.businessProfileId!==companyId || store.status!=="active")
   fail("Store or attendant not active in company.");
 const permitted = action==="sell" ? ["owner","supervisor","cashier"] :
   action==="refund" ? ["owner","supervisor"] : ["owner","supervisor"];
 if (!permitted.includes(actor.role)) fail("Role not authorized for store action.");
 const permission = action==="receive" || action==="transfer" ? "inventory" : action;
 if (actor.permissions && (!Array.isArray(actor.permissions) || !actor.permissions.includes(permission)))
   fail("Store action permission revoked.");
 const assignmentKeys = new Set();
 for (const a of assignments) {
   if (a.businessProfileId!==companyId) continue;
   const k=JSON.stringify([a.staffId,a.storeId]);
   if (assignmentKeys.has(k)) fail("Duplicate store assignment evidence.");
   assignmentKeys.add(k);
 }
 const assigned=assignmentKeys.has(JSON.stringify([actorId,storeId]));
 if (actor.role!=="owner" && !assigned) fail("Staff not assigned to this store.");
 return Object.freeze({
   companyId,storeId,actorId,action,assigned:assigned||actor.role==="owner",
   readOnlyDecision:true,postingAuthorized:false
 });
}
