import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, link, symlink, chmod } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServerEnrollmentRegistry } from '../syncEnrollment.mjs';
const initial=()=>({version:1,organizations:[{id:'org1',status:'active'},{id:'org2',status:'active'}],memberships:[{orgId:'org1',actorId:'owner',role:'owner',status:'active'},{orgId:'org1',actorId:'worker',role:'member',status:'active'},{orgId:'org2',actorId:'other',role:'owner',status:'active'}],devices:[],invites:[]});
async function fixture(run){const dir=await mkdtemp(join(tmpdir(),'tally-enroll-'));const file=join(dir,'directory.json');await writeFile(file,JSON.stringify(initial()),{mode:0o600});try{await run(createServerEnrollmentRegistry(file,()=>1000000),file)}finally{await rm(dir,{recursive:true,force:true})}}
test('admin invites member and one-time token enrolls only one device',()=>fixture(async(reg,file)=>{const {token}=await reg.issueInvite({orgId:'org1',administratorId:'owner',targetActorId:'worker'});await reg.enroll({orgId:'org1',actorId:'worker',deviceId:'phone',token});await assert.rejects(reg.enroll({orgId:'org1',actorId:'worker',deviceId:'otherphone',token}));const data=JSON.parse(await readFile(file));assert.equal(data.devices.length,1);assert.equal(data.invites[0].status,'consumed')}));
test('member cannot issue invitations',()=>fixture(async reg=>{await assert.rejects(reg.issueInvite({orgId:'org1',administratorId:'worker',targetActorId:'worker'}))}));
test('cross-org actor cannot redeem token',()=>fixture(async reg=>{const {token}=await reg.issueInvite({orgId:'org1',administratorId:'owner',targetActorId:'worker'});await assert.rejects(reg.enroll({orgId:'org2',actorId:'other',deviceId:'phone',token}))}));
test('wrong actor cannot redeem token',()=>fixture(async reg=>{const {token}=await reg.issueInvite({orgId:'org1',administratorId:'owner',targetActorId:'worker'});await assert.rejects(reg.enroll({orgId:'org1',actorId:'owner',deviceId:'phone',token}))}));
test('parallel enrollment cannot reuse token',()=>fixture(async reg=>{const {token}=await reg.issueInvite({orgId:'org1',administratorId:'owner',targetActorId:'worker'});const results=await Promise.allSettled(['a','b'].map(deviceId=>reg.enroll({orgId:'org1',actorId:'worker',deviceId,token})));assert.equal(results.filter(r=>r.status==='fulfilled').length,1)}));
test('administrator revokes device and status persists',()=>fixture(async(reg,file)=>{const {token}=await reg.issueInvite({orgId:'org1',administratorId:'owner',targetActorId:'worker'});await reg.enroll({orgId:'org1',actorId:'worker',deviceId:'phone',token});await reg.revoke({orgId:'org1',administratorId:'owner',deviceId:'phone'});assert.equal(JSON.parse(await readFile(file)).devices[0].status,'revoked')}));
test('member cannot revoke',()=>fixture(async reg=>{await assert.rejects(reg.revoke({orgId:'org1',administratorId:'worker',deviceId:'phone'}))}));
test('expired invitation is rejected',()=>fixture(async(reg,file)=>{const {token}=await reg.issueInvite({orgId:'org1',administratorId:'owner',targetActorId:'worker'});const later=createServerEnrollmentRegistry(file,()=>1600001);await assert.rejects(later.enroll({orgId:'org1',actorId:'worker',deviceId:'phone',token}));}));

test('independent Node enrollment issuers retain all invitations',()=>fixture(async(reg,file)=>{
  const url=new URL('../syncEnrollment.mjs',import.meta.url).href;
  const source=`import {createServerEnrollmentRegistry} from ${JSON.stringify(url)};
    await createServerEnrollmentRegistry(process.env.TB_ENROLL_FILE,()=>1000000)
      .issueInvite({orgId:'org1',administratorId:'owner',targetActorId:'worker'});`;
  const child=()=>new Promise((resolve,reject)=>{
    const processHandle=spawn(process.execPath,['--input-type=module','-e',source],{env:{...process.env,TB_ENROLL_FILE:file},stdio:['ignore','pipe','pipe']});
    let stderr='';
    processHandle.stderr.on('data',data=>{stderr+=String(data);});
    processHandle.on('error',reject);
    processHandle.on('exit',code=>code===0?resolve():reject(Error(`Enrollment worker ${code}: ${stderr}`)));
  });
  await Promise.all(Array.from({length:5},child));
  const state=JSON.parse(await readFile(file,'utf8'));
  assert.equal(state.invites.length,5);
  assert.equal(new Set(state.invites.map(row=>row.hash)).size,5);
}));

test('enrollment refuses symlink and hardlink registry, and insecure parent',()=>fixture(async(reg,file)=>{
  const {dirname}=await import('node:path');
  const initial=await readFile(file,'utf8');
  await link(file,file+'.linked');
  await assert.rejects(reg.issueInvite({orgId:'org1',administratorId:'owner',targetActorId:'worker'}),/Unsafe enrollment registry/);
  await rm(file+'.linked');
  await chmod(dirname(file),0o755);
  await assert.rejects(reg.issueInvite({orgId:'org1',administratorId:'owner',targetActorId:'worker'}),/Unsafe enrollment directory/);
  await chmod(dirname(file),0o700);
  await rm(file);
  await writeFile(file+'.real',initial,{mode:0o600});
  await symlink(file+'.real',file);
  await assert.rejects(reg.issueInvite({orgId:'org1',administratorId:'owner',targetActorId:'worker'}),{code:'ELOOP'});
  assert.equal(await readFile(file+'.real','utf8'),initial);
}));
