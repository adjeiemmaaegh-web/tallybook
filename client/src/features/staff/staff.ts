import { withCoordinatedRetailWrite } from "@/features/backup/coordinatedRetailWrite";
import { assertAuthenticatorCredentialFresh, assertSupervisorApprovalFresh } from "./credentialFreshness.mjs";
import { assertStaffAuthority, assertStaffShift, assertExactSupervisorApproval, staffCredentialBinding } from "./staffAuthority.mjs";
import { nanoid } from 'nanoid';
import { db, type TallybookDB } from '@/db/TallybookDB';
import { getActiveBusinessProfileId } from '@/features/business/activeCompany';
import { assertCompanyScope } from '@/features/business/companyScope.mjs';

export type StaffRole = 'owner' | 'supervisor' | 'cashier';
export type StaffPermission = 'sell' | 'refund' | 'discount' | 'inventory' | 'reports' | 'staff';
export interface StaffMember { id:string; businessProfileId:string; name:string; role:StaffRole; salt:string; pinHash:string; permissions?:StaffPermission[]; webAuthn?: {credentialId:string; publicKey:string; algorithm:number; signCount:number}; disabledAt?:string; createdAt:string; }
export interface StaffShift { id:string; businessProfileId:string; staffId:string; openedAt:string; openingFloatMinor:number; closedAt?:string; countedCashMinor?:number; expectedCashMinor?:number; varianceMinor?:number; }
export interface StaffAudit { id:string; businessProfileId:string; staffId:string; action:string; createdAt:string; details:string; }
const policy:Record<StaffRole,readonly StaffPermission[]> = {owner:['sell','refund','discount','inventory','reports','staff'],supervisor:['sell','refund','discount','inventory','reports'],cashier:['sell']};
// Verified unlocks live only in runtime memory: editing sessionStorage must never impersonate a cashier.
const verifiedSessions = new Map<string,string>();
const failedAttempts = new Map<string,{count:number;until:number}>();
const sessionExpiration = new Map<string,number>();
const sessionCredentials = new Map<string,string>();
const sessionGenerations = new Map<string,number>();
const incrementSessionGeneration = (company:string) => {
  sessionGenerations.set(company,(sessionGenerations.get(company)??0)+1);
};
const invalidateSupervisorApprovals = (company:string) => {
  for (const key of discountApprovals.keys())
    if (key.startsWith(`${company}:`)) discountApprovals.delete(key);
};
export const STAFF_SESSION_CHANGED = 'tallybook:staff-session';
const signalSessionChanged = () => { if (typeof window !== 'undefined') window.dispatchEvent(new Event(STAFF_SESSION_CHANGED)); };
export function rolePermissions(role:StaffRole):readonly StaffPermission[] { return policy[role]??[]; }
export function allowed(role:StaffRole, action:StaffPermission) {
  return Array.isArray(policy[role])&&policy[role].includes(action);
}
export function staffCan(member:StaffMember, action:StaffPermission) { return allowed(member.role,action) && (!member.permissions || member.permissions.includes(action)); }
export function currentStaffId(company=getActiveBusinessProfileId()) { const id=verifiedSessions.get(company);if (!id) return null; if (Date.now() >= (sessionExpiration.get(company) ?? 0)) { lockStaff(company); return null; } return id; }
export function lockStaff(company=getActiveBusinessProfileId()) {
  verifiedSessions.delete(company); sessionExpiration.delete(company);
  sessionCredentials.delete(company); incrementSessionGeneration(company);
  invalidateSupervisorApprovals(company); signalSessionChanged();
}
const randomHex = (size=16) => { const bytes=new Uint8Array(size); crypto.getRandomValues(bytes); return [...bytes].map(x=>x.toString(16).padStart(2,'0')).join(''); };
async function hashPin(pin:string,salt:string) { const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(pin),'PBKDF2',false,['deriveBits']); const result=await crypto.subtle.deriveBits({name:'PBKDF2',salt:new TextEncoder().encode(salt),iterations:180000,hash:'SHA-256'},key,256); return [...new Uint8Array(result)].map(x=>x.toString(16).padStart(2,'0')).join(''); }
const validPin = (pin:string)=>/^\d{6,12}$/.test(pin);
// Directory entries intentionally exclude PIN hashes, salts and authenticator keys.
// The database is device-local, but routine UI queries should not expose credentials.
export type StaffDirectoryEntry = Pick<StaffMember, 'id'|'businessProfileId'|'name'|'role'|'permissions'|'disabledAt'|'createdAt'> & { hasAuthenticator:boolean };
export async function listStaff(database:TallybookDB=db):Promise<StaffDirectoryEntry[]> {
  const company=getActiveBusinessProfileId();
  const members=await database.staffMembers.where('businessProfileId').equals(company).toArray();
  assertCompanyScope(company, getActiveBusinessProfileId());
  return members.map(({id,businessProfileId,name,role,permissions,disabledAt,createdAt,webAuthn})=>({
    id,businessProfileId,name,role,permissions,disabledAt,createdAt,hasAuthenticator:!!webAuthn
  }));
}
export async function createStaff(name:string,role:StaffRole,pin:string,database:TallybookDB=db) {
  const businessProfileId=getActiveBusinessProfileId();
  if(!name.trim()||name.trim().length>80||!validPin(pin)) throw new Error('Enter a name and a 6–12 digit PIN.');
  if(!['owner','supervisor','cashier'].includes(role))throw new Error('Invalid role.');
  const profile=await database.businessProfiles.get(businessProfileId);
  if(!profile)throw new Error('Set up a company before creating staff accounts.');
  const salt=randomHex();const pinHash=await hashPin(pin,salt);
  const member=await withCoordinatedRetailWrite(() => database.transaction('rw',[database.staffMembers,database.staffAudits,database.businessProfiles],async()=>{
    if(!(await database.businessProfiles.get(businessProfileId))) throw new Error('Company no longer exists.');
    const members=await database.staffMembers.where('businessProfileId').equals(businessProfileId).toArray();
    let actor:StaffMember|null=null;
    if(members.length){actor=await requirePermission('staff',database,businessProfileId);if(!actor)throw new Error('Unlock the existing owner before creating staff.');if(role==='owner')throw new Error('Additional owner accounts require a managed owner transfer.');}
    else if(role!=='owner')throw new Error('Create the owner account first.');
    assertCompanyScope(businessProfileId,getActiveBusinessProfileId());
    const member:StaffMember={id:nanoid(),businessProfileId,name:name.trim(),role,salt,pinHash,createdAt:new Date().toISOString()};
    await database.staffMembers.add(member);
    await database.staffAudits.add({id:nanoid(),businessProfileId,staffId:actor?.id??member.id,action:'staff.created',createdAt:member.createdAt,details:member.id});
    assertCompanyScope(businessProfileId,getActiveBusinessProfileId());
    if(actor&&currentStaffId(businessProfileId)!==actor.id)throw new Error('Staff session changed before creation completed.');
    return member;
  }));
  signalSessionChanged();
  return member;
}
export async function unlockStaff(id:string,pin:string,database:TallybookDB=db) {
  const company=getActiveBusinessProfileId();
  const member=await database.staffMembers.get(id);
  assertCompanyScope(company,getActiveBusinessProfileId());
  const throttleKey=`${company}:${id}`;
  const attempt=failedAttempts.get(throttleKey);
  if(attempt&&Date.now()<attempt.until)throw new Error('Too many attempts. Try again later.');
  if(!member||member.businessProfileId!==company||member.disabledAt||!validPin(pin))throw new Error('Cannot unlock with these credentials.');
  const hash=await hashPin(pin,member.salt);
  if(hash!==member.pinHash){
    const count=(attempt?.count??0)+1;
    failedAttempts.set(throttleKey,{count,until:count>=5?Date.now()+300000:0});
    throw new Error('Cannot unlock with these credentials.');
  }
  // Hashing is asynchronous and staff may have been disabled, revoked or
  // moved to another profile before the result arrives. Never unlock stale data.
  const latest=await database.staffMembers.get(id);
  assertCompanyScope(company,getActiveBusinessProfileId());
  if(!latest||latest.businessProfileId!==company||latest.disabledAt||
     latest.pinHash!==member.pinHash||latest.salt!==member.salt)
    throw new Error('Staff credentials changed during unlock. Try again.');
  failedAttempts.delete(throttleKey);
  verifiedSessions.set(company,latest.id);
  sessionCredentials.set(company,staffCredentialBinding(latest));
  incrementSessionGeneration(company);invalidateSupervisorApprovals(company);
  sessionExpiration.set(company,Date.now()+30*60_000);
  signalSessionChanged();
  return latest;
}
/** Local, origin-bound WebAuthn. Still only an operational lock: IndexedDB is not tamper-proof. */
const b64url=(bytes:Uint8Array)=>btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const fromB64url=(value:string)=>Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
const randomChallenge=()=>crypto.getRandomValues(new Uint8Array(32));
function checkWebAuthnSupport(){
  if(typeof window==='undefined'||!window.isSecureContext||typeof PublicKeyCredential==='undefined'||!navigator.credentials)
    throw new Error('Biometric/security-key unlock requires a secure browser and supported device. Use your PIN instead.');
}
function assertClientData(bytes:ArrayBuffer,challenge:Uint8Array,kind:'webauthn.create'|'webauthn.get'){
  const data=JSON.parse(new TextDecoder().decode(bytes)) as {type?:string;challenge?:string;origin?:string;crossOrigin?:boolean};
  if(data.type!==kind||data.challenge!==b64url(challenge)||data.origin!==location.origin||data.crossOrigin===true)
    throw new Error('Security-key response did not match this session.');
}
export async function enrollStaffAuthenticator(database:TallybookDB=db){
  checkWebAuthnSupport();
  const actor=await requirePermission('sell',database);
  if(!actor)throw new Error('Set up and unlock a staff account first.');
  const company=getActiveBusinessProfileId();const challenge=randomChallenge();
  const created=await navigator.credentials.create({publicKey:{challenge:challenge as BufferSource,rp:{name:'Tallybook'},user:{id:new TextEncoder().encode(`${company}:${actor.id}`),name:actor.name,displayName:actor.name},pubKeyCredParams:[{type:'public-key',alg:-7}],authenticatorSelection:{userVerification:'required'},attestation:'none',timeout:60000}}) as PublicKeyCredential|null;
  if(!created||!(created.response instanceof AuthenticatorAttestationResponse))throw new Error('Security-key registration was cancelled.');
  assertClientData(created.response.clientDataJSON,challenge,'webauthn.create');
  const publicKey=created.response.getPublicKey();const algorithm=created.response.getPublicKeyAlgorithm();
  if(!publicKey||algorithm!==-7)throw new Error('Authenticator algorithm is not supported; use PIN.');
  const credentialId=b64url(new Uint8Array(created.rawId));
  // A session can be locked while the user is responding to the device prompt.
  if(currentStaffId(company)!==actor.id||getActiveBusinessProfileId()!==company)throw new Error('Session changed during registration.');
  await withCoordinatedRetailWrite(() => database.transaction('rw',database.staffMembers,database.staffAudits,async()=>{
    const currentActor=await requirePermission('sell',database,company);
    const member=await database.staffMembers.get(actor.id);
    if(!currentActor||currentActor.id!==actor.id||!member||member.disabledAt||member.businessProfileId!==company||currentStaffId(company)!==actor.id)throw new Error('Staff session is no longer valid.');
    await database.staffMembers.update(actor.id,{webAuthn:{credentialId,publicKey:b64url(new Uint8Array(publicKey)),algorithm,signCount:0}});
    await database.staffAudits.add({id:nanoid(),businessProfileId:company,staffId:actor.id,action:'staff.authenticator.enrolled',createdAt:new Date().toISOString(),details:'Authenticator registered'});
  }));
}
export async function unlockStaffWithAuthenticator(id:string,database:TallybookDB=db){
  checkWebAuthnSupport();const company=getActiveBusinessProfileId();const member=await database.staffMembers.get(id);
  if(!member||member.businessProfileId!==company||member.disabledAt||!member.webAuthn)throw new Error('No registered authenticator for this staff member. Use PIN.');
  const challenge=randomChallenge();const auth=member.webAuthn;
  const credential=await navigator.credentials.get({publicKey:{challenge:challenge as BufferSource,allowCredentials:[{type:'public-key',id:fromB64url(auth.credentialId) as BufferSource}],userVerification:'required',timeout:60000}}) as PublicKeyCredential|null;
  if(!credential||!(credential.response instanceof AuthenticatorAssertionResponse)||b64url(new Uint8Array(credential.rawId))!==auth.credentialId)throw new Error('Security-key sign-in was cancelled or mismatched.');
  assertClientData(credential.response.clientDataJSON,challenge,'webauthn.get');
  const flags=new DataView(credential.response.authenticatorData).getUint8(32);
  if((flags&0x01)===0||(flags&0x04)===0)throw new Error('Authenticator did not verify the user.');
  const rpHash=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(location.hostname)));
  const authData=new Uint8Array(credential.response.authenticatorData);
  if(!rpHash.every((v,i)=>v===authData[i]))throw new Error('Authenticator was not registered for this website.');
  const clientHash=new Uint8Array(await crypto.subtle.digest('SHA-256',credential.response.clientDataJSON));
  const signed=new Uint8Array(authData.length+clientHash.length);signed.set(authData);signed.set(clientHash,authData.length);
  const key=await crypto.subtle.importKey('spki',fromB64url(auth.publicKey) as BufferSource,{name:'ECDSA',namedCurve:'P-256'},false,['verify']);
  const der=new Uint8Array(credential.response.signature);
  // WebAuthn ECDSA signatures use ASN.1 DER; WebCrypto expects fixed-width IEEE P1363.
  const decodeDer=(value:Uint8Array)=>{
    let p=0;if(value[p++]!==0x30)throw new Error('Invalid authenticator signature.');
    let len=value[p++];if(len===0x81)len=value[p++];if(len!==value.length-p)throw new Error('Invalid authenticator signature length.');
    const parts:Uint8Array[]=[];
    for(let i=0;i<2;i++){
      if(value[p++]!==0x02)throw new Error('Invalid authenticator signature part.');
      const n=value[p++];if(n<1||n>33||p+n>value.length)throw new Error('Invalid authenticator integer.');
      const raw=value.slice(p,p+n);p+=n;
      if(raw.length===33&&raw[0]!==0)throw new Error('Invalid authenticator integer length.');
      const trimmed=raw.length===33?raw.slice(1):raw;
      const padded=new Uint8Array(32);padded.set(trimmed,32-trimmed.length);parts.push(padded);
    }
    if(p!==value.length)throw new Error('Invalid authenticator trailing data.');
    const out=new Uint8Array(64);out.set(parts[0]);out.set(parts[1],32);return out;
  };
  const verified=await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},key,decodeDer(der),signed);
  if(!verified)throw new Error('Security-key signature verification failed.');
  const count=new DataView(credential.response.authenticatorData).getUint32(33,false);
  // Re-read and persist the authenticator counter under one write transaction.
  // Revocation or a competing unlock may have changed the verifier/counter
  // during the browser prompt or signature calculation.
  const latest=await withCoordinatedRetailWrite(() => database.transaction('rw', database.staffMembers, async () => {
    if (getActiveBusinessProfileId() !== company) throw new Error('Company changed during authenticator unlock.');
    const fresh=await database.staffMembers.get(id);
    const current=assertAuthenticatorCredentialFresh(member,fresh,company,count);
    if(count>current.signCount)
      await database.staffMembers.update(id,{webAuthn:{...current,signCount:count}});
    return fresh!;
  }));
  if (getActiveBusinessProfileId() !== company) throw new Error('Company changed during authenticator unlock.');
  verifiedSessions.set(company,id);
  sessionCredentials.set(company,staffCredentialBinding(latest));
  incrementSessionGeneration(company);invalidateSupervisorApprovals(company);
  sessionExpiration.set(company,Date.now()+30*60_000);
  signalSessionChanged();return latest;
}
export async function revokeStaffAuthenticator(id:string,database:TallybookDB=db){
  const company=getActiveBusinessProfileId();
  return withCoordinatedRetailWrite(() => database.transaction('rw',database.staffMembers,database.staffAudits,async()=>{
    const actor=await requirePermission('staff',database,company);
    if(!actor)throw new Error('Create and unlock an owner account before managing staff.');
    const member=await database.staffMembers.get(id);
    if(!member||member.businessProfileId!==company)throw new Error('Staff member not found.');
    assertStaffMutationActor(company,actor);
    await database.staffMembers.update(id,{webAuthn:undefined});
    await database.staffAudits.add({id:nanoid(),businessProfileId:company,staffId:actor.id,action:'staff.authenticator.revoked',createdAt:new Date().toISOString(),details:id});
    assertStaffMutationActor(company,actor);
  }));
}
export async function requirePermission(action:StaffPermission,database:TallybookDB=db,company=getActiveBusinessProfileId()) {
  if (company !== getActiveBusinessProfileId()) throw new Error('Company changed; start the action again.');
  const members=await database.staffMembers.where('businessProfileId').equals(company).toArray();
  if (company !== getActiveBusinessProfileId()) throw new Error('Company changed; start the action again.');
  if(!members.length)return null;
  const id=currentStaffId(company);
  const member=id?members.find(m=>m.id===id):undefined;
  try {
    assertStaffAuthority({member,companyId:company,action,sessionId:id,
      credentialBinding:sessionCredentials.get(company)});
  } catch {
    if(id)lockStaff(company);
    throw new Error(`Staff access locked or ${action} permission denied.`);
  }
  sessionExpiration.set(company,Date.now()+30*60_000);
  return member!;
}
/** Retain the exact authorized actor throughout a staff mutation. The read
 * and decision both occur under the same IndexedDB write lock. */
function assertStaffMutationActor(company:string,actor:StaffMember){
  assertCompanyScope(company,getActiveBusinessProfileId());
  if(currentStaffId(company)!==actor.id)throw new Error('Staff session changed during the operation. Retry after unlocking.');
}
export async function changeStaffStatus(id:string,disable:boolean,database:TallybookDB=db){
  const company=getActiveBusinessProfileId();
  return withCoordinatedRetailWrite(() => database.transaction('rw',database.staffMembers,database.staffAudits,async()=>{
    const actor=await requirePermission('staff',database,company);
    if(!actor)throw new Error('Create and unlock an owner account before managing staff.');
    const member=await database.staffMembers.get(id);
    if(!member||member.businessProfileId!==company)throw new Error('Staff member not found.');
    if(disable&&currentStaffId(company)===id)throw new Error('Cannot disable your active session.');
    if(member.role==='owner')throw new Error('Cannot disable owner.');
    assertStaffMutationActor(company,actor);
    await database.staffMembers.update(id,{disabledAt:disable?new Date().toISOString():undefined});
    invalidateSupervisorApprovals(company);
    await database.staffAudits.add({id:nanoid(),businessProfileId:company,staffId:actor.id,action:disable?'staff.disabled':'staff.enabled',createdAt:new Date().toISOString(),details:id});
    assertStaffMutationActor(company,actor);
  }));
}
export async function setStaffPermissions(id:string,permissions:StaffPermission[],database:TallybookDB=db){
  const company=getActiveBusinessProfileId();
  return withCoordinatedRetailWrite(() => database.transaction('rw',database.staffMembers,database.staffAudits,async()=>{
    const actor=await requirePermission('staff',database,company);
    if(!actor)throw new Error('Create and unlock an owner account before managing staff.');
    const member=await database.staffMembers.get(id);
    if(!member||member.businessProfileId!==company||member.role==='owner')throw new Error('Staff member cannot be modified.');
    if(!Array.isArray(permissions)||new Set(permissions).size!==permissions.length||!permissions.every(p=>allowed(member.role,p)))
      throw new Error('Cannot grant permissions outside the selected staff role.');
    assertStaffMutationActor(company,actor);
    await database.staffMembers.update(id,{permissions:[...permissions]});
    invalidateSupervisorApprovals(company);
    await database.staffAudits.add({id:nanoid(),businessProfileId:company,staffId:actor.id,action:'staff.permissions.changed',createdAt:new Date().toISOString(),details:id});
    assertStaffMutationActor(company,actor);
  }));
}
export async function changeStaffRole(id:string,role:Exclude<StaffRole,'owner'>,database:TallybookDB=db){
  const company=getActiveBusinessProfileId();
  if(!['supervisor','cashier'].includes(role))throw new Error('Only cashier and supervisor roles may be assigned.');
  return withCoordinatedRetailWrite(() => database.transaction('rw',database.staffMembers,database.staffAudits,async()=>{
    const actor=await requirePermission('staff',database,company);
    if(!actor)throw new Error('Create and unlock an owner account before managing staff.');
    const member=await database.staffMembers.get(id);
    if(!member||member.businessProfileId!==company||member.role==='owner')throw new Error('Cannot change owner role.');
    assertStaffMutationActor(company,actor);
    await database.staffMembers.update(id,{role,permissions:undefined});
    invalidateSupervisorApprovals(company);
    await database.staffAudits.add({id:nanoid(),businessProfileId:company,staffId:actor.id,action:'staff.role.changed',createdAt:new Date().toISOString(),details:`${id}=${role}`});
    assertStaffMutationActor(company,actor);
  }));
}
export async function resetStaffPin(id:string,newPin:string,database:TallybookDB=db){
  const company=getActiveBusinessProfileId();
  if(!validPin(newPin))throw new Error('Use a 6–12 digit PIN.');
  const salt=randomHex();const pinHash=await hashPin(newPin,salt);
  return withCoordinatedRetailWrite(() => database.transaction('rw',database.staffMembers,database.staffAudits,async()=>{
    const actor=await requirePermission('staff',database,company);
    if(!actor)throw new Error('Create and unlock an owner account before managing staff.');
    const member=await database.staffMembers.get(id);
    if(!member||member.businessProfileId!==company||member.role==='owner')throw new Error('Only non-owner PINs can be reset here.');
    assertStaffMutationActor(company,actor);
    await database.staffMembers.update(id,{salt,pinHash});
    invalidateSupervisorApprovals(company);
    await database.staffAudits.add({id:nanoid(),businessProfileId:company,staffId:actor.id,action:'staff.pin.reset',createdAt:new Date().toISOString(),details:id});
    assertStaffMutationActor(company,actor);
  }));
}
export async function openShift(openingFloatMinor:number,database:TallybookDB=db){
  const company=getActiveBusinessProfileId();
  if(!Number.isSafeInteger(openingFloatMinor)||openingFloatMinor<0)throw new Error('Invalid opening float.');
  return withCoordinatedRetailWrite(() => database.transaction('rw',database.staffMembers,database.staffShifts,database.staffAudits,async()=>{
    const member=await requirePermission('sell',database,company);
    if(!member)throw new Error('Set up a staff owner before using shifts.');
    const active=await database.staffShifts.where('staffId').equals(member.id).filter(x=>x.businessProfileId===company&&!x.closedAt).first();
    if(active)throw new Error('Close the current shift first.');
    assertCompanyScope(company,getActiveBusinessProfileId());
    if(currentStaffId(company)!==member.id)throw new Error('Staff session changed before opening the shift.');
    const shift:StaffShift={id:nanoid(),businessProfileId:company,staffId:member.id,openedAt:new Date().toISOString(),openingFloatMinor};
    await database.staffShifts.add(shift);
    await database.staffAudits.add({id:nanoid(),businessProfileId:company,staffId:member.id,action:'shift.opened',createdAt:shift.openedAt,details:shift.id});
    assertStaffMutationActor(company,member);
    return shift;
  }));
}
/** Calculate only cash movements expressly linked to this staff shift.
 * Unrecorded petty cash or external settlements are NOT represented here. */
export function calculateTrackedShiftCash(shift:StaffShift, rows: {
  sales: Array<{id:string;businessProfileId:string;shiftId?:string;paymentMethod:string}>;
  payments: Array<{saleId:string;method:string;amountMinor:number}>;
  repayments: Array<{shiftId?:string;method:string;amountMinor:number}>;
  transfers: Array<{shiftId?:string;method:string;kind:string;amountMinor:number}>;
  reversals: Array<{shiftId?:string;originalSaleId:string;reversedReceivedMinor:number}>;
  cashReturns?: Array<{shiftId?:string;originalSaleId:string;refundedMinor:number}>;
}) {
  // Validate individual journal entries before aggregation. Otherwise a negative or
  // corrupt entry could be hidden by a positive movement in the same shift.
  if (!Number.isSafeInteger(shift.openingFloatMinor) || shift.openingFloatMinor < 0)
    throw new Error('Shift opening float requires reconciliation.');
  const recordedAmounts = [...rows.payments, ...rows.repayments, ...rows.transfers];
  if (recordedAmounts.some(row => !Number.isSafeInteger(row.amountMinor) || row.amountMinor < 0) ||
      rows.reversals.some(row => !Number.isSafeInteger(row.reversedReceivedMinor) || row.reversedReceivedMinor > 0) ||
      (rows.cashReturns ?? []).some(row => !Number.isSafeInteger(row.refundedMinor) || row.refundedMinor <= 0) ||
      rows.transfers.some(row => row.kind !== 'deposit' && row.kind !== 'refund'))
    throw new Error('Invalid recorded cash movement requires reconciliation.');
  const scopedSales=rows.sales.filter(s=>s.businessProfileId===shift.businessProfileId);
  if (new Set(scopedSales.map(s=>s.id)).size !== scopedSales.length)
    throw new Error('Duplicate sale records require reconciliation.');
  const sales=new Map(scopedSales.map(s=>[s.id,s]));
  const cashSales=rows.payments.filter(p=>p.method==='cash' && sales.get(p.saleId)?.shiftId===shift.id)
    .reduce((n,p)=>n+p.amountMinor,0);
  const cashRepayments=rows.repayments.filter(p=>p.method==='cash' && p.shiftId===shift.id)
    .reduce((n,p)=>n+p.amountMinor,0);
  const prepaidCash=rows.transfers.filter(t=>t.method==='cash' && t.shiftId===shift.id)
    .reduce((n,t)=>n+(t.kind==='deposit'?t.amountMinor:-t.amountMinor),0);
  const refunds=rows.reversals.filter(r=>r.shiftId===shift.id && sales.get(r.originalSaleId)?.paymentMethod==='cash')
    .reduce((n,r)=>n+r.reversedReceivedMinor,0);
  if ((rows.cashReturns ?? []).some(r=>!sales.get(r.originalSaleId) || sales.get(r.originalSaleId)?.paymentMethod!=='cash'))
    throw new Error('Cash refund shift record refers to a missing or noncash original sale.');
  const partialRefunds=(rows.cashReturns ?? []).filter(r=>r.shiftId===shift.id)
    .reduce((n,r)=>n-r.refundedMinor,0);
  const movementMinor=cashSales+cashRepayments+prepaidCash+refunds+partialRefunds;
  const expectedCashMinor=shift.openingFloatMinor+movementMinor;
  if (![cashSales,cashRepayments,prepaidCash,refunds,partialRefunds,movementMinor,expectedCashMinor].every(Number.isSafeInteger) || expectedCashMinor < 0)
    throw new Error('Shift cash movements need reconciliation before close.');
  return {cashSalesMinor:cashSales,cashRepaymentsMinor:cashRepayments,prepaidCashMinor:prepaidCash,cashReversalsMinor:refunds,cashPartialRefundsMinor:partialRefunds,movementMinor,expectedCashMinor};
}
async function getShiftCashRows(database:TallybookDB, company:string) {
  const [sales,payments,repayments,transfers,reversals,cashReturns]=await Promise.all([
    database.sales.where('businessProfileId').equals(company).toArray(),
    database.payments.where('businessProfileId').equals(company).toArray(),
    database.repayments.where('businessProfileId').equals(company).toArray(),
    database.walletTransfers.where('businessProfileId').equals(company).toArray(),
    database.saleReversals.where('businessProfileId').equals(company).toArray(),
    database.cashPartialReturns.where('businessProfileId').equals(company).toArray(),
  ]);
  return {sales,payments,repayments,transfers,reversals,cashReturns};
}
export async function previewShiftCash(shiftId:string,database:TallybookDB=db) {
  const company=getActiveBusinessProfileId();
  return database.transaction('r',[database.staffMembers,database.staffShifts,database.sales,database.payments,database.repayments,database.walletTransfers,database.saleReversals,database.cashPartialReturns],async()=>{
    const member=await requirePermission('sell',database,company);
    if(!member||currentStaffId(company)!==member.id)throw new Error('A valid staff session is required.');
    const shift=await database.staffShifts.get(shiftId);
    if(!shift||shift.businessProfileId!==company||shift.staffId!==member.id||shift.closedAt)throw new Error('Open shift not found.');
    const cash=calculateTrackedShiftCash(shift,await getShiftCashRows(database,company));
    if(company!==getActiveBusinessProfileId()||currentStaffId(company)!==member.id)throw new Error('Staff session changed during shift review.');
    return cash;
  });
}
export async function closeShift(shiftId:string,countedCashMinor:number,database:TallybookDB=db) {
  const company=getActiveBusinessProfileId();
  const member=await requirePermission('sell',database,company);
  if(!member)throw new Error('Staff member is required.');
  if(!Number.isSafeInteger(countedCashMinor)||countedCashMinor<0)throw new Error('Invalid counted cash.');
  return withCoordinatedRetailWrite(() => database.transaction('rw',[database.staffShifts,database.staffAudits,database.sales,database.payments,database.repayments,database.walletTransfers,database.saleReversals,database.cashPartialReturns,database.staffMembers],async()=>{
    const current=await requirePermission('sell',database,company);
    if(!current||current.id!==member.id||currentStaffId(company)!==member.id)throw new Error('Staff session changed during shift close.');
    const shift=await database.staffShifts.get(shiftId);
    if(!shift||shift.businessProfileId!==member.businessProfileId||shift.staffId!==member.id||shift.closedAt)throw new Error('Open shift not found.');
    assertStaffShift({staff:current,shift,companyId:company});
    const cash=calculateTrackedShiftCash(shift,await getShiftCashRows(database,member.businessProfileId));
    const closedAt=new Date().toISOString();
    const varianceMinor=countedCashMinor-cash.expectedCashMinor;
    if(!Number.isSafeInteger(varianceMinor))throw new Error('Shift variance exceeds supported money limits.');
    if(getActiveBusinessProfileId()!==company||currentStaffId(company)!==member.id)throw new Error('Staff session changed during shift close.');
    await database.staffShifts.update(shiftId,{closedAt,countedCashMinor,expectedCashMinor:cash.expectedCashMinor,varianceMinor});
    await database.staffAudits.add({id:nanoid(),businessProfileId:member.businessProfileId,staffId:member.id,action:'shift.closed',createdAt:closedAt,details:`${shiftId}; variance=${varianceMinor}`});
    if(currentStaffId(company)!==member.id||getActiveBusinessProfileId()!==company)
      throw new Error('Staff session changed before shift close committed.');
    return {...cash,countedCashMinor,varianceMinor};
  }));
}


interface DiscountApproval { company: string; approverId: string; approverCredentialBinding:string; cashierId: string; cashierGeneration:number; amountMinor: number; subtotalMinor:number; expiresAt: number; }
const discountApprovals = new Map<string, DiscountApproval>();
/** One-time approval bound to one immutable checkout key and one exact discount. */
export async function approveCheckoutDiscount(approverId: string, pin: string, submissionKey: string, amountMinor: number, subtotalMinor:number, database:TallybookDB=db) {
  const company = getActiveBusinessProfileId();
  if (!submissionKey || submissionKey.length < 8 || !Number.isSafeInteger(amountMinor) || amountMinor <= 0 || !Number.isSafeInteger(subtotalMinor) || subtotalMinor < amountMinor)
    throw new Error('A valid checkout key and discount are required.');
  const active = await requirePermission('sell',database);
  if (!active || active.role !== 'cashier') throw new Error('This approval is for an active cashier session.');
  const approver = await database.staffMembers.get(approverId);
  if (!approver || approver.businessProfileId !== company || approver.disabledAt || !staffCan(approver,'discount'))
    throw new Error('A valid supervisor is required.');
  const throttleKey = `${company}:${approverId}`;
  const attempt = failedAttempts.get(throttleKey);
  if (attempt && Date.now() < attempt.until) throw new Error('Too many attempts. Try again later.');
  if (!validPin(pin) || await hashPin(pin,approver.salt) !== approver.pinHash) {
    const count=(attempt?.count ?? 0)+1;
    failedAttempts.set(throttleKey,{count,until:count>=5?Date.now()+300000:0});
    throw new Error('Supervisor PIN is incorrect.');
  }
  // The verified PIN does not authorize a detached in-memory approval by
  // itself: re-read both actors and the live cashier shift under the retail
  // lock, and commit an audit record before publishing the one-use approval.
  const result = await withCoordinatedRetailWrite(() =>
    database.transaction('rw', [database.staffMembers,database.staffShifts,database.staffAudits], async()=>{
      const activeAgain=await requirePermission('sell',database,company);
      const latestApprover=await database.staffMembers.get(approverId);
      if(getActiveBusinessProfileId()!==company)
        throw new Error('Company changed during supervisor approval.');
      assertSupervisorApprovalFresh(approver,latestApprover,company,active.id,
        currentStaffId(company),activeAgain,Boolean(latestApprover&&staffCan(latestApprover,'discount')));
      const shift=await database.staffShifts.where('staffId').equals(active.id)
        .filter(x=>x.businessProfileId===company&&!x.closedAt).first();
      assertStaffShift({staff:activeAgain,shift,companyId:company});
      const issuedAt=Date.now();
      const expiresAt=issuedAt+120000;
      const generation=sessionGenerations.get(company)??0;
      await database.staffAudits.add({id:nanoid(),businessProfileId:company,
        staffId:approverId,action:'discount.supervisor.approved',
        createdAt:new Date(issuedAt).toISOString(),
        details:JSON.stringify({cashierId:active.id,shiftId:shift!.id,
          submissionKey,amountMinor,subtotalMinor})});
      if(currentStaffId(company)!==active.id||
         (sessionGenerations.get(company)??0)!==generation||
         getActiveBusinessProfileId()!==company)
        throw new Error('Staff session changed during supervisor approval.');
      return {expiresAt,generation,approverCredentialBinding:staffCredentialBinding(latestApprover!)};
    })
  );
  failedAttempts.delete(throttleKey);
  discountApprovals.set(`${company}:${submissionKey}`,{
    company,approverId,approverCredentialBinding:result.approverCredentialBinding,
    cashierId:active.id,cashierGeneration:result.generation,
    amountMinor,subtotalMinor,expiresAt:result.expiresAt});
  return {approverId:approver.id,expiresAt:result.expiresAt};
}
/** Call INSIDE the sale IndexedDB write transaction; revalidate the supervisor
 * and cashier against current staff records, not only the memory receipt. */
export async function consumeCheckoutDiscountApproval(
  submissionKey:string,amountMinor:number,subtotalMinor:number,
  company=getActiveBusinessProfileId(),database:TallybookDB=db
):Promise<string|null>{
  const key=`${company}:${submissionKey}`;
  const approval=discountApprovals.get(key);
  if(!approval||company!==getActiveBusinessProfileId())return null;
  try{
    const generation=sessionGenerations.get(company)??0;
    const cashierId=currentStaffId(company);
    const approver=assertExactSupervisorApproval({
      approval,companyId:company,cashierId,cashierGeneration:generation,
      amountMinor,subtotalMinor
    });
    const cashier=await requirePermission('sell',database,company);
    if(!cashier||cashier.id!==cashierId||cashier.role!=='cashier')return null;
    const latest=await database.staffMembers.get(approver);
    if(!latest||latest.businessProfileId!==company||latest.disabledAt||
       !staffCan(latest,'discount')||
       staffCredentialBinding(latest)!==approval.approverCredentialBinding)return null;
    const shift=await database.staffShifts.where('staffId').equals(cashier.id)
      .filter(x=>x.businessProfileId===company&&!x.closedAt).first();
    assertStaffShift({staff:cashier,shift,companyId:company});
    if(company!==getActiveBusinessProfileId()||
       currentStaffId(company)!==cashier.id||
       (sessionGenerations.get(company)??0)!==generation)return null;
    discountApprovals.delete(key);
    return approver;
  }catch{return null;}
}

/** Snapshot current local shift; money sources use this ID for attributed cash reconciliation. */
export async function activeStaffShift(member:StaffMember|null,database:TallybookDB=db) {
  if (!member) return undefined;
  const company=getActiveBusinessProfileId();
  if (member.businessProfileId!==company) throw new Error('Staff shift belongs to another company.');
  const shift=await database.staffShifts.where('staffId').equals(member.id)
    .filter(row=>row.businessProfileId===company && !row.closedAt).first();
  if (company!==getActiveBusinessProfileId()) throw new Error('Company changed during shift lookup.');
  if(shift)assertStaffShift({staff:member,shift,companyId:company});
  return shift;
}
