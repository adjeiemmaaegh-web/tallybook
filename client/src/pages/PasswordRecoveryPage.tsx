/** A password reset establishes no local company or staff authority. */
import {useEffect,useState,type FormEvent} from 'react';
import {Link} from 'wouter';
import {AuthShell} from '@/components/AuthShell';
import {getSupabaseClient,isSupabaseConfigured} from '@/lib/supabase';

type Phase='checking'|'ready'|'invalid'|'complete';
export default function PasswordRecoveryPage(){
  const [phase,setPhase]=useState<Phase>('checking');
  const [password,setPassword]=useState('');
  const [confirmation,setConfirmation]=useState('');
  const [error,setError]=useState<string|null>(null);
  const [busy,setBusy]=useState(false);
  const [signOutConfirmed,setSignOutConfirmed]=useState(false);
  useEffect(()=>{
    if(!isSupabaseConfigured){setPhase('invalid');return;}
    let active=true;
    const auth=getSupabaseClient().auth;
    const query=new URLSearchParams(window.location.search);
    const hash=new URLSearchParams(window.location.hash.replace(/^#/,''));
    const tokenHash=query.get('token_hash');
    const otpLink=query.get('type')==='recovery'&&Boolean(tokenHash);
    const implicitLink=hash.get('type')==='recovery'||query.get('recovery')==='1';
    if(!otpLink&&!implicitLink){setPhase('invalid');return;}
    async function verifyUser(){
      try{
        const {data,error:failure}=await auth.getUser();
        if(active)setPhase(current=>current==='complete'?current:
          !failure&&data.user?'ready':current==='ready'?current:'invalid');
      }catch{if(active)setPhase(current=>current==='ready'||current==='complete'?current:'invalid');}
    }
    const {data:{subscription}}=auth.onAuthStateChange(event=>{
      if(event==='PASSWORD_RECOVERY')void verifyUser();
    });
    void (async()=>{
      try{
        if(otpLink){
          const {error:failure}=await auth.verifyOtp({token_hash:tokenHash!,type:'recovery'});
          if(failure)throw failure;
          window.history.replaceState(window.history.state,'','/reset-password?recovery=1');
        }
        await verifyUser();
      }catch{if(active)setPhase(current=>current==='ready'||current==='complete'?current:'invalid');}
    })();
    return ()=>{active=false;subscription.unsubscribe();};
  },[]);
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(busy||phase!=='ready')return;
    if(password.length<12){setError('Use at least 12 characters.');return;}
    if(password!==confirmation){setError('Passwords do not match.');return;}
    setBusy(true);setError(null);
    try{
      const auth=getSupabaseClient().auth;
      const {data,error:failure}=await auth.getUser();
      if(failure||!data.user)throw Error('Expired session');
      const result=await auth.updateUser({password});
      if(result.error)throw result.error;
      setPassword('');setConfirmation('');
      // Password replacement has already succeeded. A sign-out failure must
      // never send the user back to the form or imply the password was unchanged.
      setPhase('complete');
      try {
        const {error:signOutError}=await auth.signOut();
        if(signOutError)setError('Password updated, but sign-out was not confirmed. Sign out of shared devices.');
        else setSignOutConfirmed(true);
      } catch {
        setError('Password updated, but sign-out was not confirmed. Sign out of shared devices.');
      }
    }catch{setError('Password update failed. Request a new recovery link and try again.');}
    finally{setBusy(false);}
  }
  return <AuthShell title="Reset Tallybook password" subtitle="Choose a new password for your cloud account." tagline={false}>
    {phase==='checking'?<p role="status" className="tb-auth-status">Verifying your recovery link…</p>:null}
    {phase==='invalid'?<p role="alert" className="tb-auth-status">Recovery link is missing, invalid or expired. Request a new link from sign-in.</p>:null}
    {phase==='ready'?<form className="tb-auth-form" onSubmit={event=>void submit(event)}>
      <div className="tb-auth-field">
        <label htmlFor="recovery-new-password">New password</label>
        <div className="tb-auth-input"><input id="recovery-new-password" required minLength={12} type="password" autoComplete="new-password" placeholder="At least 12 characters" value={password} onChange={event=>setPassword(event.target.value)}/></div>
      </div>
      <div className="tb-auth-field">
        <label htmlFor="recovery-confirm-password">Confirm new password</label>
        <div className="tb-auth-input"><input id="recovery-confirm-password" required minLength={12} type="password" autoComplete="new-password" placeholder="Type it again" value={confirmation} onChange={event=>setConfirmation(event.target.value)}/></div>
      </div>
      <button type="submit" disabled={busy||password.length<12||!confirmation} className="tb-auth-submit">{busy?'Updating…':'Update password and sign out'}</button>
    </form>:null}
    {phase==='complete'?<p role="status" className="tb-auth-status">{signOutConfirmed ? 'Password updated and cloud session signed out.' : 'Password updated. Cloud sign-out has not been confirmed.'} Sign in again using your new password.</p>:null}
    {error?<p role="alert" className="tb-auth-status">{error}</p>:null}
    <div className="tb-auth-links"><Link href="/signin" className="tb-auth-link is-strong">Return to sign-in</Link></div>
    <p className="tb-auth-note">This resets cloud credentials only. Local business records and staff PINs are unchanged.</p>
  </AuthShell>;
}
