/** Tallybook V19 Run 19 — real-device/UAT acceptance source contract.
 *
 * NEVER claim physical-device acceptance from static capability detection.
 * Each manual PASS requires a device, an observed note and a separate evidence
 * reference. This report is local-only, nonfinancial and does not change
 * business records or release authorization.
 */
export const RUN19_RELEASE_AUTHORIZED=false;
export const RUN19_KIND="tallybook-run19-real-device-evidence";
export const RUN19_FORMAT=1;
const check=(id,area,description,platform,critical=true)=>Object.freeze({
  id,area,description,platform,critical
});
export const RUN19_CASES=Object.freeze([
 check("R19-W01","Windows","8 GB CPU-only Windows 11: launch without requiring a GPU, model download, Node installer or developer terminal.","Windows"),
 check("R19-W02","Windows","2/4 GB Windows constrained memory: opening common pages, preserving entered values and refusal under memory pressure.","Windows"),
 check("R19-W03","Windows","Cold/warm startup and page transitions: measured local timings, responsiveness and focus.","Windows"),
 check("R19-W04","Windows","App installed offline: reload and traverse all core and lazy routes with connectivity disabled.","Windows"),
 check("R19-W05","Windows","Update offered while POS/backup open: no silent reload; exclusive lock and recovery marker are respected.","Windows"),
 check("R19-P01","POS","Disposable sample sale: price, tax, discounts, stock, receipt and idempotent retry inspected against saved evidence.","Both"),
 check("R19-P02","POS","Company-specific refund-disabled and permitted-return samples: policy snapshot and financial correction controls.","Both"),
 check("R19-P03","POS","Customer credit repayment and prepaid wallet: exact allocation and balance reconciliation.","Both"),
 check("R19-P04","POS","Supplier purchase, payable settlement, FIFO and inventory movements: verify source links, no double cost.","Both"),
 check("R19-P05","POS","Multi-store stock, transfer request/dispatch/receipt and store-bound checkout with authorized staff.","Both"),
 check("R19-P06","POS","Customer reservation linked once to existing POS receipt; no mock payment financial posting.","Both"),
 check("R19-H01","Hardware","Keyboard wedge scanner: focused input, supported barcode characters and accidental double-scan handling.","Windows"),
 check("R19-H02","Hardware","Receipt printer: test-only page size, formatting, readable print, no financial receipt created by diagnostic.","Windows"),
 check("R19-H03","Hardware","WebAuthn genuine enrolled owner: registration, unlock, revocation and device-browser compatibility.","Both"),
 check("R19-H04","Hardware","Mobile Money: real operator/device availability and authorization boundary; no live settlement attempted here.","Both"),
 check("R19-O01","Offline","Network unplug/reconnect during local sale: verify persistence and no false cloud/payment confirmation.","Both"),
 check("R19-O02","Offline","Power loss or browser crash during cross-database backup restore: replay recovery using disposable records.","Windows"),
 check("R19-O03","Offline","Disk quota/private profile/evicted storage: no silent deletion; restore and data recovery user guidance.","Both"),
 check("R19-O04","Offline","Two browser tabs write contention, shift revoke, company switch and store assignment race.","Windows"),
 check("R19-B01","Backup","Encrypted export: retrieve file from disk, verify independently with passphrase and compare company/count evidence.","Both"),
 check("R19-B02","Backup","Destructive restore in a disposable profile: older schema, tamper/wrong-company rejection and journal recovery.","Both"),
 check("R19-A01","Access","Full keyboard-only POS, modal focus, screen reader live messages, forced colors and 200% zoom.","Windows"),
 check("R19-A02","Access","Android Chrome: offline install, small viewport, touch targets, restore and company switching.","Android"),
 check("R19-A03","Access","Firefox/Safari/Edge supported profile: explain missing browser features and fail closed where required.","Both"),
 check("R19-S01","Security","Owner vs cashier/supervisor: PIN/authenticator lock, tamper/revocation, tenant isolation and no bypass.","Both"),
 check("R19-S02","Security","No live payments, external cloud transfer, public orders or production exposure without explicit approval.","Both"),
 check("R19-Q01","Acceptance","Device results reconciled against exact source SHA and saved test artifacts by an independent reviewer.","Both"),
 check("R19-Q02","Acceptance","Owner UAT: real attendant task walkthrough, accessibility and documented failures or workarounds.","Both")
]);
export const RUN19_STATUS=Object.freeze(["not-run","pass","fail","blocked","not-applicable"]);
export const RUN19_PLATFORMS=Object.freeze(["Windows","Android","Both"]);
const safeString=(x,min,max)=>typeof x==="string"&&x.length>=min&&x.length<=max&&
 !/[\u0000-\u001f\u007f<>]/.test(x);
const date=x=>typeof x==="string"&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(x)&&
 Number.isFinite(Date.parse(x))&&new Date(x).toISOString()===x;
const ref=x=>safeString(x,5,140)&&/^[A-Za-z0-9_.() \-]+$/.test(x);
const ID=/^[A-Za-z0-9_:-]{8,100}$/;
export function run19DefaultResults(){
 return RUN19_CASES.map(item=>Object.freeze({
  caseId:item.id,status:"not-run",note:"",evidenceFile:"",observedAt:null
 }));
}
export function validateRun19Result(item) {
 if(!item||typeof item!=="object"||Array.isArray(item)||
   Object.keys(item).sort().join(",")!=="caseId,evidenceFile,note,observedAt,status"||
   !RUN19_CASES.some(test=>test.id===item.caseId)||
   !RUN19_STATUS.includes(item.status)||
   typeof item.note!=="string"||item.note.length>600||
   /[\u0000-\u001f\u007f<>]/.test(item.note)||
   typeof item.evidenceFile!=="string"||item.evidenceFile.length>140)
    throw Error("Invalid real-device test evidence row.");
 if(item.status==="not-run") {
   if(item.note!==""||item.evidenceFile!==""||item.observedAt!==null)
     throw Error("Unperformed checks cannot carry observed evidence.");
 }else{
   if(!date(item.observedAt)||!safeString(item.note.trim(),20,600))
     throw Error("Observed checks require timestamp and a specific factual note (20+ characters).");
   if(item.status==="pass"&&!ref(item.evidenceFile))
     throw Error("A PASS needs a separately retained evidence file reference; narrative alone is insufficient.");
   if(item.evidenceFile!==""&&!ref(item.evidenceFile))
     throw Error("Evidence filenames must be local filenames, not URLs or private paths.");
   if(item.status==="not-applicable"&&RUN19_CASES.find(row=>row.id===item.caseId)?.critical)
     throw Error("Critical real-device checks cannot be waived as not applicable.");
 }
 return Object.freeze({...item});
}
export function run19Summary(rows){
 if(!Array.isArray(rows)||rows.length!==RUN19_CASES.length)
  throw Error("The complete Run 19 acceptance matrix must remain intact.");
 const seen=new Set();
 const counts=Object.fromEntries(RUN19_STATUS.map(status=>[status,0]));
 let criticalUnverified=0;
 for(const item of rows) {
  validateRun19Result(item);
  if(seen.has(item.caseId))throw Error("Duplicate device acceptance case.");
  seen.add(item.caseId);counts[item.status]++;
  if(item.status!=="pass"&&RUN19_CASES.find(x=>x.id===item.caseId).critical)criticalUnverified++;
 }
 if(RUN19_CASES.some(x=>!seen.has(x.id)))throw Error("A mandatory acceptance case is absent.");
 return Object.freeze({counts:Object.freeze(counts),criticalUnverified,
   developerMayDeclareAccepted:false,ownerAcceptanceRecorded:false,
   productionAuthorized:false,releaseDecision:"NO-GO",
   note:"Evidence capture does not constitute independent signoff or commercial authorization."});
}
export function createRun19EvidencePayload(input) {
 if(!input||typeof input!=="object"||
    !/^[0-9a-f]{40}$/i.test(input.sourceSha??"")||
    !safeString(input.deviceClass??"",5,100)||
    !safeString(input.browser??"",2,100)||
    !safeString(input.os??"",3,100)||
    !safeString(input.operatorLabel??"",3,100)||
    !date(input.createdAt)||input.sampleDataOnly!==true||
    input.noLivePayments!==true||input.noExternalDeployment!==true||
    !Array.isArray(input.results))
   throw Error("Run 19 requires exact Git SHA, labelled disposable device and protected test scope.");
 const results=input.results.map(validateRun19Result);
 const summary=run19Summary(results);
 return Object.freeze({
  kind:RUN19_KIND,formatVersion:RUN19_FORMAT,sourceSha:input.sourceSha.toLowerCase(),
  createdAt:input.createdAt,deviceClass:input.deviceClass,browser:input.browser,
  os:input.os,operatorLabel:input.operatorLabel,sampleDataOnly:true,
  noLivePayments:true,noExternalDeployment:true,
  results,summary
 });
}
export function verifyRun19EvidencePayload(value){
 if(!value||typeof value!=="object"||Array.isArray(value)||
   Object.keys(value).sort().join(",")!==
   "browser,createdAt,deviceClass,formatVersion,kind,noExternalDeployment,noLivePayments,operatorLabel,os,results,sampleDataOnly,sourceSha,summary"||
   value.kind!==RUN19_KIND||value.formatVersion!==RUN19_FORMAT)
   throw Error("Unsupported device acceptance evidence format.");
 const canonical=createRun19EvidencePayload(value);
 if(JSON.stringify(canonical)!==JSON.stringify(value))
   throw Error("Acceptance counts, source context or release decision were tampered with.");
 return canonical;
}
