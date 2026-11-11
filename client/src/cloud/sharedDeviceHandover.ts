/** Explicit one-person-at-a-time handover. Pending sales stay under their original cashier's identity. */
import {confirmAction} from "@/lib/confirmAction";
import {outboxCompanyIdsForUser} from "./secureStorage";
import {readOutbox, type QueuedSale} from "./shopOutbox";

export interface HandoverSummary { checkedBusinesses:number; unconfirmed:number; needsReview:number }
export function summarizeHandoverQueues(queues: readonly (readonly Pick<QueuedSale,"status">[])[]):HandoverSummary {
  const all=queues.flat();
  return {
    checkedBusinesses:queues.length,
    unconfirmed:all.filter(row=>row.status==="queued"||row.status==="sending").length,
    needsReview:all.filter(row=>row.status==="rejected"||row.status==="needs-review").length,
  };
}
export async function inspectSharedDeviceHandover(userId:string):Promise<HandoverSummary> {
  if(!userId||userId.includes(":")||userId.includes("\u0000")) throw Error("The active user could not be identified.");
  const companies=await outboxCompanyIdsForUser(userId);
  const queues=await Promise.all(companies.map(companyId=>readOutbox({userId,companyId})));
  return summarizeHandoverQueues(queues);
}
export async function confirmSharedDeviceHandover(userId:string):Promise<boolean> {
  try {
    const result=await inspectSharedDeviceHandover(userId);
    if(!result.unconfirmed&&!result.needsReview)return true;
    const prefix=result.unconfirmed?String(result.unconfirmed)+" sale(s) are not yet confirmed by the server. ":"";
    const review=result.needsReview?String(result.needsReview)+" saved sale(s) need review. ":"";
    return confirmAction(prefix+review+
      "These records stay on this device under this employee's account. The next employee cannot send them. Return with the original account to sync or review them. Do not clear this browser's data. Switch accounts anyway?",
      {danger:true,confirmLabel:"Switch accounts"});
  } catch {
    // Storage/key failures must NEVER be treated as an empty queue.
    return confirmAction(
      "Tallybook could not inspect this employee's saved sales on this device. Nothing is being erased, but the original employee may need to return and resolve pending sales. Do not clear browser data. Switch accounts anyway?",
      {danger:true,confirmLabel:"Switch anyway"});
  }
}
