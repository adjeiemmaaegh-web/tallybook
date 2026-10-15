import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import GoogleSignInPage from './GoogleSignInPage';
import {useRun4CloudSession} from '@/auth/useRun4CloudSession';

const mock=vi.hoisted(()=>({
 oauth:vi.fn(),signOut:vi.fn(),retry:vi.fn(),
 state:{status:'signed-in' as string,userId:'user-a' as string|null,
  expiresAtEpochMs:999999999999 as number|null,generation:1}
}));
vi.mock('wouter',()=>({Link:({children}:{children:unknown})=><span>{children as string}</span>}));
vi.mock('@/lib/supabase',()=>({
 isSupabaseConfigured:true,
 getSupabaseClient:()=>({auth:{signInWithOAuth:mock.oauth}})
}));
vi.mock('@/auth/useRun4CloudSession',()=>({useRun4CloudSession:vi.fn()}));
beforeEach(()=>{
 vi.clearAllMocks();
 mock.state.status='signed-in';mock.state.userId='user-a';
 mock.oauth.mockResolvedValue({error:null});
 mock.signOut.mockResolvedValue(true);
 vi.mocked(useRun4CloudSession).mockImplementation(()=>({
  state:mock.state as ReturnType<typeof useRun4CloudSession>['state'],
  signOut:mock.signOut,retry:mock.retry
 }));
});
afterEach(()=>cleanup());
it('shows the verified cloud identity without claiming local data encryption',()=>{
 render(<GoogleSignInPage/>);
 expect(screen.getByText(/Cloud session verified/)).toBeTruthy();
 expect(screen.getByText(/does not encrypt or erase/)).toBeTruthy();
});
it('switch account signs out before OAuth account selection',async()=>{
 render(<GoogleSignInPage/>);
 fireEvent.click(screen.getByText('Switch Google account'));
 await waitFor(()=>expect(mock.oauth).toHaveBeenCalledTimes(1));
 expect(mock.signOut).toHaveBeenCalledTimes(1);
 expect(mock.oauth).toHaveBeenCalledWith(expect.objectContaining({
  options:expect.objectContaining({queryParams:{prompt:'select_account'}})
 }));
});
it('failed sign-out must not launch a new account session',async()=>{
 mock.signOut.mockResolvedValue(false);
 render(<GoogleSignInPage/>);
 fireEvent.click(screen.getByText('Switch Google account'));
 await waitFor(()=>expect(screen.getByText(/Could not confirm cloud sign-out/)).toBeTruthy());
 expect(mock.oauth).not.toHaveBeenCalled();
});
it('unverified cloud identity never renders signed-in account controls',()=>{
 mock.state.status='error';
 render(<GoogleSignInPage/>);
 expect(screen.getByText(/Cloud identity could not be verified/)).toBeTruthy();
 expect(screen.queryByText('Switch Google account')).toBeNull();
});
