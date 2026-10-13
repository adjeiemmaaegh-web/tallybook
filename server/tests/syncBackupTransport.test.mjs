import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {retrieveEncryptedBackup} from '../syncBackupTransport.mjs';
const secret='transport-secret-abcdefghijklmnopqrstuvwxyz-123456789';
const bid='123e4567-e89b-42d3-a456-426614174000';
function token(claims){const body=Buffer.from(JSON.stringify(claims)).toString('base64url');return 'Bearer '+body+'.'+createHmac('sha256',secret).update(body).digest('base64url');}
function setup(){const now=Math.floor(Date.now()/1000);let revoked=false;let reads=0;const headers={organizationId:'orgA',deviceId:'deviceA',authorization:token({v:1,aud:'tallybook-sync',orgId:'orgA',deviceId:'deviceA',scope:'sync:inspect',iat:now-1,exp:now+120}),session:token({v:1,aud:'tallybook-sync-session',actorId:'userA',sessionId:'sessionA',iat:now-1,exp:now+120})};const config={capabilitySecret:secret,sessionSecret:secret,sessionStore:{async getSession(){return {id:'sessionA',actorId:'userA',status:revoked?'revoked':'active'}}},directory:{async getOrganization(){return {id:'orgA',status:'active'}},async getMembership(){return {orgId:'orgA',actorId:'userA',status:'active',role:'owner'}},async getDevice(){return {orgId:'orgA',id:'deviceA',actorId:'userA',status:'active'}}},vault:{async read(org,id){reads++;return {organizationId:org,backupId:id,sha256:'a'.repeat(64),ciphertext:'YWJj',createdAt:'2026-10-09T00:00:00Z'}}}};return {headers,config,revoke(){revoked=true},reads(){return reads}}}
test('returns ciphertext without plaintext or device metadata',async()=>{const x=setup();const r=await retrieveEncryptedBackup(x.headers,bid,x.config);assert.equal(r.ciphertext,'YWJj');assert.equal(r.organizationId,'orgA');assert.equal('deviceId' in r,false);assert.equal(x.reads(),1)});
test('rejects invalid backup ID before reading',async()=>{const x=setup();await assert.rejects(retrieveEncryptedBackup(x.headers,'../etc/passwd',x.config));assert.equal(x.reads(),0)});
test('rejects wrong organization before reading',async()=>{const x=setup();await assert.rejects(retrieveEncryptedBackup({...x.headers,organizationId:'orgB'},bid,x.config));assert.equal(x.reads(),0)});
test('rejects revoked sessions before reading',async()=>{const x=setup();x.revoke();await assert.rejects(retrieveEncryptedBackup(x.headers,bid,x.config));assert.equal(x.reads(),0)});
test('rejects absent vault',async()=>{const x=setup();delete x.config.vault;await assert.rejects(retrieveEncryptedBackup(x.headers,bid,x.config))});
test('rejects vault scope mismatches',async()=>{const x=setup();x.config.vault.read=async()=>({organizationId:'other',backupId:bid,ciphertext:'YWJj',sha256:'a'.repeat(64)});await assert.rejects(retrieveEncryptedBackup(x.headers,bid,x.config))});
