import {afterEach,expect,it,vi} from 'vitest';
import {fireEvent,render,screen,waitFor} from '@testing-library/react';
import {syncBoundaryFixture,closeSyncFixture} from '@/test/syncBoundaryFixture';
import {createStaff,lockStaff,unlockStaff} from '@/features/staff/staff';
import {inspectRemoteClaim} from './reconciliation';
import {SyncConflictReview} from './SyncConflictReview';
const fixtures:Awaited<ReturnType<typeof syncBoundaryFixture>>[]=[];
afterEach(async()=>{vi.restoreAllMocks();for(const f of fixtures.splice(0))await closeSyncFixture(f);});

it('owner sees only the decisions allowed for each conflict, must give a reason, and the saved decision is audited and removed from the list',async()=>{
 const f=await syncBoundaryFixture();fixtures.push(f);const {db,event}=f;
 expect(await inspectRemoteClaim(db,{...event,payloadDigest:'c'.repeat(64)})).toBe('payload-mismatch');
 const onChanged=vi.fn();
 render(<SyncConflictReview database={db} companyId="primary" onChanged={onChanged}/>);
 expect(await screen.findByText(/reported different details/)).toBeTruthy();
 expect(screen.queryByLabelText(/same operation delivered twice/)).toBeNull();        // not allowed for a payload mismatch
 const save=screen.getByRole('button',{name:'Save decision'}) as HTMLButtonElement;
 fireEvent.click(screen.getByLabelText(/Keep this device's record/));
 expect(save.disabled).toBe(true);                                                     // reason required
 fireEvent.change(screen.getByLabelText(/Reason for conflict/),{target:{value:'Local receipt is the signed original'}});
 expect(save.disabled).toBe(false);
 fireEvent.click(save);
 expect(await screen.findByText(/No unresolved sync conflicts/)).toBeTruthy();
 expect(onChanged).toHaveBeenCalled();
 const c=await db.syncConflicts.get(`primary:${event.id}`);
 expect(c).toMatchObject({status:'resolved',resolution:{decision:'keep-local',note:'Local receipt is the signed original'}});
 expect((await db.staffAudits.toArray()).filter(a=>a.action==='sync.conflict.resolved')).toHaveLength(1);
});

it('a cashier is asked for the owner and cannot see or resolve conflicts',async()=>{
 const f=await syncBoundaryFixture();fixtures.push(f);const {db,event}=f;
 expect(await inspectRemoteClaim(db,{...event,payloadDigest:'d'.repeat(64)})).toBe('payload-mismatch');
 const cashier=await createStaff('Till','cashier','246810',db);
 lockStaff('primary');await unlockStaff(cashier.id,'246810',db);
 render(<SyncConflictReview database={db} companyId="primary"/>);
 expect(await screen.findByText(/Unlock the owner account/)).toBeTruthy();
 expect(screen.queryByRole('button',{name:'Save decision'})).toBeNull();
 await waitFor(async()=>expect((await db.syncConflicts.get(`primary:${event.id}`))?.status).toBe('unresolved'));
});
