import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {ScheduledAdvisories} from './ScheduledAdvisories';
import {readAdvisorySchedule,configureAdvisorySchedule,runDueAdvisorySchedule} from './advisorySchedule';
import type {AdvisorySchedule} from './advisoryScheduleRules';
vi.mock('./advisorySchedule',()=>({readAdvisorySchedule:vi.fn(),configureAdvisorySchedule:vi.fn(),runDueAdvisorySchedule:vi.fn()}));
vi.mock('@/features/business/activeCompany',()=>({getActiveBusinessProfileId:()=> 'primary'}));
vi.mock('@/features/staff/staff',()=>({STAFF_SESSION_CHANGED:'tallybook:staff-session',currentStaffSessionGeneration:()=>0}));
const schedule:AdvisorySchedule={version:1,companyId:'primary',ownerStaffId:'owner',revision:1,state:'active',intervalHours:24,kinds:['stock'],nextDueAt:'2026-11-17T00:00:00.000Z',updatedAt:'2026-11-17T00:00:00.000Z'};
beforeEach(()=>{vi.clearAllMocks();vi.mocked(readAdvisorySchedule).mockResolvedValue(undefined);vi.mocked(configureAdvisorySchedule).mockResolvedValue(schedule);});
afterEach(cleanup);
it('requires an explicit owner click to approve a saved advisory schedule',async()=>{
 render(<ScheduledAdvisories companyId="primary"/>);
 await screen.findByText('Scheduling is off until the owner opts in.');
 expect(configureAdvisorySchedule).not.toHaveBeenCalled();expect(runDueAdvisorySchedule).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Enable / update owner-approved reviews'}));
 await waitFor(()=>expect(configureAdvisorySchedule).toHaveBeenCalledWith({state:'active',intervalHours:24,kinds:['stock','debt','expiry']}));
});
it('never presents actionable schedules or saved findings after an authorization denial',async()=>{
 vi.mocked(readAdvisorySchedule).mockRejectedValue(new Error('Unlock the company owner to manage scheduled reviews.'));
 render(<ScheduledAdvisories companyId="primary"/>);
 expect(await screen.findByRole('alert')).toHaveTextContent('Unlock the company owner');
 expect(screen.queryByRole('button',{name:/Enable/})).not.toBeInTheDocument();expect(configureAdvisorySchedule).not.toHaveBeenCalled();
});
it('pause and cancellation are explicit approved state changes',async()=>{
 vi.mocked(readAdvisorySchedule).mockResolvedValue(schedule);
 render(<ScheduledAdvisories companyId="primary"/>);
 fireEvent.click(await screen.findByRole('button',{name:'Pause reviews'}));
 await waitFor(()=>expect(configureAdvisorySchedule).toHaveBeenCalledWith({...schedule,state:'paused'}));
 await waitFor(()=>expect(screen.getByRole('button',{name:'Cancel schedule'})).toBeEnabled());
 fireEvent.click(screen.getByRole('button',{name:'Cancel schedule'}));
 await waitFor(()=>expect(configureAdvisorySchedule).toHaveBeenCalledWith({...schedule,state:'cancelled'}));
});
it('employee handover removes saved private findings immediately',async()=>{
 const saved:AdvisorySchedule={...schedule,lastRun:{id:'review',dueAt:schedule.nextDueAt,completedAt:schedule.nextDueAt,totalFindings:1,findings:[{id:'debt',kind:'debt',title:'Private debt finding',evidence:'Private customer balance',href:'/customers'}]}};
 vi.mocked(readAdvisorySchedule).mockResolvedValueOnce(saved);
 render(<ScheduledAdvisories companyId="primary"/>);await screen.findByText('Private customer balance');
 vi.mocked(readAdvisorySchedule).mockRejectedValue(new Error('Owner access locked'));
 act(()=>window.dispatchEvent(new Event('tallybook:staff-session')));
 expect(screen.queryByText('Private customer balance')).not.toBeInTheDocument();expect(await screen.findByRole('alert')).toHaveTextContent('Owner access locked');
});
it('an earlier pending read cannot restore private findings after handover',async()=>{
 let resolve!:(value:AdvisorySchedule)=>void;
 vi.mocked(readAdvisorySchedule).mockReturnValueOnce(new Promise(done=>{resolve=done;}));
 render(<ScheduledAdvisories companyId="primary"/>);
 vi.mocked(readAdvisorySchedule).mockRejectedValue(new Error('New owner access locked'));
 act(()=>window.dispatchEvent(new Event('tallybook:staff-session')));await screen.findByRole('alert');
 await act(async()=>resolve({...schedule,lastRun:{id:'old',dueAt:schedule.nextDueAt,completedAt:schedule.nextDueAt,totalFindings:1,findings:[{id:'old-debt',kind:'debt',title:'Old private review',evidence:'Old private amount',href:'/customers'}]}}));
 expect(screen.queryByText('Old private amount')).not.toBeInTheDocument();expect(screen.queryByRole('button',{name:/Enable/})).not.toBeInTheDocument();
});
