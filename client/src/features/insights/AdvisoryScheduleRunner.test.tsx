import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {act,cleanup,render,waitFor} from '@testing-library/react';
import {AdvisoryScheduleRunner} from './AdvisoryScheduleRunner';
import {readAdvisorySchedule,runDueAdvisorySchedule} from './advisorySchedule';
import type {AdvisorySchedule} from './advisoryScheduleRules';
const session=vi.hoisted(()=>({staff:'owner' as string|null,company:'primary'}));
vi.mock('./advisorySchedule',()=>({readAdvisorySchedule:vi.fn(),runDueAdvisorySchedule:vi.fn()}));
vi.mock('@/features/staff/staff',()=>({currentStaffId:()=>session.staff,STAFF_SESSION_CHANGED:'tallybook:staff-session'}));
vi.mock('@/features/business/activeCompany',()=>({getActiveBusinessProfileId:()=>session.company}));
const schedule:AdvisorySchedule={version:1,companyId:'primary',ownerStaffId:'owner',revision:1,state:'active',intervalHours:24,kinds:['stock'],nextDueAt:'2026-11-17T00:00:00.000Z',updatedAt:'2026-11-17T00:00:00.000Z'};
beforeEach(()=>{vi.clearAllMocks();session.staff='owner';session.company='primary';vi.mocked(readAdvisorySchedule).mockResolvedValue(undefined);vi.mocked(runDueAdvisorySchedule).mockResolvedValue(null);});
afterEach(()=>{cleanup();vi.restoreAllMocks();});
it('does not opt in or run when no saved owner-approved schedule exists',async()=>{
 render(<AdvisoryScheduleRunner companyId="primary"/>);await waitFor(()=>expect(readAdvisorySchedule).toHaveBeenCalledTimes(1));expect(runDueAdvisorySchedule).not.toHaveBeenCalled();
});
it('locked and foreign-company wakes never read or execute private reviews',async()=>{
 session.staff=null;const view=render(<AdvisoryScheduleRunner companyId="primary"/>);
 await act(async()=>window.dispatchEvent(new Event('focus')));expect(readAdvisorySchedule).not.toHaveBeenCalled();
 session.staff='owner';session.company='foreign';await act(async()=>window.dispatchEvent(new Event('tallybook:staff-session')));
 expect(readAdvisorySchedule).not.toHaveBeenCalled();expect(runDueAdvisorySchedule).not.toHaveBeenCalled();view.unmount();
});
it('overlapping wakes run one due review and unmount stops later execution',async()=>{
 vi.mocked(readAdvisorySchedule).mockResolvedValue(schedule);
 let finish!:(value:null)=>void;vi.mocked(runDueAdvisorySchedule).mockReturnValue(new Promise(done=>{finish=done;}));
 const view=render(<AdvisoryScheduleRunner companyId="primary"/>);await waitFor(()=>expect(runDueAdvisorySchedule).toHaveBeenCalledTimes(1));
 act(()=>{window.dispatchEvent(new Event('focus'));window.dispatchEvent(new Event('tallybook:staff-session'));});
 expect(runDueAdvisorySchedule).toHaveBeenCalledTimes(1);view.unmount();await act(async()=>finish(null));
 act(()=>window.dispatchEvent(new Event('focus')));expect(runDueAdvisorySchedule).toHaveBeenCalledTimes(1);
});
