import {render,screen} from '@testing-library/react';
import {beforeEach,expect,it,vi} from 'vitest';
import {FriendsTestGate} from './FriendsTestGate';
const mock=vi.hoisted(()=>({list:vi.fn(),status:'signed-in'}));
vi.mock('../cloud/cloudMembership',()=>({listVerifiedCloudBusinesses:mock.list}));
vi.mock('./useRun4CloudSession',()=>({useRun4CloudSession:()=>({state:{status:mock.status,userId:'verified'}})}));
vi.mock('@/pages/GoogleSignInPage',()=>({default:()=> <span>Login required</span>}));
vi.mock('wouter',()=>({Redirect:()=> <span>Account setup required</span>}));
beforeEach(()=>{localStorage.clear();localStorage.setItem('friendsTestVerifiedAuthUserId','verified');mock.status='signed-in';mock.list.mockReset();});
function visit(){render(<FriendsTestGate><span>Operational workspace</span></FriendsTestGate>);}
it.each([[],[{role:'attendant',owner_id:'another'}],[{role:'owner',owner_id:'another'}]].map(rows=>({rows})))('requires verified ownership before opening the owner workspace',async({rows})=>{
 mock.list.mockResolvedValue(rows);visit();await screen.findByText('Account setup required');expect(screen.queryByText('Operational workspace')).toBeNull();
});
it('admits the verified owner on their bound browser',async()=>{
 mock.list.mockResolvedValue([{role:'owner',owner_id:'verified'}]);visit();await screen.findByText('Operational workspace');
});
it('requires online verification on an offline visit',()=>{
 mock.status='offline';visit();expect(screen.queryByText('Operational workspace')).toBeNull();expect(mock.list).not.toHaveBeenCalled();
});
