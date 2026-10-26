import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {fireEvent,render,screen,cleanup} from '@testing-library/react';
import {AuthGate} from './AuthGate';
import {useRun4CloudSession} from './useRun4CloudSession';

const mock=vi.hoisted(()=>({location:'/',retry:vi.fn(),state:{
 status:'checking' as string,userId:null as string|null,expiresAtEpochMs:null as number|null,generation:0}}));
vi.mock('wouter',()=>({
 useLocation:()=>[mock.location,vi.fn()],
 Redirect:({to}:{to:string})=><span>Redirect to {to}</span>
}));
vi.mock('./useRun4CloudSession',()=>({useRun4CloudSession:vi.fn()}));
beforeEach(()=>{
 mock.location='/';
 mock.retry=vi.fn();
 mock.state={status:'checking',userId:null,expiresAtEpochMs:null,generation:0};
 vi.mocked(useRun4CloudSession).mockImplementation(()=>({
  state:mock.state as ReturnType<typeof useRun4CloudSession>['state'],
  retry:mock.retry,signOut:vi.fn()
 }));
});
afterEach(()=>{cleanup();vi.clearAllMocks();});
describe('Run 4 offline-safe AuthGate',()=>{
 it('keeps account screens outside the local ledger tree',()=>{
  for(const path of ['/signin','/account']){
   mock.location=path;
   const view=render(<AuthGate enabled signIn={<span>Sign in</span>}>
     <span>Local ledger mounted</span>
   </AuthGate>);
   expect(screen.getByText('Sign in')).toBeTruthy();
   expect(screen.queryByText('Local ledger mounted')).toBeNull();
   view.unmount();
  }
  expect(useRun4CloudSession).not.toHaveBeenCalled();
 });
 it('keeps the account preview screen outside the local ledger tree',()=>{
  mock.location='/account';
  render(<AuthGate enabled signIn={<span>Google sign in</span>} accountSignIn={<span>Account preview sign in</span>}>
    <span>Local ledger mounted</span>
  </AuthGate>);
  expect(screen.getByText('Account preview sign in')).toBeTruthy();
  expect(screen.queryByText('Google sign in')).toBeNull();
  expect(screen.queryByText('Local ledger mounted')).toBeNull();
 });
 it('never gates local POS, backup, inventory or reports even with auth opted in',()=>{
  for(const path of ['/', '/sales','/backup','/inventory','/reports']){
   mock.location=path;
   const view=render(<AuthGate enabled signIn={<span>Sign in</span>}>
     <span>Local ledger available</span>
   </AuthGate>);
   expect(screen.getByText('Local ledger available')).toBeTruthy();
   view.unmount();
  }
  expect(useRun4CloudSession).not.toHaveBeenCalled();
 });
 it('guards only the cloud-only route and withholds children during validation',()=>{
  mock.location='/cloud-account';
  render(<AuthGate enabled signIn={<span>Sign in</span>}>
    <span>Sensitive cloud panel</span>
  </AuthGate>);
  expect(screen.getByText(/Verifying your cloud session/)).toBeTruthy();
  expect(screen.queryByText('Sensitive cloud panel')).toBeNull();
 });
 it('redirects signed-out cloud users without showing tenant data',()=>{
  mock.location='/cloud-account';mock.state.status='signed-out';
  render(<AuthGate enabled signIn={<span>Sign in</span>}><span>Tenant data</span></AuthGate>);
  expect(screen.getByText('Redirect to /signin')).toBeTruthy();
  expect(screen.queryByText('Tenant data')).toBeNull();
 });
 it('keeps offline local navigation available while rejecting cloud access',()=>{
  mock.location='/cloud-account';mock.state.status='offline';
  render(<AuthGate enabled signIn={<span>Sign in</span>}><span>Cloud data</span></AuthGate>);
  expect(screen.getByText(/local Tallybook business remains available/)).toBeTruthy();
  expect(screen.queryByText('Cloud data')).toBeNull();
 });
 it('only renders the cloud workspace after verified sign-in',()=>{
  mock.location='/cloud-account';mock.state.status='signed-in';
  mock.state.userId='verified-owner';
  render(<AuthGate enabled signIn={<span>Sign in</span>}><span>Verified cloud workspace</span></AuthGate>);
  expect(screen.getByText('Verified cloud workspace')).toBeTruthy();
 });
 it('failure is fail-closed and offers a genuine retry',()=>{
  mock.location='/cloud-account';mock.state.status='error';
  render(<AuthGate enabled signIn={<span>Sign in</span>}><span>Cloud data</span></AuthGate>);
  expect(screen.queryByText('Cloud data')).toBeNull();
  fireEvent.click(screen.getByText('Retry verification'));
  expect(mock.retry).toHaveBeenCalledTimes(1);
 });
});
