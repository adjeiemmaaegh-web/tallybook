import test from 'node:test';
import assert from 'node:assert/strict';
import {assertCompanyScope} from '../client/src/features/business/companyScope.mjs';
test('unchanged active company permits returning captured records',()=>{
  assert.equal(assertCompanyScope('business-one','business-one'),'business-one');
});
test('switch to another company fails closed before exposing stale snapshots',()=>{
  for(const active of ['business-two','',undefined,null])
    assert.throws(()=>assertCompanyScope('business-one',active),/Company changed/);
});
test('missing or forged captured company cannot authorize a write',()=>{
  for(const expected of ['',undefined,null,12,{}])
    assert.throws(()=>assertCompanyScope(expected,'business-one'),/Company changed/);
});
test('company identity is exact and never normalized into a different business',()=>{
  assert.throws(()=>assertCompanyScope('Business-One','business-one'),/Company changed/);
  assert.throws(()=>assertCompanyScope(' business-one','business-one'),/Company changed/);
});
