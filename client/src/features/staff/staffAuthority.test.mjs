import test from 'node:test';
import assert from 'node:assert/strict';
import {staffCredentialBinding,assertStaffAuthority,assertStaffShift,
  assertExactSupervisorApproval,STAFF_ACTIONS} from '../staffAuthority.mjs';

const hash='a'.repeat(64);
const person=(changes={})=>({id:'staff-1',businessProfileId:'company-1',
  role:'cashier',salt:'saltsaltsaltsaltsalt',pinHash:hash,...changes});
const access=(member=person(),changes={})=>({
  member,companyId:'company-1',action:'sell',
  sessionId:'staff-1',credentialBinding:staffCredentialBinding(member),...changes
});
test('valid cashier session can only sell',()=>{
  const cashier=person();
  assert.equal(assertStaffAuthority(access(cashier)).role,'cashier');
  for(const action of STAFF_ACTIONS.filter(x=>x!=='sell'))
    assert.throws(()=>assertStaffAuthority(access(cashier,{action})),/denied/);
});
test('owner and supervisor inherit only explicit role permissions',()=>{
  const owner=person({role:'owner'});
  const supervisor=person({role:'supervisor'});
  for(const action of STAFF_ACTIONS)
    assert.equal(assertStaffAuthority(access(owner,{action})).action,action);
  assert.throws(()=>assertStaffAuthority(access(supervisor,{action:'staff'})),/denied/);
});
test('permission override cannot elevate a cashier',()=>{
  const cashier=person({permissions:['sell','staff']});
  assert.throws(()=>assertStaffAuthority(access(cashier,{action:'staff'})),/denied/);
});
test('changed PIN invalidates previously unlocked staff authority',()=>{
  const previous=person(),changed=person({pinHash:'b'.repeat(64)});
  assert.throws(()=>assertStaffAuthority(access(previous,{member:changed})),/denied/);
});
test('changed role invalidates a previous session even if new role is stronger',()=>{
  const before=person(),after=person({role:'supervisor'});
  assert.throws(()=>assertStaffAuthority(access(before,{member:after})),/denied/);
});
test('changed override permissions invalidate old session',()=>{
  const before=person({permissions:['sell']});
  const after=person({permissions:[]});
  assert.throws(()=>assertStaffAuthority(access(before,{member:after})),/denied/);
});
test('disabled staff is denied even if identifier and PIN match',()=>{
  const before=person();
  assert.throws(()=>assertStaffAuthority(access(before,{member:{
    ...before,disabledAt:'2026-10-16T00:00:00.000Z'}})),/denied/);
});
test('foreign company and different staff sessions are denied',()=>{
  assert.throws(()=>assertStaffAuthority(access(person(),{companyId:'foreign'})),/denied/);
  assert.throws(()=>assertStaffAuthority(access(person(),{sessionId:'staff-2'})),/denied/);
});
test('corrupt staff credential and unknown role fail closed',()=>{
  for(const row of [person({pinHash:'x'}),person({role:'admin'}),
    person({permissions:['sell','sell']})])
    assert.throws(()=>staffCredentialBinding(row),/denied/);
});
test('shift must match staff and company and remain open',()=>{
  const staff=person(),shift={id:'shift-1',staffId:staff.id,
    businessProfileId:staff.businessProfileId,openedAt:'2026-10-01T09:00:00Z',
    openingFloatMinor:500};
  assert.equal(assertStaffShift({staff,shift,companyId:'company-1',
    now:1791000000000}).shiftId,'shift-1');
  assert.throws(()=>assertStaffShift({staff,shift:{...shift,staffId:'other'},
    companyId:'company-1',now:1791000000000}),/denied/);
  assert.throws(()=>assertStaffShift({staff,shift:{...shift,closedAt:'2026-10-01T10:00:00Z'},
    companyId:'company-1',now:1791000000000}),/denied/);
});
test('future-dated or malformed shifts cannot be used to authorize cash activity',()=>{
  const staff=person(),shift={id:'shift',staffId:staff.id,
    businessProfileId:'company-1',openedAt:'2099-01-01T00:00:00Z',openingFloatMinor:0};
  assert.throws(()=>assertStaffShift({staff,shift,companyId:'company-1',now:1791000000000}),/denied/);
  assert.throws(()=>assertStaffShift({staff,shift:{...shift,openingFloatMinor:-1},
    companyId:'company-1',now:4102444800000}),/denied/);
});
test('approval bound to cashier generation, company, money and expiry',()=>{
  const approval={company:'company-1',cashierId:'staff-1',
    cashierGeneration:3,approverId:'manager-1',
    amountMinor:100,subtotalMinor:1000,expiresAt:3000};
  const params={approval,companyId:'company-1',cashierId:'staff-1',
    cashierGeneration:3,amountMinor:100,subtotalMinor:1000,now:2000};
  assert.equal(assertExactSupervisorApproval(params),'manager-1');
  for(const override of [{cashierGeneration:4},{companyId:'foreign'},
    {cashierId:'someone'},{amountMinor:99},{subtotalMinor:999},{now:3000}])
    assert.throws(()=>assertExactSupervisorApproval({...params,...override}),/denied/);
});
