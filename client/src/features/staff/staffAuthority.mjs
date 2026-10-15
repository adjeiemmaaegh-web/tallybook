/** V19 Run 6: fail-closed, device-local staff authorization invariants.
 * These rules are not proof against a user editing their own IndexedDB files.
 * Business cloud identity and remote authorization remain separate.
 */
const ACTIONS=Object.freeze(['sell','refund','discount','inventory','reports','staff']);
const ROLE_ACTIONS=Object.freeze({
  owner:Object.freeze([...ACTIONS]),
  supervisor:Object.freeze(['sell','refund','discount','inventory','reports']),
  cashier:Object.freeze(['sell'])
});
const deny=()=>{throw Error('Local staff authorization denied');};
const id=x=>typeof x==='string'&&x.length>0&&x.length<=200&&x.trim()===x;
export function staffCredentialBinding(member){
  if(!member||!id(member.id)||!id(member.businessProfileId)||
    !['owner','supervisor','cashier'].includes(member.role)||
    typeof member.pinHash!=='string'||member.pinHash.length!==64||
    typeof member.salt!=='string'||member.salt.length<16||
    (member.permissions!==undefined&&
      (!Array.isArray(member.permissions)||
       member.permissions.some(p=>!ACTIONS.includes(p))||
       new Set(member.permissions).size!==member.permissions.length)))deny();
  // A changed role, override or PIN invalidates an already-unlocked session.
  return JSON.stringify([member.id,member.businessProfileId,member.role,
    member.salt,member.pinHash,
    member.permissions===undefined?null:[...member.permissions].sort(),
    member.disabledAt??null]);
}
export function assertStaffAuthority({member,companyId,action,sessionId,credentialBinding}){
  if(!id(companyId)||!id(sessionId)||!ACTIONS.includes(action))deny();
  const current=staffCredentialBinding(member);
  if(member.businessProfileId!==companyId||member.id!==sessionId||
    member.disabledAt||credentialBinding!==current)deny();
  const granted=ROLE_ACTIONS[member.role];
  if(!granted?.includes(action)||
    (member.permissions!==undefined&&!member.permissions.includes(action)))deny();
  return Object.freeze({companyId,staffId:member.id,role:member.role,action});
}
export function assertStaffShift({staff,shift,companyId,now=Date.now()}){
  if(!staff||!id(companyId)||staff.businessProfileId!==companyId||
    !shift||shift.businessProfileId!==companyId||shift.staffId!==staff.id||
    !id(shift.id)||shift.closedAt||
    !Number.isSafeInteger(now)||!Number.isFinite(Date.parse(shift.openedAt))||
    Date.parse(shift.openedAt)>now||!Number.isSafeInteger(shift.openingFloatMinor)||
    shift.openingFloatMinor<0)deny();
  return Object.freeze({companyId,staffId:staff.id,shiftId:shift.id});
}
export function assertExactSupervisorApproval({approval,companyId,cashierId,
  cashierGeneration,amountMinor,subtotalMinor,now=Date.now()}){
  if(!approval||!id(companyId)||!id(cashierId)||
    approval.company!==companyId||approval.cashierId!==cashierId||
    approval.cashierGeneration!==cashierGeneration||
    !Number.isSafeInteger(now)||!Number.isSafeInteger(approval.expiresAt)||
    now>=approval.expiresAt||
    !Number.isSafeInteger(amountMinor)||amountMinor<=0||
    !Number.isSafeInteger(subtotalMinor)||subtotalMinor<amountMinor||
    approval.amountMinor!==amountMinor||approval.subtotalMinor!==subtotalMinor)deny();
  return approval.approverId;
}
export const STAFF_ACTIONS=ACTIONS;
