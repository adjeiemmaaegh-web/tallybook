import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import GoogleSignInPage from './GoogleSignInPage';
import {useRun4CloudSession} from '@/auth/useRun4CloudSession';

const mock=vi.hoisted(()=>({
 oauth:vi.fn(),emailSignIn:vi.fn(),emailSignUp:vi.fn(),signOut:vi.fn(),retry:vi.fn(),
 state:{status:'signed-in' as string,userId:'user-a' as string|null,
  expiresAtEpochMs:999999999999 as number|null,generation:1}
}));
vi.mock('@/cloud/CloudBusinessPanel',()=>({CloudBusinessPanel:()=> <section>Business setup</section>}));
vi.mock('wouter',()=>({Link:({children}:{children:unknown})=><span>{children as string}</span>,useLocation:()=>['/settings',()=>{}]}));
vi.mock('@/lib/supabase',()=>({
 isSupabaseConfigured:true,
 getSupabaseClient:()=>({auth:{signInWithOAuth:mock.oauth,signInWithPassword:mock.emailSignIn,signUp:mock.emailSignUp}})
}));
vi.mock('@/auth/useRun4CloudSession',()=>({useRun4CloudSession:vi.fn()}));
beforeEach(()=>{
 vi.clearAllMocks();
 mock.state.status='signed-in';mock.state.userId='user-a';
 mock.oauth.mockResolvedValue({error:null});
 mock.emailSignIn.mockResolvedValue({error:null});
 mock.emailSignUp.mockResolvedValue({data:{session:null},error:null});
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
 expect(screen.getByText('Business setup')).toBeTruthy();
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
it('creates an email account and tells the visitor to confirm it',async()=>{
 mock.state.status='signed-out';
 render(<GoogleSignInPage/>);
 fireEvent.change(screen.getByLabelText('Email'),{target:{value:'friend@example.com'}});
 fireEvent.change(screen.getByLabelText('Password'),{target:{value:'test-passphrase'}});
 fireEvent.click(screen.getByText('Create email account'));
 await waitFor(()=>expect(mock.emailSignUp).toHaveBeenCalledWith(expect.objectContaining({
  email:'friend@example.com',password:'test-passphrase'})));
 expect(screen.getByText(/follow that link before signing in/)).toBeTruthy();
});
it('signs in with email before offering a test workspace',async()=>{
 mock.state.status='signed-out';
 render(<GoogleSignInPage/>);
 fireEvent.change(screen.getByLabelText('Email'),{target:{value:'friend@example.com'}});
 fireEvent.change(screen.getByLabelText('Password'),{target:{value:'test-passphrase'}});
 fireEvent.click(screen.getByText('Sign in with email'));
 await waitFor(()=>expect(mock.emailSignIn).toHaveBeenCalledWith({
  email:'friend@example.com',password:'test-passphrase'}));
});

