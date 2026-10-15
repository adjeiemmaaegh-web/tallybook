/** V19 Run 5: immutable authorization policy for CLOUD tenant service calls.
 * Offline Tallybook IndexedDB remains under its separate local staff policy.
 * Never trust a selected local-company ID, role, or a caller-supplied user ID.
 */
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const kinds=Object.freeze({
  catalog:Object.freeze(['read','write']),
  inventory:Object.freeze(['read']),
  orders:Object.freeze(['read']),
  customers:Object.freeze(['read']),
  sales:Object.freeze(['read']),
  payments:Object.freeze(['read']),
  suppliers:Object.freeze(['read']),
  purchases:Object.freeze(['read']),
  expenses:Object.freeze(['read']),
  receivables:Object.freeze(['read']),
  wallet:Object.freeze(['read']),
  staff:Object.freeze(['read']),
  stores:Object.freeze(['read']),
  assistant:Object.freeze(['read','write']),
  audit:Object.freeze(['read'])
});
const actions=Object.freeze(['read','write','report','export','import','backup','assistant','sync']);
const deny=()=>{throw Error('Tenant access denied');};
export const RUN5_TENANT_DOMAINS=Object.freeze(Object.keys(kinds));
export function validateRun5Request({companyId,domain,action,recordId=null}={}){
  if(typeof companyId!=='string'||!uuid.test(companyId)||
     typeof domain!=='string'||!Object.hasOwn(kinds,domain)||
     typeof action!=='string'||!actions.includes(action)||
     (recordId!==null&&(typeof recordId!=='string'||!uuid.test(recordId))))deny();
  return Object.freeze({companyId,domain,action,recordId});
}
export function requireRun5Access({principal,company,membership,request,now=Date.now()}){
  const r=validateRun5Request(request);
  if(!Number.isSafeInteger(now)||now<=0||
     !principal||typeof principal.userId!=='string'||!uuid.test(principal.userId)||
     typeof principal.sessionId!=='string'||!uuid.test(principal.sessionId)||
     principal.active!==true||!Number.isSafeInteger(principal.expiresAtEpochMs)||
     now>=principal.expiresAtEpochMs||
     company?.id!==r.companyId||typeof company?.ownerId!=='string'||
     !uuid.test(company.ownerId)||
     membership?.userId!==principal.userId||membership?.companyId!==r.companyId||
     membership?.status!=='active'||
     !['owner','attendant'].includes(membership.role))deny();
  if(membership.role==='owner'){
    if(company.ownerId!==principal.userId)deny();
  }else if(company.ownerId===principal.userId)deny();
  if(r.action==='read'){
    if(membership.role==='attendant'&&
       !['catalog','inventory','orders'].includes(r.domain))deny();
  }else if(r.action==='write'){
    // NO generic financial ledger mutation, even for an owner. Future runs
    // add immutable sale/inventory/payable writers with their own invariants.
    if(membership.role!=='owner'||!kinds[r.domain].includes('write'))deny();
  }else if(membership.role!=='owner')deny();
  // These sensitive features have dedicated, explicit owner opt-in gates.
  // Authorization permits the trusted caller to evaluate those gates; it
  // does NOT itself enable imports, backup replication, or cloud sync.
  return Object.freeze({companyId:r.companyId,userId:principal.userId,
    sessionId:principal.sessionId,role:membership.role,
    action:r.action,domain:r.domain,recordId:r.recordId,
    expiresAtEpochMs:principal.expiresAtEpochMs});
}
export function assertRun5ScopedRows(rows,companyId,{max=500}={}){
  if(!Array.isArray(rows)||rows.length>max||!uuid.test(companyId)||
     rows.some(x=>!x||typeof x!=='object'||Array.isArray(x)||
       x.companyId!==companyId))deny();
  return rows;
}
export function assertRun5ScopedPayload(payload,companyId){
  if(!payload||typeof payload!=='object'||Array.isArray(payload)||
     payload.companyId!==companyId||typeof payload.recordId!=='string'||
     !uuid.test(payload.recordId)||
     typeof payload.domain!=='string'||!Object.hasOwn(kinds,payload.domain)||
     !payload.data||typeof payload.data!=='object'||Array.isArray(payload.data)||
     payload.data.companyId!==companyId)deny();
  const json=JSON.stringify(payload.data);
  if(!json||json.length>32768)deny();
  return payload;
}
