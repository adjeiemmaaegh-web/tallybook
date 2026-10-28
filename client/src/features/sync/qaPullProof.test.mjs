import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {validateQaPullChallenge,qaPullSigningBytes,signQaPullChallenge} from './qaPullProof.mjs';

const scope={companyId:'11111111-1111-4111-8111-111111111111',deviceId:'shop-device-a',
  afterUtc:'1970-01-01T00:00:00Z',afterOperationId:''};
const userId='22222222-2222-4222-8222-222222222222';
const challenge={challengeId:'33333333-3333-4333-8333-333333333333',
  nonce:'A'.repeat(43),expiresAtEpochMs:60_000};

test('active non-extractable key signs a scoped one-use pull and tampering breaks verification',async()=>{
  const keys=await webcrypto.subtle.generateKey('Ed25519',false,['sign','verify']);
  const proof=await signQaPullChallenge(scope,userId,challenge,keys.privateKey,webcrypto.subtle);
  const signature=Buffer.from(proof.replace(/-/g,'+').replace(/_/g,'/'),'base64');
  assert.equal(await webcrypto.subtle.verify('Ed25519',keys.publicKey,signature,
    qaPullSigningBytes(scope,userId,challenge)),true);
  assert.equal(await webcrypto.subtle.verify('Ed25519',keys.publicKey,signature,
    qaPullSigningBytes({...scope,afterOperationId:'next'},userId,challenge)),false);
  assert.equal(await webcrypto.subtle.verify('Ed25519',keys.publicKey,signature,
    qaPullSigningBytes(scope,userId,{...challenge,nonce:'B'.repeat(43)})),false);
});

test('challenge validation rejects a foreign device and stale or implausibly long expiry',()=>{
  assert.deepEqual(validateQaPullChallenge({...challenge,...scope},scope,0),challenge);
  assert.throws(()=>validateQaPullChallenge({...challenge,...scope,deviceId:'other'},scope,0));
  assert.throws(()=>validateQaPullChallenge({...challenge,...scope},scope,60_000));
  assert.throws(()=>validateQaPullChallenge({...challenge,...scope,expiresAtEpochMs:200_000},scope,0));
});

test('extractable keys and invalid cursors fail before a cloud read',async()=>{
  const keys=await webcrypto.subtle.generateKey('Ed25519',true,['sign','verify']);
  await assert.rejects(signQaPullChallenge(scope,userId,challenge,keys.privateKey,webcrypto.subtle));
  assert.throws(()=>qaPullSigningBytes({...scope,afterUtc:'yesterday'},userId,challenge));
});
