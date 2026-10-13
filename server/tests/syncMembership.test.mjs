import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { authorizeSyncInspect, disabledSyncIdentityDirectory } from '../syncMembership.mjs';
const claims={orgId:'org1',deviceId:'device1',scope:'sync:inspect'};
const directory={
  async getOrganization(id){return {id,status:'active'}},
  async getMembership(orgId,actorId){return {orgId,actorId,status:'active',role:'owner'}},
  async getDevice(orgId,id){return {orgId,id,actorId:'user1',status:'active'}}
};
const run=(d=directory,a='user1',c=claims)=>authorizeSyncInspect(c,d,a);
test('authorizes active org, membership, and actor-bound device',async()=>{const x=await run();assert.deepEqual(x,{orgId:'org1',deviceId:'device1',actorId:'user1',role:'owner',scope:'sync:inspect'});assert(Object.isFrozen(x))});
test('rejects unknown session actor',async()=>assert.rejects(run(directory,null)));
test('denies missing authoritative directory',async()=>assert.rejects(run(null)));
test('denies disabled default directory',async()=>assert.rejects(run(disabledSyncIdentityDirectory)));
test('rejects disabled organization',async()=>assert.rejects(run({...directory,getOrganization:async id=>({id,status:'disabled'})})));
test('rejects inactive membership',async()=>assert.rejects(run({...directory,getMembership:async(orgId,actorId)=>({orgId,actorId,status:'revoked',role:'owner'})})));
test('rejects role not allowlisted',async()=>assert.rejects(run({...directory,getMembership:async(orgId,actorId)=>({orgId,actorId,status:'active',role:'root'})})));
test('rejects revoked device',async()=>assert.rejects(run({...directory,getDevice:async(orgId,id)=>({orgId,id,actorId:'user1',status:'revoked'})})));
test('rejects device registered to another actor',async()=>assert.rejects(run({...directory,getDevice:async(orgId,id)=>({orgId,id,actorId:'user2',status:'active'})})));
test('rejects cross-org record injection',async()=>assert.rejects(run({...directory,getDevice:async(_orgId,id)=>({orgId:'other',id,actorId:'user1',status:'active'})})));
test('rejects directory exceptions',async()=>assert.rejects(run({...directory,getDevice:async()=>{throw Error('DB down')}})));
test('rejects write scope',async()=>assert.rejects(run(directory,'user1',{...claims,scope:'sync:write'})));
