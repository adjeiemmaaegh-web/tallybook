import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { createHmac } from 'node:crypto';
import { verifySyncCapability, checkSyncRequestScope, validateSyncClaims } from '../syncAuth.mjs';
const secret = 's'.repeat(48);
const now = Date.UTC(2026, 9, 9);
const claims = {v:1,aud:'tallybook-sync',orgId:'shopA',deviceId:'device1',scope:'sync:inspect',iat:now/1000,exp:now/1000+300};
function sign(data) {const p=Buffer.from(JSON.stringify(data)).toString('base64url');return 'Bearer '+p+'.'+createHmac('sha256',secret).update(p).digest('base64url')}
test('valid short-lived scoped capability',()=>{const result=verifySyncCapability(sign(claims),secret,now);assert.equal(result.orgId,'shopA');checkSyncRequestScope(result,'shopA','device1')});
test('rejects changed signature',()=>assert.throws(()=>verifySyncCapability(sign(claims)+'x',secret,now)));
test('rejects expired token',()=>assert.throws(()=>verifySyncCapability(sign({...claims,exp:now/1000-1}),secret,now)));
test('rejects scope mismatch',()=>assert.throws(()=>checkSyncRequestScope(validateSyncClaims(claims,now),'shopB','device1')));
test('rejects excessively long validity',()=>assert.throws(()=>verifySyncCapability(sign({...claims,exp:now/1000+3600}),secret,now)));
test('rejects weak/unconfigured key',()=>assert.throws(()=>verifySyncCapability(sign(claims),'abc',now)));
test('rejects write capability scope',()=>assert.throws(()=>verifySyncCapability(sign({...claims,scope:'sync:write'}),secret,now)));
