import test from 'node:test';
import assert from 'node:assert/strict';
import {assertRun5ScopedJson} from '../run5TenantScope.mjs';
const tenant='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const foreign='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
test('scoped JSON allows plain nested records and immutable-looking metadata',()=>{
 const input={companyId:tenant,rows:[{data:{business_id:tenant,taxRate:0.15},amountMinor:10}]};
 assert.equal(assertRun5ScopedJson(input,tenant),input);
});
test('scope guard rejects every known nested tenant spelling',()=>{
 for(const key of ['companyId','businessId','businessProfileId','organizationId','tenantId',
   'company_id','business_id','business_profile_id','organization_id','tenant_id']){
  assert.throws(()=>assertRun5ScopedJson({children:[{[key]:foreign}]},tenant),/scope denied/);
 }
});
test('scope guard rejects suspicious prototypes, getters and prototype-pollution keys',()=>{
 const x=Object.create(null);x.companyId=tenant;
 assert.equal(assertRun5ScopedJson(x,tenant),x);
 for(const bad of [new Date(),Object.create({companyId:tenant}),
  JSON.parse('{"__proto__":{}}'),JSON.parse('{"constructor":{}}')])
  assert.throws(()=>assertRun5ScopedJson(bad,tenant),/scope denied/);
 const getter={};Object.defineProperty(getter,'x',{enumerable:true,get(){throw Error('executed');}});
 assert.throws(()=>assertRun5ScopedJson(getter,tenant),/scope denied/);
});
test('scope guard fails closed on cycles, unusual values and exhaustion',()=>{
 const loop={};loop.loop=loop;
 let deep={};for(let i=0;i<26;i++)deep={child:deep};
 for(const value of [loop,deep,BigInt(2),()=>0,Number.POSITIVE_INFINITY,[undefined],
   new Array(1025).fill('x')])
  assert.throws(()=>assertRun5ScopedJson(value,tenant),/scope denied/);
});
