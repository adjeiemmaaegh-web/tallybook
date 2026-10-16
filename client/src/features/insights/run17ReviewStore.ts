/** Run 17 — owner/supervisor acknowledgement of exactly observed evidence.
 * Audit rows are not commands and cannot change financial, store or customer
 * records. No network, LLM or automatic messages are involved.
 */
import {nanoid} from "nanoid";
import {db,type TallybookDB} from "@/db/TallybookDB";
import {getActiveBusinessProfileId} from "@/features/business/activeCompany";
import {requirePermission,currentStaffId} from "@/features/staff/staff";
import {withCoordinatedRetailWrite} from "@/features/backup/coordinatedRetailWrite";
import {assertRun7RetailWriteReady} from "@/features/backup/run7RetailWriteBarrier.mjs";
import {getRun17Evidence,type Run17Period} from "./run17Service";
import {reconcileRun17Reviews,validateRun17ReviewEvent,
 type Run17ReviewEvent,type Run17ReviewState} from "./run17ReviewAudit.mjs";
export const RUN17_AUTOMATIC_ACTIONS_ENABLED=false as const;
export const RUN17_REVIEW_WRITES_ENABLED=false as const;
const KEY=/^[A-Za-z0-9:_-]{8,100}$/;
function scope(company:string) {
 if(!company||company!==getActiveBusinessProfileId())throw Error("Company changed during insight review.");
}
async function requireReviewer(database:TallybookDB,company:string) {
 const member=await requirePermission("reports",database,company);
 const id=currentStaffId(company);
 if(!member||!id||member.id!==id||!["owner","supervisor"].includes(member.role))
   throw Error("Unlock an owner or reports-authorized supervisor to review advisory evidence.");
 return member;
}
export async function getRun17ReviewStates(database:TallybookDB=db):Promise<ReadonlyArray<Readonly<Run17ReviewState>>> {
 const company=getActiveBusinessProfileId();scope(company);
 return database.transaction("r",[
   database.appMeta,database.businessProfiles,database.staffMembers,database.run17ReviewEvents
 ],async()=>{
   await assertRun7RetailWriteReady(database.appMeta);
   await requirePermission("reports",database,company);
   const events=await database.run17ReviewEvents.where("businessProfileId").equals(company).toArray();
   const states=reconcileRun17Reviews(events,company);
   scope(company);
   await requirePermission("reports",database,company);
   return states;
 });
}
/** This intentionally requires a live matching finding. A past acknowledgement
 * never hides a new version of the evidence if inputs changed.
 */
export async function recordRun17Review(input:{
 findingId:string;period:Run17Period;action:"acknowledge"|"reopen";
 note:string;submissionKey:string
},database:TallybookDB=db):Promise<Run17ReviewEvent> {
 if(!RUN17_REVIEW_WRITES_ENABLED)throw Error("Run 17 insight reviews remain disabled until owner QA acceptance.");
 if(!KEY.test(input.submissionKey)||typeof input.note!=="string"||
    input.note.trim().length<8||input.note.length>500||
    /[\u0000-\u001f]/.test(input.note))
   throw Error("Review requires a unique request key and factual note (8–500 characters).");
 const company=getActiveBusinessProfileId();scope(company);
 const report=await getRun17Evidence(input.period,new Date(),database);
 const finding=report.findings.find(item=>item.id===input.findingId);
 if(!finding||finding.evidenceKey.length>4000)
   throw Error("Insight changed or no longer has grounded supporting evidence.");
 return withCoordinatedRetailWrite(()=>database.transaction("rw",[
   database.appMeta,database.staffMembers,database.staffAudits,
   database.run17ReviewEvents
 ],async()=>{
   await assertRun7RetailWriteReady(database.appMeta);
   const member=await requireReviewer(database,company);
   const existing=await database.run17ReviewEvents.where("[businessProfileId+submissionKey]")
     .equals([company,input.submissionKey]).first();
   if(existing){
     if(existing.findingId!==input.findingId||existing.period!==input.period||
        existing.action!==input.action||existing.evidenceKey!==finding.evidenceKey||
        existing.note!==input.note.trim())
       throw Error("Review key already belongs to a different decision or evidence snapshot.");
     return existing;
   }
   const events=await database.run17ReviewEvents.where("[businessProfileId+findingId]")
     .equals([company,finding.id]).toArray();
   const state=reconcileRun17Reviews(events,company).find(x=>x.findingId===finding.id);
   if(input.action==="reopen"&&state?.status!=="acknowledged")
     throw Error("Only an acknowledged advisory may be reopened.");
   if(input.action==="acknowledge"&&state?.status==="acknowledged"&&
      state.evidenceKey===finding.evidenceKey)
     throw Error("This exact evidence is already acknowledged; refresh or reopen first.");
   if(events.length>=10000)throw Error("Review history reached supported length.");
   const now=new Date().toISOString();
   const review:Run17ReviewEvent={
     id:nanoid(18),businessProfileId:company,findingId:finding.id,
     staffId:member.id,submissionKey:input.submissionKey,
     sequence:events.length+1,period:input.period,asOf:report.asOf,
     createdAt:now,action:input.action,note:input.note.trim(),
     evidenceKey:finding.evidenceKey,financialPostingPerformed:false
   };
   validateRun17ReviewEvent(review);
   scope(company);
   if(currentStaffId(company)!==member.id)throw Error("Review staff session changed.");
   await database.run17ReviewEvents.add(review);
   await database.staffAudits.add({
     id:nanoid(18),businessProfileId:company,staffId:member.id,
     action:"insights.run17."+input.action,createdAt:now,details:review.id
   });
   return review;
 }));
}
