/** Tallybook V19 Run 20 — fail-closed release decision policy.
 * An operator worksheet and hash-verified QA files are NOT attestations.
 * Only a later separately approved release process can make a GO decision.
 * This module never calls the network, writes ledgers or deploys.
 */
export const RUN20_EXTERNAL_STAGING_APPROVED=false;
export const RUN20_PRODUCTION_AUTHORIZED=false;
export const RUN20_REAL_PAYMENTS_AUTHORIZED=false;
export const RUN20_PUBLIC_COMMERCE_AUTHORIZED=false;
export const RUN20_CLOUD_FINANCIAL_SYNC_AUTHORIZED=false;
export const RUN20_AUTOMATIC_PROMOTION_ENABLED=false;
export const RUN20_DECISION_KIND="tallybook-v19-run20-release-readiness";
export const RUN20_DECISION_FORMAT=1;
const gate=(id,domain,description)=>Object.freeze({id,domain,description,mandatory:true});
export const RUN20_GATES=Object.freeze([
 gate("OPS-01","Source","Exact release source commit SHA, immutable reviewed source tree and owner-approved scope"),
 gate("OPS-02","Quality","Pinned Node/pnpm, entire native suites, client Vitest and semantic TypeScript checks on exact SHA"),
 gate("OPS-03","Quality","Production client/server build and browser regression, offline and recoverability evidence"),
 gate("OPS-04","Finance","Broad FIN-002 historical/currency/tax, prepaid, customer receivables and per-sale reconciliation"),
 gate("OPS-05","Finance","Supplier payables and settlements, FIFO/COGS, tax snapshots and no-refund company boundaries"),
 gate("OPS-06","Data","Cross-database crash/restore/recovery, tampered backups and real IndexedDB multi-tab integrity"),
 gate("OPS-07","Security","Owner/tenant membership and authorization, roles, secrets, RLS, revocation and security review"),
 gate("OPS-08","Store","Real multi-store ledger, transfers and per-store attendant/POS scoped reconciliation"),
 gate("OPS-09","Cloud","Trusted server authorization, durable tenant isolation, remote sync and offline replay"),
 gate("OPS-10","Commerce","Customer storefront tenancy, abuse/rate limits, reservations, pickup/delivery and refunds"),
 gate("OPS-11","Payments","Approved live provider contract, actual callback signatures, settlement/reversal and merchant reconciliation"),
 gate("OPS-12","Hardware","Real 8 GB CPU Windows, Android, scanner, printer, WebAuthn and Mobile Money device acceptance"),
 gate("OPS-13","Accessibility","Owner-operated accessibility and supported browser/OS matrix signoff"),
 gate("OPS-14","Backups","Encrypted off-device custody, independent restore rehearsal, data integrity and retained rollback materials"),
 gate("OPS-15","Staging","Explicit isolated staging approval, access/TLS/hosting rules, synthetic data and monitoring"),
 gate("OPS-16","Operations","On-call personnel, release freeze, incident handling, restore owner, secrets and rollback rehearsal"),
 gate("OPS-17","Traceability","All 82 acceptance units and 47 blocker statuses reconciled with exact release evidence"),
 gate("OPS-18","UAT","Owner and independent security/finance/device reviewer signatures and Run 19 physical artifacts"),
 gate("OPS-19","Legal","Privacy, customer-data retention, refund policy and provider/licensing approvals"),
 gate("OPS-20","Decision","Separate express owner approval for the specific staging/production, cloud and payment actions")
]);
export const RUN20_GATE_STATUSES=Object.freeze(["not-run","pass","fail","blocked"]);
const validSha=s=>typeof s==="string"&&/^[a-f0-9]{40}$/i.test(s);
const validDate=s=>typeof s==="string"&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(s)&&
 Number.isFinite(Date.parse(s))&&new Date(s).toISOString()===s;
const safeText=(s,max)=>typeof s==="string"&&s.length<=max&&!/[\u0000-\u001f<>]/.test(s);
const artifact=s=>safeText(s,160)&&/^[A-Za-z0-9_(). \-]{5,160}$/.test(s);
export function defaultRun20Evidence(){
 return RUN20_GATES.map(item=>Object.freeze({gateId:item.id,status:"not-run",sourceSha:"",
  observedAt:null,evidenceFile:"",reviewerRole:"",note:""}));
}
export function validateRun20Evidence(value,sourceSha){
 if(!validSha(sourceSha)||!value||typeof value!=="object"||Array.isArray(value)||
   Object.keys(value).sort().join(",")!=="evidenceFile,gateId,note,observedAt,reviewerRole,sourceSha,status"||
   !RUN20_GATES.some(item=>item.id===value.gateId)||
   !RUN20_GATE_STATUSES.includes(value.status)||
   !safeText(value.note,800)||!safeText(value.reviewerRole,80)||
   !safeText(value.evidenceFile,160))
    throw Error("Invalid Run 20 gate evidence.");
 if(value.status==="not-run") {
   if(value.observedAt!==null||value.evidenceFile||value.note||value.reviewerRole||value.sourceSha)
     throw Error("Unperformed release checks cannot contain fabricated observations.");
 }else{
   if(!validDate(value.observedAt)||!safeText(value.note.trim(),800)||
      value.note.trim().length<20||value.sourceSha!==sourceSha||
      !/^(owner|finance-reviewer|security-reviewer|device-reviewer|operations-reviewer)$/.test(value.reviewerRole))
     throw Error("Observed release status requires exact source, factual note, timestamp and reviewer role.");
   if(value.status==="pass"&&!artifact(value.evidenceFile))
     throw Error("A claimed PASS must reference a separately retained local evidence artifact.");
   if(value.evidenceFile&&!artifact(value.evidenceFile))
     throw Error("Evidence references must be filenames only, never URLs or private paths.");
 }
 return Object.freeze({...value});
}
export function evaluateRun20Release(input){
 if(!input||typeof input!=="object"||!validSha(input.sourceSha)||
   !validDate(input.asOf)||!Array.isArray(input.evidence)||
   input.evidence.length!==RUN20_GATES.length)
   throw Error("Release decision requires complete exact-SHA evidence and real evaluation timestamp.");
 const seen=new Set();const pending=[];const failed=[];const manualPass=[];
 for(const row of input.evidence){
   const item=validateRun20Evidence(row,input.sourceSha);
   if(seen.has(item.gateId))throw Error("Repeated release gate evidence.");
   seen.add(item.gateId);
   if(item.observedAt&&Date.parse(item.observedAt)>Date.parse(input.asOf))
     throw Error("Release evidence date cannot be later than the decision.");
   if(item.status!=="pass")pending.push(item.gateId);
   if(item.status==="fail")failed.push(item.gateId);
   if(item.status==="pass")manualPass.push(item.gateId);
 }
 if(RUN20_GATES.some(g=>!seen.has(g.id)))throw Error("Mandatory release gate was omitted.");
 const policyLocks=Object.freeze({
  staging:!RUN20_EXTERNAL_STAGING_APPROVED,
  production:!RUN20_PRODUCTION_AUTHORIZED,
  realPayments:!RUN20_REAL_PAYMENTS_AUTHORIZED,
  publicCommerce:!RUN20_PUBLIC_COMMERCE_AUTHORIZED,
  cloudFinancialSync:!RUN20_CLOUD_FINANCIAL_SYNC_AUTHORIZED,
  automaticPromotion:!RUN20_AUTOMATIC_PROMOTION_ENABLED
 });
 return Object.freeze({
  kind:RUN20_DECISION_KIND,formatVersion:RUN20_DECISION_FORMAT,
  sourceSha:input.sourceSha.toLowerCase(),asOf:input.asOf,
  pending:Object.freeze(pending),failed:Object.freeze(failed),
  claimsOfManualPass:Object.freeze(manualPass),
  gateCount:RUN20_GATES.length,verifiedByIndependentReview:false,
  acceptedByOwner:false,allAcceptanceUnitsVerified:false,
  externalDeploymentPermitted:false,paymentsPermitted:false,
  policyLocks,decision:"NO-GO",
  reason:"This source-only worksheet cannot supply independent, exact-SHA, owner-approved release authority."
 });
}
export function assertRun20ExternalActionAllowed(action){
 const operations=["staging-deploy","production-deploy","enable-payments","public-storefront",
   "cloud-ledger-sync","promote-release","merge-to-main"];
 if(!operations.includes(action))throw Error("Unknown protected release action.");
 throw Error("Tallybook V19 "+action+" is not authorized by the Run 20 source-only increment.");
}
