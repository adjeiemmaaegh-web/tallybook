/** ST26-04: owner-only, audited, write-once resolution of recorded sync conflicts. Never applies remote money or stock. */
import {afterEach,expect,it,vi} from 'vitest';
import {syncBoundaryFixture,closeSyncFixture} from '@/test/syncBoundaryFixture';
import {createStaff,lockStaff,unlockStaff} from '@/features/staff/staff';
import {RESTORE_JOURNAL_KEY} from '@/features/backup/restoreJournal.mjs';
import {auditLocalIntegrity} from '@/features/reliability/integrity';
import {inspectRemoteClaim,listUnresolvedSyncConflicts,resolveSyncConflict,verifySyncConflictResolutions} from './reconciliation';
const fixtures:Awaited<ReturnType<typeof syncBoundaryFixture>>[]=[];
const setup=async()=>{const f=await syncBoundaryFixture();fixtures.push(f);return f;};
afterEach(async()=>{vi.restoreAllMocks();for(const f of fixtures.splice(0))await closeSyncFixture(f);});
const ledger=(db:Awaited<ReturnType<typeof setup>>['db'])=>Promise.all(db.tables.filter(t=>!['syncConflicts','staffAudits'].includes(t.name)).map(async t=>({name:t.name,rows:await t.toArray()})));

it('owner resolves each kind of conflict once, with a reason; the ledger is untouched and the audit trail matches',async()=>{
 const {db,event}=await setup();
 expect(await inspectRemoteClaim(db,{...event,id:'unknown-1',operationId:'unknown-op'})).toBe('unknown-event');
 expect(await inspectRemoteClaim(db,{...event,payloadDigest:'b'.repeat(64)})).toBe('payload-mismatch');
 expect(await inspectRemoteClaim(db,{...event,id:'other-event-id'})).toBe('operation-collision');
 const before=await ledger(db);
 const [unknown,mismatch,collision]=['primary:unknown-1',`primary:${event.id}`,'primary:other-event-id'];
 const r1=await resolveSyncConflict(db,unknown,{decision:'escalate',note:'Seen on another till; needs server check'});
 expect(r1).toMatchObject({status:'resolved',resolution:{decision:'escalate',note:'Seen on another till; needs server check'}});
 await resolveSyncConflict(db,mismatch,{decision:'keep-local',note:'Local receipt is the signed original'});
 await resolveSyncConflict(db,collision,{decision:'duplicate-delivery',note:'Same sale delivered twice'});
 expect(await listUnresolvedSyncConflicts(db,'primary')).toEqual([]);
 expect(await ledger(db)).toEqual(before);                                                       // no money, stock or outbox change
 const audits=(await db.staffAudits.toArray()).filter(a=>a.action==='sync.conflict.resolved');
 expect(audits).toHaveLength(3);
 expect(verifySyncConflictResolutions(await db.syncConflicts.toArray(),await db.staffAudits.toArray())).toEqual([]);
 expect((await auditLocalIntegrity(db)).issues.filter(i=>i.code==='sync-conflict-resolution')).toEqual([]);
 await expect(resolveSyncConflict(db,mismatch,{decision:'escalate',note:'changing my mind'})).rejects.toThrow(/already resolved/);
});

it('refuses decisions that do not fit the conflict, missing reasons, unknown conflicts and non-owners',async()=>{
 const {db,event,owner}=await setup();
 await inspectRemoteClaim(db,{...event,payloadDigest:'c'.repeat(64)});
 const id=`primary:${event.id}`;
 await expect(resolveSyncConflict(db,id,{decision:'duplicate-delivery',note:'not a duplicate at all'})).rejects.toThrow(/not allowed/);
 await expect(resolveSyncConflict(db,id,{decision:'keep-local',note:'  '})).rejects.toThrow(/reason/);
 await expect(resolveSyncConflict(db,'primary:nope',{decision:'keep-local',note:'missing'})).rejects.toThrow(/not found/);
 await expect(resolveSyncConflict(db,'bad id!',{decision:'keep-local',note:'invalid'})).rejects.toThrow(/Invalid/);
 // A cashier cannot resolve.
 const cashier=await createStaff('Till','cashier','246810',db);
 lockStaff('primary');await unlockStaff(cashier.id,'246810',db);
 await expect(resolveSyncConflict(db,id,{decision:'keep-local',note:'cashier tries'})).rejects.toThrow();
 lockStaff('primary');
 await expect(resolveSyncConflict(db,id,{decision:'keep-local',note:'nobody signed in'})).rejects.toThrow();
 await unlockStaff(owner.id,'123456',db);
 expect((await db.syncConflicts.get(id))?.status).toBe('unresolved');
 expect((await db.staffAudits.toArray()).filter(a=>a.action==='sync.conflict.resolved')).toHaveLength(0);
});

it('a session change during resolution rolls everything back; recovery evidence blocks resolution',async()=>{
 const {db,event}=await setup();
 await inspectRemoteClaim(db,{...event,payloadDigest:'d'.repeat(64)});
 const id=`primary:${event.id}`,add=db.staffAudits.add.bind(db.staffAudits);
 vi.spyOn(db.staffAudits,'add').mockImplementationOnce(async row=>{const k=await add(row);lockStaff('primary');return k;});
 await expect(resolveSyncConflict(db,id,{decision:'keep-local',note:'interrupted'})).rejects.toThrow(/session changed/);
 expect((await db.syncConflicts.get(id))?.status).toBe('unresolved');
 expect((await db.staffAudits.toArray()).filter(a=>a.action==='sync.conflict.resolved')).toHaveLength(0);
});

it('recovery evidence blocks resolution',async()=>{
 const {db,event}=await setup();
 await inspectRemoteClaim(db,{...event,payloadDigest:'e'.repeat(64)});
 await db.appMeta.put({key:RESTORE_JOURNAL_KEY,value:'interrupted isolated restore',updatedAt:new Date().toISOString()});
 await expect(resolveSyncConflict(db,`primary:${event.id}`,{decision:'keep-local',note:'during recovery'})).rejects.toThrow(/requires recovery/);
});

it('the integrity audit flags forged resolutions and orphaned audit rows',async()=>{
 const {db,event}=await setup();
 await inspectRemoteClaim(db,{...event,payloadDigest:'f'.repeat(64)});
 const id=`primary:${event.id}`;
 await resolveSyncConflict(db,id,{decision:'keep-local',note:'genuine'});
 const conflicts=await db.syncConflicts.toArray(),audits=await db.staffAudits.toArray();
 const forged=structuredClone(conflicts);forged[0].resolution!.decision='escalate'; // allowed for this kind, so only the audit cross-check can catch it
 expect(verifySyncConflictResolutions(forged,audits)).toEqual([id]);
 const noAudit=audits.filter(a=>a.action!=='sync.conflict.resolved');
 expect(verifySyncConflictResolutions(conflicts,noAudit)).toEqual([id]);
 const reopened=structuredClone(conflicts);reopened[0].status='unresolved';
 expect(verifySyncConflictResolutions(reopened,audits)).toContain(id);
 expect(verifySyncConflictResolutions([],audits)).toEqual([`sync-conflict-${id}`]);
 await db.syncConflicts.put(forged[0]);
 expect((await auditLocalIntegrity(db)).issues.map(i=>i.code)).toContain('sync-conflict-resolution');
});
