import test from 'node:test';
import assert from 'node:assert/strict';
import {assertRun5TenantAccess,RUN5_ACTIONS} from '../run5TenantPolicy.mjs';
const owner='11111111-1111-4111-8111-111111111111';
const attendant='22222222-2222-4222-8222-222222222222';
const co='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const other='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
function fixture(role='owner'){
  const userId=role==='owner'?owner:attendant;
  return {principal:{userId,sessionId:other,active:true,expiresAtEpochMs:900000},
    company:{id:co,ownerId:owner},
    membership:{companyId:co,userId,role,status:'active'},
    companyId:co,action:'company:read',now:1000};
}
test('canonical owner may read business context',()=>{
  const f=fixture();const result=assertRun5TenantAccess(f);
  assert.equal(result.userId,owner);assert.equal(result.companyId,co);
  assert.ok(Object.isFrozen(result));
});
test('canonical attendant only sees explicitly allowed reads',()=>{
  const f=fixture('attendant');
  assert.equal(assertRun5TenantAccess(f).role,'attendant');
  for(const action of RUN5_ACTIONS.filter(x=>x!=='company:read'))
    assert.throws(()=>assertRun5TenantAccess({...f,action}),/denied/);
});
test('owner may access each declared operation',()=>{
  const f=fixture();
  for(const action of RUN5_ACTIONS)
    assert.equal(assertRun5TenantAccess({...f,action}).action,action);
});
test('unrecognized action rejects instead of permissive fallback',()=>{
  assert.throws(()=>assertRun5TenantAccess({...fixture(),action:'admin:all'}),/denied/);
});
test('foreign business identifier and foreign membership are denied',()=>{
  const f=fixture();
  assert.throws(()=>assertRun5TenantAccess({...f,companyId:other}),/denied/);
  assert.throws(()=>assertRun5TenantAccess({...f,membership:{...f.membership,companyId:other}}),/denied/);
});
test('forged owner membership disagrees with canonical owner ID',()=>{
  const f=fixture();
  assert.throws(()=>assertRun5TenantAccess({...f,company:{id:co,ownerId:attendant}}),/denied/);
});
test('missing/revoked user membership always denies',()=>{
  const f=fixture();
  assert.throws(()=>assertRun5TenantAccess({...f,membership:null}),/denied/);
  assert.throws(()=>assertRun5TenantAccess({...f,membership:{...f.membership,status:'revoked'}}),/denied/);
});
test('expired or unvalidated Supabase principal is denied',()=>{
  const f=fixture();
  assert.throws(()=>assertRun5TenantAccess({...f,now:900000}),/denied/);
  assert.throws(()=>assertRun5TenantAccess({...f,principal:{...f.principal,active:false}}),/denied/);
});
test('attendant cannot impersonate business owner',()=>{
  const f=fixture('attendant');
  assert.throws(()=>assertRun5TenantAccess({...f,company:{id:co,ownerId:attendant}}),/denied/);
});
test('local profile identifiers can never substitute for cloud UUIDs',()=>{
  const f=fixture();
  assert.throws(()=>assertRun5TenantAccess({...f,companyId:'primary'}),/denied/);
});
