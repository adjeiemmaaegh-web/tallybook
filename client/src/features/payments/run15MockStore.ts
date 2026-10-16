/** Run 15: MOCK-ONLY, persistent local sandbox lifecycle.
 * No external HTTP, no provider identifier or live settlement.
 * Records never alter sales, payments, receivables, supplier payable or cash.
 */
import {nanoid} from "nanoid";
import {db,type TallybookDB} from "@/db/TallybookDB";
import {getActiveBusinessProfileId} from "@/features/business/activeCompany";
import {currentStaffId,requirePermission} from "@/features/staff/staff";
import {withCoordinatedRetailWrite} from "@/features/backup/coordinatedRetailWrite";
import {assertRun7RetailWriteReady} from "@/features/backup/run7RetailWriteBarrier.mjs";
import {validateRun15MockIntent,validateRun15MockEvent,applyRun15MockEvent,
  auditRun15MockTimeline,type Run15MockIntent,type Run15MockEvent} from "./run15MockContract.mjs";
const ID=/^[A-Za-z0-9:_-]{8,100}$/;
function scope(company:string){
  if(!company||company!==getActiveBusinessProfileId())throw Error("Sandbox company context changed.");
}
async function owner(database:TallybookDB,company:string){
  const staff=await requirePermission("staff",database,company);
  if(!staff||staff.role!=="owner"||currentStaffId(company)!==staff.id)
    throw Error("Unlocked company owner required for simulated payment changes.");
  return staff;
}
export async function createRun15MockIntent(input:{
  companyId:string;submissionKey:string;amountMinor:number;
  currency:string;method:"card"|"mobile";
},database:TallybookDB=db):Promise<Run15MockIntent>{
  scope(input.companyId);
  if(!ID.test(input.submissionKey))throw Error("Invalid payment sandbox submission key.");
  return withCoordinatedRetailWrite(async()=>database.transaction("rw",[
    database.appMeta,database.businessProfiles,database.staffMembers,
    database.staffAudits,database.paymentSandboxIntents
  ],async()=>{
    await assertRun7RetailWriteReady(database.appMeta);
    const staff=await owner(database,input.companyId);
    if(!await database.businessProfiles.get(input.companyId))throw Error("Company profile missing.");
    const existing=await database.paymentSandboxIntents.where("[businessProfileId+submissionKey]")
      .equals([input.companyId,input.submissionKey]).first();
    if(existing){
      if(existing.amountMinor!==input.amountMinor||existing.currency!==input.currency||
         existing.method!==input.method)throw Error("Mock intent key reused for different payment terms.");
      return existing;
    }
    const now=new Date().toISOString();
    const candidate:Run15MockIntent={id:nanoid(18),businessProfileId:input.companyId,
      submissionKey:input.submissionKey,amountMinor:input.amountMinor,
      currency:input.currency,method:input.method,createdAt:now,status:"pending",
      refundedMinor:0,mockOnly:true,provider:"mock-only",
      financialPostingPerformed:false,authoritativeSettlement:false};
    validateRun15MockIntent(candidate);
    scope(input.companyId);
    await database.paymentSandboxIntents.add(candidate);
    await database.staffAudits.add({id:nanoid(18),businessProfileId:input.companyId,
      staffId:staff.id,action:"payments.mock-intent-created",
      createdAt:now,details:candidate.id});
    return candidate;
  }));
}
export async function applyRun15MockAction(input:{
  companyId:string;intentId:string;eventId:string;
  action:Run15MockEvent["action"];amountMinor?:number
},database:TallybookDB=db):Promise<Run15MockIntent>{
  scope(input.companyId);
  if(!ID.test(input.intentId)||!ID.test(input.eventId))throw Error("Invalid mock action identity.");
  return withCoordinatedRetailWrite(async()=>database.transaction("rw",[
    database.appMeta,database.businessProfiles,database.staffMembers,
    database.staffAudits,database.paymentSandboxIntents,database.paymentSandboxEvents
  ],async()=>{
    await assertRun7RetailWriteReady(database.appMeta);
    const staff=await owner(database,input.companyId);
    const intent=await database.paymentSandboxIntents.get(input.intentId);
    if(!intent||intent.businessProfileId!==input.companyId)
      throw Error("Mock intent does not belong to current company.");
    const existing=await database.paymentSandboxEvents.get(input.eventId);
    const event:Run15MockEvent={
      id:input.eventId,intentId:input.intentId,businessProfileId:input.companyId,
      action:input.action,amountMinor:input.action==="refund"?(input.amountMinor??0):0,
      createdAt:existing?.createdAt??new Date().toISOString(),mockOnly:true,
      financialPostingPerformed:false,authoritativeSettlement:false
    };
    validateRun15MockEvent(event);
    if(existing){
      if(JSON.stringify(existing)!==JSON.stringify(event))
        throw Error("Mock webhook event ID already committed with different intent.");
      return intent; // Exact duplicate: no mutation, no retail ledger posting.
    }
    const events=await database.paymentSandboxEvents
      .where("[businessProfileId+intentId]")
      .equals([input.companyId,input.intentId]).sortBy("createdAt");
    if(events.some(e=>e.id===event.id))
      throw Error("Stored mock event identity duplicated.");
    const source=await database.paymentSandboxIntents.get(input.intentId);
    if(!source)throw Error("Mock payment disappeared.");
    // Audit all prior steps independently before appending another event.
    const original:Run15MockIntent={...source,status:"pending",refundedMinor:0};
    const historical=auditRun15MockTimeline(original,events);
    if(historical.intent.status!==source.status ||
      historical.intent.refundedMinor!==source.refundedMinor)
      throw Error("Stored mock payment state diverges from immutable event history.");
    const result=applyRun15MockEvent(source,event,events);
    if(result.replayed)throw Error("Unexpected duplicate mock action replay.");
    scope(input.companyId);
    await database.paymentSandboxEvents.add(event);
    await database.paymentSandboxIntents.put(result.intent);
    await database.staffAudits.add({id:nanoid(18),businessProfileId:input.companyId,
      staffId:staff.id,action:"payments.mock-"+event.action,
      createdAt:event.createdAt,details:event.id});
    return result.intent;
  }));
}
export async function inspectRun15MockSandbox(database:TallybookDB=db):Promise<{
  intents:Run15MockIntent[];events:Run15MockEvent[];
  authoritativeSettlement:false;financialPostingPerformed:false
}>{
  const company=getActiveBusinessProfileId();
  return database.transaction("r",[
    database.businessProfiles,database.staffMembers,
    database.paymentSandboxIntents,database.paymentSandboxEvents
  ],async()=>{
    await requirePermission("reports",database,company);
    const [intents,events]=await Promise.all([
      database.paymentSandboxIntents.where("businessProfileId").equals(company).toArray(),
      database.paymentSandboxEvents.where("businessProfileId").equals(company).toArray(),
    ]);
    const ids=new Set(intents.map(i=>i.id)),eventIDs=new Set();
    if(ids.size!==intents.length)throw Error("Duplicate mock intent records.");
    for(const event of events){
      validateRun15MockEvent(event);
      if(!ids.has(event.intentId)||eventIDs.has(event.id))
        throw Error("Orphaned or duplicate mock event.");
      eventIDs.add(event.id);
    }
    for(const intent of intents){
      const historical=auditRun15MockTimeline({...intent,status:"pending",refundedMinor:0},
        events.filter(e=>e.intentId===intent.id).sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id)));
      if(intent.status!==historical.intent.status||
        intent.refundedMinor!==historical.intent.refundedMinor)
        throw Error("Mock sandbox event ledger requires reconciliation.");
    }
    scope(company);
    return {intents,events,authoritativeSettlement:false,financialPostingPerformed:false};
  });
}
