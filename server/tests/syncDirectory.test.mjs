import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm,symlink,link,chmod} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createSnapshotDirectory,createReadOnlyFileDirectory} from '../syncDirectory.mjs';
import {authorizeSyncInspect} from '../syncMembership.mjs';
const snapshot=()=>({version:1,organizations:[{id:'org1',status:'active'}],memberships:[{orgId:'org1',actorId:'user1',status:'active',role:'owner'}],devices:[{orgId:'org1',id:'device1',actorId:'user1',status:'active'}]});
const claims={orgId:'org1',deviceId:'device1',scope:'sync:inspect'};
test('directory authorizes only exact organization, membership and device',async()=>{
  const dir=createSnapshotDirectory(snapshot());
  assert.equal((await authorizeSyncInspect(claims,dir,'user1')).role,'owner');
  await assert.rejects(authorizeSyncInspect(claims,dir,'other'));
});
test('rejects duplicate and cross-organization records',()=>{
  const s=snapshot();s.devices.push({...s.devices[0]});assert.throws(()=>createSnapshotDirectory(s));
  const q=snapshot();q.devices[0].orgId='other';assert.throws(()=>createSnapshotDirectory(q));
});
test('revocation is enforced on next file reload',async()=>{
  const folder=await mkdtemp(join(tmpdir(),'tbdir-'));const path=join(folder,'directory.json');
  try {
    await writeFile(path,JSON.stringify(snapshot()),{mode:0o600});
    const source=createReadOnlyFileDirectory(path);
    assert.equal((await authorizeSyncInspect(claims,await source.authorizeSnapshot(),'user1')).role,'owner');
    const revoked=snapshot();revoked.devices[0].status='revoked';
    await writeFile(path,JSON.stringify(revoked),{mode:0o600});
    await assert.rejects(authorizeSyncInspect(claims,await source.authorizeSnapshot(),'user1'));
  }finally{await rm(folder,{recursive:true,force:true});}
});
test('unsafe file modes deny access',async()=>{
 const folder=await mkdtemp(join(tmpdir(),'tbdir-'));const path=join(folder,'worldwrite.json');
 try {await writeFile(path,JSON.stringify(snapshot()),{mode:0o666});const {chmod}=await import('node:fs/promises');await chmod(path,0o666);await assert.rejects(createReadOnlyFileDirectory(path).authorizeSnapshot());}
 finally {await rm(folder,{recursive:true,force:true});}
});

test('directory refuses symlink, hardlink and world-readable files',async()=>{
 const folder=await mkdtemp(join(tmpdir(),'tbdir-safe-'));const target=join(folder,'directory.json');const alias=join(folder,'alias.json');
 try {
   await writeFile(target,JSON.stringify(snapshot()),{mode:0o600});
   await symlink(target,alias);
   await assert.rejects(createReadOnlyFileDirectory(alias).authorizeSnapshot(),{code:'ELOOP'});
   await rm(alias);
   await link(target,alias);
   await assert.rejects(createReadOnlyFileDirectory(target).authorizeSnapshot(),/Unsafe directory file/);
   await rm(alias);
   await chmod(target,0o644);
   await assert.rejects(createReadOnlyFileDirectory(target).authorizeSnapshot(),/Unsafe directory file/);
 } finally {await rm(folder,{recursive:true,force:true});}
});
test('directory refuses unsafe parent permissions and parent symlinks',async()=>{
 const folder=await mkdtemp(join(tmpdir(),'tbdir-parent-'));const target=join(folder,'directory.json');
 try {
   await writeFile(target,JSON.stringify(snapshot()),{mode:0o600});
   await chmod(folder,0o755);
   await assert.rejects(createReadOnlyFileDirectory(target).authorizeSnapshot(),/Unsafe directory parent/);
   await chmod(folder,0o700);
   const linked=folder+'-link';
   await symlink(folder,linked,'dir');
   try {await assert.rejects(createReadOnlyFileDirectory(join(linked,'directory.json')).authorizeSnapshot(),/Unsafe directory parent/);}
   finally {await rm(linked);}
 } finally {await rm(folder,{recursive:true,force:true});}
});
