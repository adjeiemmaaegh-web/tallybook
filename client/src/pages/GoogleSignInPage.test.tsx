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
 fireEvent.click(screen.getByRole('button',{name:'Create an account'}));
 expect(screen.getByRole('heading',{name:'Create your account'})).toBeTruthy();
 fireEvent.change(screen.getByLabelText('Email address'),{target:{value:'friend@example.com'}});
 fireEvent.change(screen.getByLabelText('Password'),{target:{value:'test-passphrase'}});
 fireEvent.click(screen.getByRole('button',{name:'Create account'}));
 await waitFor(()=>expect(mock.emailSignUp).toHaveBeenCalledWith(expect.objectContaining({
  email:'friend@example.com',password:'test-passphrase'})));
 expect(screen.getByText(/follow that link before signing in/)).toBeTruthy();
});
it('signs in with email before offering a test workspace',async()=>{
 mock.state.status='signed-out';
 render(<GoogleSignInPage/>);
 fireEvent.change(screen.getByLabelText('Email address'),{target:{value:'friend@example.com'}});
 fireEvent.change(screen.getByLabelText('Password'),{target:{value:'test-passphrase'}});
 fireEvent.click(screen.getByRole('button',{name:'Sign in'}));
 await waitFor(()=>expect(mock.emailSignIn).toHaveBeenCalledWith({
  email:'friend@example.com',password:'test-passphrase'}));
});

it('shows and hides the typed password, and returns to sign-in from the create-account view',()=>{
 mock.state.status='signed-out';
 render(<GoogleSignInPage/>);
 const password=screen.getByLabelText('Password') as HTMLInputElement;
 fireEvent.change(password,{target:{value:'secret-value'}});
 expect(password.type).toBe('password');
 fireEvent.click(screen.getByRole('button',{name:'Show password'}));
 expect(password.type).toBe('text');
 expect(screen.getByRole('button',{name:'Hide password'}).getAttribute('aria-pressed')).toBe('true');
 fireEvent.click(screen.getByRole('button',{name:'Create an account'}));
 expect(screen.getByRole('button',{name:'Show password'}).getAttribute('aria-pressed')).toBe('false');
 fireEvent.click(screen.getByRole('button',{name:'Sign in'}));
 expect(screen.getByRole('heading',{name:'Welcome back'})).toBeTruthy();
});
it('pressing Enter in the form submits it; an empty form explains what is missing instead of failing silently',async()=>{
 mock.state.status='signed-out';
 render(<GoogleSignInPage/>);
 const submit=screen.getByRole('button',{name:'Sign in'}) as HTMLButtonElement;
 expect(submit.disabled).toBe(false);
 fireEvent.click(submit);
 expect(await screen.findByRole('alert')).toHaveTextContent('Enter a valid email address.');
 fireEvent.change(screen.getByLabelText('Email address'),{target:{value:'friend@example.com'}});
 fireEvent.click(submit);
 await waitFor(()=>expect(screen.getByRole('alert')).toHaveTextContent('Enter your password.'));
 expect(mock.emailSignIn).not.toHaveBeenCalled();
 fireEvent.change(screen.getByLabelText('Password'),{target:{value:'test-passphrase'}});
 fireEvent.submit(submit.closest('form') as HTMLFormElement);
 await waitFor(()=>expect(mock.emailSignIn).toHaveBeenCalledTimes(1));
});
