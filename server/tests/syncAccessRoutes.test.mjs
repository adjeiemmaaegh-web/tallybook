import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createAccessLimiter,createAccessActions,isDirectTls} from '../syncAccessRoutes.mjs';
import {hashLoginPassword} from '../syncLogin.mjs';
import {verifySyncSession} from '../syncSession.mjs';
const secret='q'.repeat(48);
const clock=()=>1760000000000;
async function fixture(fn){
 const dir=await mkdtemp(join(tmpdir(),'tb-access-'));
 const login=join(dir,'users.json'),sessions=join(dir,'sessions.json'),enrollment=join(dir,'enrollment.json');
 const credentials=await hashLoginPassword('test-password-secure');
 await writeFile(login,JSON.stringify({version:1,users:[{id:'owner',...credentials,status:'active'},{id:'staff',...credentials,status:'active'}]}),{mode:0o600});
 await writeFile(sessions,JSON.stringify({version:1,sessions:[]}),{mode:0o600});
 await writeFile(enrollment,JSON.stringify({version:1,organizations:[{id:'shop',status:'active'}],memberships:[{orgId:'shop',actorId:'owner',role:'owner',status:'active'},{orgId:'shop',actorId:'staff',role:'member',status:'active'}],devices:[],invites:[]}),{mode:0o600});
 try {await fn(createAccessActions({loginDirectoryFile:login,sessionFile:sessions,sessionSecret:secret,enrollmentFile:enrollment,clock}),{sessions});} finally {await rm(dir,{recursive:true,force:true});}
}
test('limiter caps requests and recovers after time window',()=>{let now=0;const l=createAccessLimiter({limit:2,windowMs:1000,clock:()=>now});assert.equal(l.allow('a'),true);assert.equal(l.allow('a'),true);assert.equal(l.allow('a'),false);now=1001;assert.equal(l.allow('a'),true);});
test('direct TLS cannot be forged with proxy header',()=>{assert.equal(isDirectTls({socket:{encrypted:false},headers:{'x-forwarded-proto':'https'}}),false);assert.equal(isDirectTls({socket:{encrypted:true}}),true);});
test('login issues verifiable short-lived signed session and denies bad password',async()=>fixture(async a=>{const r=await a.login({userId:'owner',password:'test-password-secure'},'one');assert.equal(verifySyncSession('Bearer '+r.session,secret,clock()).actorId,'owner');await assert.rejects(()=>a.login({userId:'owner',password:'wrong'},'two'));}));
test('owner can invite and staff can redeem once; unauthorized invite denied',async()=>fixture(async a=>{const owner=await a.login({userId:'owner',password:'test-password-secure'},'owner');const staff=await a.login({userId:'staff',password:'test-password-secure'},'staff');const o='Bearer '+owner.session,s='Bearer '+staff.session;await assert.rejects(()=>a.invite({orgId:'shop',targetActorId:'owner'},s,'x'));const invite=await a.invite({orgId:'shop',targetActorId:'staff'},o,'y');const enrolled=await a.enroll({orgId:'shop',deviceId:'staff-phone',token:invite.token},s,'z');assert.equal(enrolled.status,'active');await assert.rejects(()=>a.enroll({orgId:'shop',deviceId:'second-phone',token:invite.token},s,'z'));const revoked=await a.revoke({orgId:'shop',deviceId:'staff-phone'},o,'k');assert.equal(revoked.status,'revoked');}));
test('missing session denies enrollment and revocation',async()=>fixture(async a=>{await assert.rejects(()=>a.enroll({orgId:'shop',deviceId:'any',token:'a'.repeat(43)},undefined,'x'));await assert.rejects(()=>a.revoke({orgId:'shop',deviceId:'any'},undefined,'y'));}));
