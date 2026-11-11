import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import GoogleSignInPage from './GoogleSignInPage';
import PasswordRecoveryPage from './PasswordRecoveryPage';

const mock=vi.hoisted(()=>({
  signUp:vi.fn(),signInWithPassword:vi.fn(),resetPasswordForEmail:vi.fn(),verifyOtp:vi.fn(),
  updateUser:vi.fn(),getUser:vi.fn(),signOut:vi.fn(),signInWithOAuth:vi.fn(),unsubscribe:vi.fn()
}));
vi.mock('@/lib/supabase',()=>({isSupabaseConfigured:true,getSupabaseClient:()=>({auth:{
  ...mock,onAuthStateChange:()=>({data:{subscription:{unsubscribe:mock.unsubscribe}}})
}})}));
vi.mock('@/auth/useRun4CloudSession',()=>({useRun4CloudSession:()=>({
  state:{status:'signed-out',userId:null,expiresAtEpochMs:null,generation:0},
  retry:vi.fn(),signOut:mock.signOut
})}));
vi.mock('wouter',()=>({Link:({href,children}:{href:string;children:React.ReactNode})=><a href={href}>{children}</a>,useLocation:()=>[window.location.pathname,vi.fn()]}));
beforeEach(()=>{
  vi.clearAllMocks();
  window.history.replaceState(null,'','/');
  for(const key of ['signUp','signInWithPassword','resetPasswordForEmail','updateUser','verifyOtp','signOut'])
    (mock as Record<string,ReturnType<typeof vi.fn>>)[key].mockResolvedValue({error:null});
  mock.getUser.mockResolvedValue({data:{user:{id:'verified-user'}},error:null});
});
afterEach(()=>cleanup());
describe('cloud account recovery',()=>{
  it.each([['email_not_confirmed','Open your confirmation email'],['invalid_credentials','Check your email and password']])('guides the tester after %s',async(code,message)=>{
    mock.signInWithPassword.mockResolvedValueOnce({error:{code}});
    render(<GoogleSignInPage/>);
    fireEvent.change(screen.getByLabelText('Email'),{target:{value:'owner@example.test'}});
    fireEvent.change(screen.getByLabelText('Password'),{target:{value:'local-test-password'}});
    fireEvent.click(screen.getByRole('button',{name:'Sign in with email'}));
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(mock.signUp).not.toHaveBeenCalled();
  });
  it('requests confirmation rather than claiming signup is immediately verified',async()=>{
    render(<GoogleSignInPage/>);
    fireEvent.change(screen.getByLabelText('Email'),{target:{value:'owner@example.test'}});
    fireEvent.change(screen.getByLabelText('Password'),{target:{value:'long-password-123456'}});
    fireEvent.click(screen.getByRole('button',{name:'Create email account'}));
    await waitFor(()=>expect(mock.signUp).toHaveBeenCalledOnce());
    expect(mock.signUp.mock.calls[0][0].options.emailRedirectTo).toMatch(/\/signin$/);
    expect(screen.getByRole('status').textContent).toMatch(/confirmation emails/);
  });
  it('requests password reset only for a well-formed address, with a dedicated return path',async()=>{
    render(<GoogleSignInPage/>);
    fireEvent.click(screen.getByRole('button',{name:'Forgot password?'}));
    expect(mock.resetPasswordForEmail).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Email'),{target:{value:'owner@example.test'}});
    fireEvent.click(screen.getByRole('button',{name:'Forgot password?'}));
    await waitFor(()=>expect(mock.resetPasswordForEmail).toHaveBeenCalledOnce());
    expect(mock.resetPasswordForEmail.mock.calls[0][1].redirectTo).toMatch(/\/reset-password\?recovery=1$/);
  });
  it('blocks password update without recovery link',()=>{
    window.history.replaceState(null,'','/reset-password');
    render(<PasswordRecoveryPage/>);
    expect(screen.getByRole('alert')).toHaveTextContent('missing, invalid or expired');
    expect(mock.updateUser).not.toHaveBeenCalled();
  });
  it('verifies the recovery session, updates password and signs out',async()=>{
    window.history.replaceState(null,'','/reset-password?recovery=1');
    render(<PasswordRecoveryPage/>);
    await screen.findByLabelText('New password');
    fireEvent.change(screen.getByLabelText('New password'),{target:{value:'safe-new-password-789'}});
    fireEvent.change(screen.getByLabelText('Confirm new password'),{target:{value:'safe-new-password-789'}});
    fireEvent.click(screen.getByRole('button',{name:'Update password and sign out'}));
    await waitFor(()=>expect(mock.updateUser).toHaveBeenCalledWith({password:'safe-new-password-789'}));
    await waitFor(()=>expect(mock.signOut).toHaveBeenCalledOnce());
  });
  it('keeps the completed reset visible when sign-out returns an error',async()=>{
    window.history.replaceState(null,'','/reset-password?recovery=1');
    mock.signOut.mockResolvedValueOnce({error:new Error('Sign-out unavailable')});
    render(<PasswordRecoveryPage/>);
    await screen.findByLabelText('New password');
    fireEvent.change(screen.getByLabelText('New password'),{target:{value:'safe-new-password-789'}});
    fireEvent.change(screen.getByLabelText('Confirm new password'),{target:{value:'safe-new-password-789'}});
    fireEvent.click(screen.getByRole('button',{name:'Update password and sign out'}));
    await screen.findByText(/Password updated\. Cloud sign-out has not been confirmed/);
    expect(screen.getByRole('alert')).toHaveTextContent('sign-out was not confirmed');
    expect(screen.queryByLabelText('New password')).toBeNull();
    expect(mock.updateUser).toHaveBeenCalledTimes(1);
  });
  it('does not claim the password update failed when sign-out throws',async()=>{
    window.history.replaceState(null,'','/reset-password?recovery=1');
    mock.signOut.mockRejectedValueOnce(new Error('Offline'));
    render(<PasswordRecoveryPage/>);
    await screen.findByLabelText('New password');
    fireEvent.change(screen.getByLabelText('New password'),{target:{value:'safe-new-password-789'}});
    fireEvent.change(screen.getByLabelText('Confirm new password'),{target:{value:'safe-new-password-789'}});
    fireEvent.click(screen.getByRole('button',{name:'Update password and sign out'}));
    await screen.findByText(/Password updated\. Cloud sign-out has not been confirmed/);
    expect(screen.getByRole('alert')).toHaveTextContent('sign-out was not confirmed');
    expect(screen.queryByText('Password update failed. Request a new recovery link and try again.')).toBeNull();
    expect(mock.updateUser).toHaveBeenCalledTimes(1);
  });
  it('fails closed when the recovery session is invalid',async()=>{
    window.history.replaceState(null,'','/reset-password?recovery=1');
    mock.getUser.mockResolvedValue({data:{user:null},error:new Error('Expired')});
    render(<PasswordRecoveryPage/>);
    await screen.findByRole('alert');
    expect(mock.updateUser).not.toHaveBeenCalled();
  });
  it('verifies an OTP token and removes it from the browser URL',async()=>{
    window.history.replaceState(null,'','/reset-password?type=recovery&token_hash=fixture-only');
    render(<PasswordRecoveryPage/>);
    await screen.findByLabelText('New password');
    expect(mock.verifyOtp).toHaveBeenCalledWith({token_hash:'fixture-only',type:'recovery'});
    expect(window.location.search).toBe('?recovery=1');
  });
});
