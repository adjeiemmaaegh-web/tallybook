/** Run 17 — append-only, device-local advisory REVIEW journal.
 * This is not a financial event and never suppresses current evidence.
 * Fingerprints identify the observed input snapshot, not tamperproof receipts.
 */
const deny=message=>{throw Error("Run 17 review journal: "+message);};
const ID=/^[A-Za-z0-9:_-]{1,128}$/;
const date=x=>typeof x==="string"&&Number.isFinite(Date.parse(x))&&new Date(x).toISOString()===x;
const validNote=x=>typeof x==="string"&&x.trim().length>=8&&x.length<=500&&
 !/[\u0000-\u001f]/.test(x);
export function validateRun17ReviewEvent(event){
 if(!event||typeof event!=="object"||Array.isArray(event)||
   Object.keys(event).sort().join(",")!==
   "action,asOf,businessProfileId,createdAt,evidenceKey,financialPostingPerformed,findingId,id,note,period,sequence,staffId,submissionKey"||
   !ID.test(event.id??"")||!ID.test(event.businessProfileId??"")||
   !ID.test(event.staffId??"")||!ID.test(event.submissionKey??"")||
   typeof event.findingId!=="string"||event.findingId.length<3||
   event.findingId.length>200||!/^[-:A-Za-z0-9_]+$/.test(event.findingId)||
   !["acknowledge","reopen"].includes(event.action)||
   !["today","last7","all"].includes(event.period)||
   !date(event.createdAt)||!date(event.asOf)||
   Date.parse(event.createdAt)<Date.parse(event.asOf)||
   !Number.isSafeInteger(event.sequence)||event.sequence<1||event.sequence>10000||
   typeof event.evidenceKey!=="string"||event.evidenceKey.length<6||
   event.evidenceKey.length>4000||!validNote(event.note)||
   event.financialPostingPerformed!==false)
   deny("invalid staff-reviewed advisory record");
 return Object.freeze({...event});
}
export function reconcileRun17Reviews(events,companyId){
 if(!ID.test(companyId??"")||!Array.isArray(events)||events.length>50000)
   deny("invalid company review ledger");
 const seenIds=new Set(),seenSubmissions=new Set(),byFinding=new Map();
 for(const event of events){
   validateRun17ReviewEvent(event);
   if(event.businessProfileId!==companyId||seenIds.has(event.id)||
      seenSubmissions.has(event.submissionKey))
     deny("cross-company or duplicate review event");
   seenIds.add(event.id);seenSubmissions.add(event.submissionKey);
   const row=byFinding.get(event.findingId)??[];
   row.push(event);byFinding.set(event.findingId,row);
 }
 const states=[];
 for(const [findingId,rows] of byFinding){
   rows.sort((a,b)=>a.sequence-b.sequence);
   let current="unreviewed",evidenceKey="";
   for(let i=0;i<rows.length;i++){
     const row=rows[i];
     if(row.sequence!==i+1)deny("missing or reordered finding review sequence");
     if(row.action==="reopen"){
       if(current!=="acknowledged")deny("cannot reopen an unreviewed finding");
       current="unreviewed";
     }else{
       if(current==="acknowledged"&&row.evidenceKey===evidenceKey)
         deny("same advisory evidence acknowledged twice");
       current="acknowledged";
     }
     evidenceKey=row.evidenceKey;
   }
   const last=rows.at(-1);
   states.push(Object.freeze({findingId,status:current,evidenceKey,
     lastReviewedAt:last.createdAt,lastStaffId:last.staffId,eventCount:rows.length}));
 }
 return Object.freeze(states.sort((a,b)=>a.findingId.localeCompare(b.findingId)));
}
