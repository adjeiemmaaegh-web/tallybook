import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { inspectSyncTransport } from '../syncTransport.mjs';
const secret='integration-test-secret-0123456789-abcdefghijklmnopqrstuvwxyz';
function sign(claims){const body=Buffer.from(JSON.stringify(claims)).toString('base64url');return 'Bearer '+body+'.'+createHmac('sha256',secret).update(body).digest('base64url')}
function setup(){const now=Math.floor(Date.now()/1000);let state='active';const headers={organizationId:'org1',deviceId:'dev1',authorization:sign({v:1,aud:'tallybook-sync',orgId:'org1',deviceId:'dev1',scope:'sync:inspect',iat:now-2,exp:now+120}),session:sign({v:1,aud:'tallybook-sync-session',actorId:'actor1',sessionId:'sess1',iat:now-2,exp:now+120})};const config={capabilitySecret:secret,sessionSecret:secret,sessionStore:{async getSession(id){return {id,actorId:'actor1',status:state}}},directory:{async getOrganization(id){return {id,status:'active'}},async getMembership(orgId,actorId){return {orgId,actorId,status:'active',role:'owner'}},async getDevice(orgId,id){return {orgId,id,actorId:'actor1',status:'active'}}},journal:{async inspect(){return [{event:{}}]}}};return {headers,config,revoke(){state='revoked'}}}
test('read-only status reports scoped staged count without data',async()=>{const {headers,config}=setup();assert.deepEqual(await inspectSyncTransport(headers,config),{connected:true,organizationId:'org1',stagedEvents:1,uploadsEnabled:false,financialReplicationEnabled:false})});
test('rejects mismatched organization header',async()=>{const {headers,config}=setup();await assert.rejects(inspectSyncTransport({...headers,organizationId:'org2'},config))});
test('rejects missing session',async()=>{const {headers,config}=setup();await assert.rejects(inspectSyncTransport({...headers,session:undefined},config))});
test('rejects revoked session',async()=>{const x=setup();x.revoke();await assert.rejects(inspectSyncTransport(x.headers,x.config))});
test('rejects revoked device',async()=>{const {headers,config}=setup();config.directory.getDevice=async(orgId,id)=>({orgId,id,actorId:'actor1',status:'revoked'});await assert.rejects(inspectSyncTransport(headers,config))});
test('fails closed without journal',async()=>{const {headers,config}=setup();delete config.journal;await assert.rejects(inspectSyncTransport(headers,config))});
test('fails closed for missing identity directory',async()=>{const {headers,config}=setup();delete config.directory;await assert.rejects(inspectSyncTransport(headers,config))});
