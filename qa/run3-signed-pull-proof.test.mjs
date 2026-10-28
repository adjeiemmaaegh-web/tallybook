import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {signQaPullChallenge} from '../client/src/features/sync/qaPullProof.mjs';
import {verifyPullSignature} from '../supabase/functions/tallybook-run3-qa/pullSignature.mjs';

const scope={companyId:'11111111-1111-4111-8111-111111111111',
  deviceId:'device-a',afterUtc:'1970-01-01T00:00:00Z',afterOperationId:''};
const actor='22222222-2222-4222-8222-222222222222';
const challenge={challengeId:'33333333-3333-4333-8333-333333333333',
  nonce:'A'.repeat(43),expiresAtEpochMs:Date.now()+60_000};
const parts=(s=scope,c=challenge)=>['tallybook.central.pull.v1',s.companyId,s.deviceId,
  actor,c.challengeId,c.nonce,s.afterUtc,s.afterOperationId];

test('browser proof verifies at the Edge boundary only for the signed scope',async()=>{
  const pair=await webcrypto.subtle.generateKey('Ed25519',false,['sign','verify']);
  const spki=Buffer.from(await webcrypto.subtle.exportKey('spki',pair.publicKey));
  const pem=`-----BEGIN PUBLIC KEY-----\n${spki.toString('base64')}\n-----END PUBLIC KEY-----\n`;
  const signature=await signQaPullChallenge(scope,actor,challenge,pair.privateKey,webcrypto.subtle);
  assert.equal(await verifyPullSignature(pem,signature,parts(),webcrypto.subtle),true);
  assert.equal(await verifyPullSignature(pem,signature,parts({...scope,afterOperationId:'other'}),webcrypto.subtle),false);
  assert.equal(await verifyPullSignature(pem,signature,parts(scope,{...challenge,nonce:'B'.repeat(43)}),webcrypto.subtle),false);
  assert.equal(await verifyPullSignature(pem,signature.slice(1),parts(),webcrypto.subtle),false);
});
