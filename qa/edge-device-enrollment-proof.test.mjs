import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {deviceKeyEnrollmentBytes} from '../server/storeDeviceEnrollment.mjs';
import {verifyEnrollmentProof} from '../supabase/functions/tallybook-run3-qa/enrollmentProof.mjs';
test('Edge enrollment verifier interoperates with the existing signed contract and rejects scope substitution',async()=>{
 const {privateKey,publicKey}=generateKeyPairSync('ed25519');
 const scope={token:'a'.repeat(64),companyId:'11111111-1111-4111-8111-111111111111',
  userId:'22222222-2222-4222-8222-222222222222',storeId:'shopA',staffId:'staffA',
  deviceId:'deviceA',publicKeySpkiPem:publicKey.export({type:'spki',format:'pem'})};
 const proofSignature=sign(null,deviceKeyEnrollmentBytes(scope),privateKey).toString('base64url');
 assert.equal(await verifyEnrollmentProof({...scope,proofSignature}),true);
 for(const change of [{token:'b'.repeat(64)},{storeId:'shopB'},{staffId:'staffB'},
  {deviceId:'deviceB'},{userId:'33333333-3333-4333-8333-333333333333'},
  {companyId:'44444444-4444-4444-8444-444444444444'},{proofSignature:'A'.repeat(86)}])
  assert.equal(await verifyEnrollmentProof({...scope,proofSignature,...change}),false);
});
