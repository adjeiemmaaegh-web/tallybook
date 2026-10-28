import test from 'node:test';
import assert from 'node:assert/strict';
import {validateQaSalePage} from './qaSalePageBoundary.mjs';
const scope={companyId:'11111111-1111-4111-8111-111111111111',deviceId:'qa-device',
 afterUtc:'1970-01-01T00:00:00Z',afterOperationId:''};
const event=(id='op1',time='2026-10-27T13:04:05.123456+00:00')=>({
 operationId:id,eventId:'event-1',storeId:'shop-1',staffId:'staff-1',
 actorId:'22222222-2222-4222-8222-222222222222',
 payloadSha256:'a'.repeat(64),payload:{kind:'sale'},evidenceStatus:'upload_claim_only',
 receivedAtUtc:time
});
const page=(events=[event()])=>({companyId:scope.companyId,deviceId:scope.deviceId,
 storeId:'shop-1',events,hasMore:false,nextReceivedAtUtc:events.at(-1)?.receivedAtUtc??null,
 nextOperationId:events.at(-1)?.operationId??null});
const denied=(v,s=scope)=>assert.throws(()=>validateQaSalePage(v,s),/integrity validation/);
test('accepts empty authorized response',()=>{
 const r=validateQaSalePage(page([]),scope);
 assert.equal(r.events.length,0);assert.equal(Object.isFrozen(r.events),true);
});
test('retains exact microsecond cursor without reformatting to Date',()=>{
 const v=validateQaSalePage(page(),scope);
 assert.equal(v.nextReceivedAtUtc,'2026-10-27T13:04:05.123456+00:00');
});
test('rejects foreign company and device',()=>{
 denied({...page(),companyId:'33333333-3333-4333-8333-333333333333'});
 denied({...page(),deviceId:'foreign'});
});
test('rejects wrong store or forged evidence classification',()=>{
 denied(page([{...event(),storeId:'shop-2'}]));
 denied(page([{...event(),evidenceStatus:'confirmed_physical_sale'}]));
});
test('rejects a repeated operation ID',()=>{
 denied(page([event(),event()]));
});
test('rejects a backwards cursor even within same millisecond',()=>{
 denied(page([event('op2','2026-10-27T13:04:05.123456+00:00'),
    event('op3','2026-10-27T13:04:05.123455+00:00')]));
});
test('rejects forged next cursor and lying hasMore',()=>{
 denied({...page(),nextOperationId:'other'});
 denied({...page(),hasMore:true});
});
test('rejects malformed timestamp, payload and SHA',()=>{
 denied(page([{...event(),receivedAtUtc:'not-a-date'}]));
 denied(page([{...event(),payload:null}]));
 denied(page([{...event(),payloadSha256:'bad'}]));
});
test('rejects unbounded pages',()=>{
 denied(page(Array.from({length:11},(_,i)=>event('op'+i,'2026-10-27T13:04:05.123456+00:00'))));
});
test('permits strictly ordered different operations at same exact microsecond',()=>{
 const v=validateQaSalePage(page([event('op1'),event('op2')]),scope);
 assert.equal(v.events.length,2);
});
