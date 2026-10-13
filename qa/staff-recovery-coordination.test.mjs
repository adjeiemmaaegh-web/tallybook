import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assertAuthenticatorCredentialFresh, assertSupervisorApprovalFresh } from '../client/src/features/staff/credentialFreshness.mjs';
import { withRetailWriteLock } from '../client/src/features/backup/retailWriteLock.mjs';
import { TWO_DATABASE_LOCK_NAME } from '../client/src/features/backup/crossTabDataLock.mjs';

const original={id:'staff1',businessProfileId:'company1',webAuthn:{credentialId:'cred-A',publicKey:'pk-A',algorithm:-7,signCount:3}};
const clone=(v)=>structuredClone(v);

test('WebAuthn unlock rejects a disabled, moved or revoked staff identity',()=>{
  for(const edited of [ {disabledAt:'2026-10-12'}, {businessProfileId:'company2'}, {webAuthn:undefined}, {id:'staff2'} ]) {
    const latest={...clone(original),...edited};
    assert.throws(()=>assertAuthenticatorCredentialFresh(original,latest,'company1',4),/changed/);
  }
});
test('WebAuthn refuses replaced keys or algorithms even when credential id is unchanged',()=>{
  for(const change of [{publicKey:'pk-B'},{algorithm:-257},{credentialId:'cred-B'}]){
    const latest=clone(original);Object.assign(latest.webAuthn,change);
    assert.throws(()=>assertAuthenticatorCredentialFresh(original,latest,'company1',4),/changed/);
  }
});
test('WebAuthn rejects replay and zero-counter downgrade after an incrementing authenticator',()=>{
  for(const count of [0,2,3,NaN,-1,1.5])
    assert.throws(()=>assertAuthenticatorCredentialFresh(original,original,'company1',count),/changed/);
  const rolledBack=clone(original);rolledBack.webAuthn.signCount=1;
  assert.throws(()=>assertAuthenticatorCredentialFresh(original,rolledBack,'company1',4),/changed/);
  const fresh=clone(original);fresh.webAuthn.signCount=5;
  assert.throws(()=>assertAuthenticatorCredentialFresh(original,fresh,'company1',4),/changed/);
  assert.equal(assertAuthenticatorCredentialFresh(original,fresh,'company1',6).signCount,5);
  const zero={...clone(original),webAuthn:{...original.webAuthn,signCount:0}};
  assert.equal(assertAuthenticatorCredentialFresh(zero,zero,'company1',0).signCount,0);
});
test('Supervisor approval refuses PIN reset, disable, reassignment, lost discount permission and changed cashier',()=>{
  const old={id:'supervisor1',businessProfileId:'company1',salt:'s',pinHash:'hash',role:'supervisor',permissions:['discount']};
  const cashier={id:'cashier1',role:'cashier'};
  assert.doesNotThrow(()=>assertSupervisorApprovalFresh(old,old,'company1','cashier1','cashier1',cashier,true));
  for(const latest of [{...old,salt:'changed'},{...old,pinHash:'reset'},{...old,disabledAt:'now'},{...old,businessProfileId:'company2'},{...old,role:'cashier'},{...old,permissions:[]}])
    assert.throws(()=>assertSupervisorApprovalFresh(old,latest,'company1','cashier1','cashier1',cashier,true),/changed/);
  assert.throws(()=>assertSupervisorApprovalFresh(old,old,'company1','cashier1','cashier2',cashier,true),/changed/);
  assert.throws(()=>assertSupervisorApprovalFresh(old,old,'company1','cashier1','cashier1',{...cashier,role:'supervisor'},true),/changed/);
  assert.throws(()=>assertSupervisorApprovalFresh(old,old,'company1','cashier1','cashier1',cashier,false),/changed/);
});

// These source-contract tests establish that new entrypoints cooperate with
// origin-wide recovery coordination. They do not replace real Dexie/browser QA.
for (const [relative,names] of Object.entries({
  'business/businessProfile.ts':['saveBusinessProfile','createBusinessProfile'],
  'commerce/commerce.ts':['createDraftOrder','cancelDraftOrder','transitionLocalOrder'],
  'staff/staff.ts':['createStaff','enrollStaffAuthenticator','revokeStaffAuthenticator','changeStaffStatus','setStaffPermissions','changeStaffRole','resetStaffPin','openShift','closeShift'],
})) test(`admin write services acquire shared recovery lock: ${relative}`,()=>{
  const source=readFileSync(new URL(`../client/src/features/${relative}`,import.meta.url),'utf8');
  assert.match(source,/import \{ withCoordinatedRetailWrite \}/);
  for (const name of names){
    const start=source.indexOf(`export async function ${name}(`);
    assert.ok(start>=0,`${name} must exist`);
    const next=source.indexOf('\nexport ',start+10);
    const body=source.slice(start,next<0?undefined:next);
    assert.match(body,/withCoordinatedRetailWrite\(\(\) => database\.transaction\(/,`${name} must acquire lock before writing`);
  }
});
test('staff WebAuthn counter persistence revalidates saved verifier in a write transaction',()=>{
  const source=readFileSync(new URL('../client/src/features/staff/staff.ts',import.meta.url),'utf8');
  const section=source.slice(source.indexOf('export async function unlockStaffWithAuthenticator'),source.indexOf('export async function revokeStaffAuthenticator'));
  assert.match(section,/withCoordinatedRetailWrite\(\(\) => database\.transaction\('rw'/);
  assert.match(section,/assertAuthenticatorCredentialFresh\(member,fresh,company,count\)/);
  assert.match(section,/await database\.staffMembers\.update\(id/);
});
test('discount approval is bound to original cashier and revalidates both staff identities',()=>{
  const source=readFileSync(new URL('../client/src/features/staff/staff.ts',import.meta.url),'utf8');
  const section=source.slice(source.indexOf('export async function approveCheckoutDiscount'),source.indexOf('export function consumeCheckoutDiscountApproval'));
  assert.match(section,/assertSupervisorApprovalFresh/);
  assert.match(section,/cashierId:active\.id/);
  assert.match(source,/approval\.cashierId !== currentStaffId\(company\)/);
});
test('competing exclusive recovery prevents running an administrative write body',async()=>{
  let started=false;
  const manager={request:async(name,opts,cb)=>{assert.equal(name,TWO_DATABASE_LOCK_NAME);assert.equal(opts.mode,'shared');return cb(null)}};
  await assert.rejects(withRetailWriteLock(()=>{started=true;},false,manager),/Another tab/);
  assert.equal(started,false);
});
test('shift close and preview use current actor inside the relevant read/write transactions',()=>{
  const source=readFileSync(new URL('../client/src/features/staff/staff.ts',import.meta.url),'utf8');
  const close=source.slice(source.indexOf('export async function closeShift'),source.indexOf('interface DiscountApproval'));
  assert.match(close,/database\.cashPartialReturns,database\.staffMembers\],async\(\)=>\{/);
  assert.match(close,/const current=await requirePermission\('sell',database,company\)/);
  assert.match(close,/currentStaffId\(company\)!==member\.id/);
  const preview=source.slice(source.indexOf('export async function previewShiftCash'),source.indexOf('export async function closeShift'));
  assert.match(preview,/return database\.transaction\('r',\[database\.staffMembers/);
  assert.match(preview,/return cash/);
  const currentShift=source.slice(source.indexOf('export async function activeStaffShift'));
  assert.match(currentShift,/member\.businessProfileId!==company/);
});
