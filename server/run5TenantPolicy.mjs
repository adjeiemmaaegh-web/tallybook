/** V19 Run 5: canonical cloud tenant authorization policy.
 * Caller supplies a validated Supabase principal and database-sourced rows.
 * This pure policy cannot authorize local IndexedDB operations.
 */
const ACTION_ROLES=Object.freeze({
  'company:read':['owner','attendant'],
  'membership:read':['owner'],
  'membership:write':['owner'],
  'reports:read':['owner'],
  'backup:read':['owner'],
  'backup:write':['owner'],
  'imports:write':['owner'],
  'exports:read':['owner'],
  'assistant:read':['owner'],
  'finance:read':['owner'],
  'finance:write':['owner'],
  'sync:read':['owner'],
  'sync:write':['owner']
});
const deny=()=>{throw Error('Cloud tenant authorization denied');};
const ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function assertRun5TenantAccess({principal,company,membership,companyId,action,now}){
  if(!ID.test(companyId??'')||!Object.hasOwn(ACTION_ROLES,action)||
    !ID.test(principal?.userId??'')||!ID.test(principal?.sessionId??'')||
    principal.active!==true||!Number.isSafeInteger(principal.expiresAtEpochMs)||
    !Number.isSafeInteger(now)||now<=0||now>=principal.expiresAtEpochMs)deny();
  if(company?.id!==companyId||!ID.test(company?.ownerId??''))deny();
  if(membership?.companyId!==companyId||membership.userId!==principal.userId||
    membership.status!=='active'||!ACTION_ROLES[action].includes(membership.role))deny();
  if(membership.role==='owner'&&company.ownerId!==principal.userId)deny();
  if(membership.role==='attendant'&&company.ownerId===principal.userId)deny();
  return Object.freeze({companyId,userId:principal.userId,role:membership.role,action});
}
export const RUN5_ACTIONS=Object.freeze(Object.keys(ACTION_ROLES));
