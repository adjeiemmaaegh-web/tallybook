import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {stageAuthenticatedEvent} from '../syncEventDelivery.mjs';
const secret='integration-test-secret-0123456789-abcdefghijklmnopqrstuvwxyz';
const sign=claims=>{const b=Buffer.from(JSON.stringify(claims)).toString('base64url');return 'Bearer '+b+'.'+createHmac('sha256',secret).update(b).digest('base64url')};
function fixture(scope='sync:stage'){
 const now=Math.floor(Date.now()/1000);let state='active';let calls=0;
 const headers={organizationId:'org1',deviceId:'dev1',authorization:sign({v:1,aud:'tallybook-sync',orgId:'org1',deviceId:'dev1',scope,iat:now-2,exp:now+120}),session:sign({v:1,aud:'tallybook-sync-session',actorId:'actor1',sessionId:'sess1',iat:now-2,exp:now+120})};
 const config={capabilitySecret:secret,sessionSecret:secret,sessionStore:{async getSession(id){return {id,actorId:'actor1',status:state}}},directory:{async getOrganization(id){return {id,status:'active'}},async getMembership(orgId,actorId){return {orgId,actorId,status:'active',role:'member'}},async getDevice(orgId,id){return {orgId,id,actorId:'actor1',status:'active'}}},journal:{async stageEvent(){calls++;return {status:'stored',reason:null}}}};
 const event={organizationId:'org1',deviceId:'dev1',eventId:'evt1',operationId:'op1',payloadDigest:'a'.repeat(64)};
 return {headers,config,event,stop(){state='revoked'},calls(){return calls}};
}
test('durable journal result yields limited acknowledgement',async()=>{const x=fixture();assert.deepEqual(await stageAuthenticatedEvent(x.headers,x.event,x.config),{organizationId:'org1',eventId:'evt1',operationId:'op1',status:'stored',reason:null,financialReplicationEnabled:false});assert.equal(x.calls(),1)});
test('read-only capability cannot stage an event',async()=>{const x=fixture('sync:inspect');await assert.rejects(stageAuthenticatedEvent(x.headers,x.event,x.config));assert.equal(x.calls(),0)});
test('backup-write capability cannot stage an event',async()=>{const x=fixture('backup:write');await assert.rejects(stageAuthenticatedEvent(x.headers,x.event,x.config));assert.equal(x.calls(),0)});
test('cross-company payload is denied before journal mutation',async()=>{const x=fixture();await assert.rejects(stageAuthenticatedEvent(x.headers,{...x.event,organizationId:'other'},x.config));assert.equal(x.calls(),0)});
test('revoked human session fails closed',async()=>{const x=fixture();x.stop();await assert.rejects(stageAuthenticatedEvent(x.headers,x.event,x.config));assert.equal(x.calls(),0)});
test('revoked device fails closed',async()=>{const x=fixture();x.config.directory.getDevice=async(orgId,id)=>({orgId,id,actorId:'actor1',status:'revoked'});await assert.rejects(stageAuthenticatedEvent(x.headers,x.event,x.config));assert.equal(x.calls(),0)});
test('missing journal fails closed',async()=>{const x=fixture();delete x.config.journal;await assert.rejects(stageAuthenticatedEvent(x.headers,x.event,x.config))});
test('duplicate acknowledgment requires exact-event classification',async()=>{const x=fixture();x.config.journal.stageEvent=async()=>({status:'duplicate',reason:'same-event'});assert.equal((await stageAuthenticatedEvent(x.headers,x.event,x.config)).status,'duplicate');x.config.journal.stageEvent=async()=>({status:'duplicate',reason:'other'});await assert.rejects(stageAuthenticatedEvent(x.headers,x.event,x.config))});
test('conflict does not claim successful replication',async()=>{const x=fixture();x.config.journal.stageEvent=async()=>({status:'conflict',reason:'operation-id-reuse'});const result=await stageAuthenticatedEvent(x.headers,x.event,x.config);assert.equal(result.status,'conflict');assert.equal(result.financialReplicationEnabled,false)});
