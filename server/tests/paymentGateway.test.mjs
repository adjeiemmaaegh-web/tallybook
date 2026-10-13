import test from 'node:test';
import assert from 'node:assert/strict';
import { createPaymentGateway } from '../paymentGateway.mjs';
const input = {companyId:'shop-a',submissionKey:'order-one',amountMinor:1000,currency:'GHS',method:'mobile'};
const event = (action,eventId,rest={}) => ({companyId:input.companyId,submissionKey:input.submissionKey,action,eventId,...rest});
test('payments default off; no configured provider or production mock is approved',()=>{
  assert.throws(()=>createPaymentGateway().createIntent(input),/disabled/);
  for(const config of [{mode:'live'},{mode:'mock',environment:'production'},{mode:'some-provider',environment:'local-test'}]) assert.throws(()=>createPaymentGateway(config),/No provider/);
});
test('mock intent retries preserve identity, amount, currency, method and company isolation',()=>{
  const gateway=createPaymentGateway({mode:'mock',environment:'local-test'});
  const first=gateway.createIntent(input);first.amountMinor=1;
  assert.equal(gateway.createIntent(input).amountMinor,1000);
  for(const change of [{amountMinor:2000},{currency:'USD'},{method:'card'}]) assert.throws(()=>gateway.createIntent({...input,...change}),/idempotency/);
  assert.throws(()=>gateway.inspect('shop-b',input.submissionKey),/not found/);
  assert.equal(gateway.createIntent({...input,companyId:'shop-b',method:'card'}).status,'pending');
  assert.throws(()=>gateway.createIntent({...input,submissionKey:'overflow',amountMinor:Number.MAX_SAFE_INTEGER+1}),/amount/);
});
test('timeout is unresolved, success and refund events are idempotent, excess refunds roll back',()=>{
  const g=createPaymentGateway({mode:'mock',environment:'local-test'}); g.createIntent(input);
  assert.equal(g.simulate(event('timeout','timeout')).status,'pending');
  assert.equal(g.simulate(event('succeed','success')).status,'succeeded');
  assert.equal(g.simulate(event('succeed','success')).status,'succeeded');
  assert.throws(()=>g.simulate(event('fail','success')),/Conflicting/);
  assert.equal(g.simulate(event('refund','partial',{refundMinor:400})).refundedMinor,400);
  assert.equal(g.simulate(event('refund','partial',{refundMinor:400})).refundedMinor,400);
  assert.throws(()=>g.simulate(event('refund','excess',{refundMinor:601})),/exceeds/);
  assert.equal(g.inspect(input.companyId,input.submissionKey).refundedMinor,400);
  assert.equal(g.simulate(event('refund','balance',{refundMinor:600})).status,'refunded');
});
test('failed collections cannot be refunded and chargebacks terminate captured mock payments',()=>{
  const g=createPaymentGateway({mode:'mock',environment:'local-test'});g.createIntent(input);
  assert.equal(g.simulate(event('fail','failed')).status,'failed');
  assert.throws(()=>g.simulate(event('refund','bad',{refundMinor:1})),/transition/);
  const h=createPaymentGateway({mode:'mock',environment:'local-test'});h.createIntent(input);h.simulate(event('succeed','ok'));
  assert.equal(h.simulate(event('chargeback','dispute')).status,'charged-back');
  assert.throws(()=>h.simulate(event('succeed','again')),/transition/);
});
