import test from 'node:test';
import assert from 'node:assert/strict';
import { createRecoveryApprovalTransactionMethods } from '../recoveryApprovalPostgres.mjs';

test('persists a verified recovery proof and its reviewer audit with parameterized SQL', async () => {
  const calls = [];
  const tx = createRecoveryApprovalTransactionMethods({ async query(sql,params) {
    calls.push({sql,params}); return {rowCount:1};
  }});
  await tx.putRecovery({id:'proof',companyId:'company',ownerId:'owner',localCompanyId:'local',
    kind:'verified-restore',status:'unused',expiresAt:600000});
  await tx.appendApprovalAudit({type:'recovery-approval-created',companyId:'company',
    reviewerId:'reviewer',evidenceId:'proof',at:1000});
  assert.equal(calls.length,2);
  assert.ok(calls[0].sql.includes('values($1,$2,$3,$4,$5,$6,$7,'));
  assert.deepEqual(calls[0].params.slice(0,3),['proof','company','owner']);
  assert.equal(calls[1].params[2],'proof');
});
test('invalid proofs and audits fail without SQL requests',async()=>{
  const calls=[];
  const tx=createRecoveryApprovalTransactionMethods({async query(...a){calls.push(a);return {rowCount:1};}});
  await assert.rejects(tx.putRecovery({kind:'unknown',status:'unused',expiresAt:1000}));
  await assert.rejects(tx.putRecovery({kind:'verified-restore',status:'used',expiresAt:1000}));
  await assert.rejects(tx.appendApprovalAudit({type:'other',at:1000}));
  assert.equal(calls.length,0);
});
test('failed writes reject for rollback by the encompassing transaction',async()=>{
  const tx=createRecoveryApprovalTransactionMethods({async query(){return {rowCount:0};}});
  await assert.rejects(tx.putRecovery({id:'p',companyId:'c',ownerId:'o',kind:'verified-restore',status:'unused',expiresAt:1000}),/conflict/);
  await assert.rejects(tx.appendApprovalAudit({type:'recovery-approval-created',at:1000}),/conflict/);
});
