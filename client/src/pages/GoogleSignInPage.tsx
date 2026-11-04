/** V19 Run 4: account controls use verified cloud session state only. */
import {useState} from 'react';
import {CloudBusinessPanel} from '@/cloud/CloudBusinessPanel';
import {Link} from 'wouter';
import {LogIn,LogOut,ShieldCheck,RefreshCw} from 'lucide-react';
import {getSupabaseClient,isSupabaseConfigured} from '@/lib/supabase';
import {useRun4CloudSession} from '@/auth/useRun4CloudSession';

export default function GoogleSignInPage(){
  const {state,retry,signOut}=useRun4CloudSession(isSupabaseConfigured);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string|null>(null);

  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [message,setMessage]=useState<string|null>(null);
  async function emailAction(mode:'signup'|'signin'){
    if(busy||!isSupabaseConfigured)return;
    const address=email.trim();
    if(!/^\S+@\S+\.\S+$/.test(address)){setError('Enter a valid email address.');return;}
    if(mode==='signup'&&password.length<12){setError('New passwords require at least 12 characters.');return;}
    setBusy(true);setError(null);setMessage(null);
    try{
      const auth=getSupabaseClient().auth;
      if(mode==='signup'){
        const {error:failure}=await auth.signUp({email:address,password,
          options:{emailRedirectTo:window.location.origin+'/signin'}});
        if(failure)throw failure;
        setMessage('If your address can receive confirmation emails, follow that link before signing in.');
      }else{
        const {error:failure}=await auth.signInWithPassword({email:address,password});
        if(failure)throw failure;
        setMessage('Sign-in submitted; your cloud session must still be verified.');
      }
      setPassword('');
    }catch(failure){
      const code=typeof failure==='object'&&failure!==null&&'code' in failure?failure.code:null;
      if(code==='email_not_confirmed')setError('Open your confirmation email, then try signing in again.');
      else if(code==='invalid_credentials')setError('Check your email and password. If this is your first visit, choose Create email account.');
      else setError('Email account action failed. Check your credentials and connection.');
    }
    finally{setBusy(false);}
  }
  async function requestRecovery(){
    if(busy||!isSupabaseConfigured)return;
    const address=email.trim();
    if(!/^\S+@\S+\.\S+$/.test(address)){setError('Enter your email address first.');return;}
    setBusy(true);setError(null);setMessage(null);
    try{
      const {error:failure}=await getSupabaseClient().auth.resetPasswordForEmail(address,{
        redirectTo:window.location.origin+'/reset-password?recovery=1'});
      if(failure)throw failure;
      setMessage('If this address is eligible, a password-reset link will arrive.');
    }catch{setError('Could not request a password reset. Check your connection.');}
    finally{setBusy(false);}
  }
  async function signIn(selectAccount=false){
    if(busy||!isSupabaseConfigured)return;
    setBusy(true);setError(null);
    try{
      if(selectAccount){
        const confirmed=await signOut();
        if(!confirmed)throw Error('Could not confirm cloud sign-out before switching.');
      }
      const {error:oauthError}=await getSupabaseClient().auth.signInWithOAuth({
        provider:'google',
        options:{redirectTo:`${window.location.origin}/signin`,
          queryParams:selectAccount?{prompt:'select_account'}:undefined}
      });
      if(oauthError)throw oauthError;
    }catch(e){setError(e instanceof Error?e.message:'Cloud sign-in could not start.');}
    finally{setBusy(false);}
  }
  async function logOut(){
    if(busy)return;setBusy(true);setError(null);
    try{
      if(!await signOut())throw Error('Sign-out could not be confirmed. Cloud access stays locked.');
    }catch(e){setError(e instanceof Error?e.message:'Cloud sign-out failed.');}
    finally{setBusy(false);}
  }
  return <div className="home-workspace space-y-5 pb-6" style={{maxWidth:620,margin:'0 auto'}}>
    <section className="op-row-card" style={{display:'block',padding:22}}>
      <p className="eyebrow"><ShieldCheck className="h-4 w-4" aria-hidden="true"/> Alchemy · Tallybook</p>
      <h1 style={{fontFamily:'var(--font-display)',fontSize:'2rem',margin:'12px 0 8px'}}>
        {state.status==='signed-in' ? "Your business" : "Tallybook account"}</h1>

      {!isSupabaseConfigured?<p role="alert">Cloud account configuration is unavailable.</p>:
       state.status==='checking'?<p role="status">Verifying session with Supabase…</p>:
       state.status==='offline'?<p role="status">Offline. Your local Tallybook remains available.</p>:
       state.status==='signed-in'?<div className="space-y-3">
        <CloudBusinessPanel key={state.userId} accountOnly/>
        <details className="rounded border p-3"><summary className="cursor-pointer py-2 font-semibold">Account menu</summary>
      <p className="op-row-sub">Cloud identity is optional. Sales, stock, reports and local backups
        remain on this device without signing in. Signing out does not encrypt or erase
        records stored in this browser.</p>
        <p className="break-all" role="status">Cloud session verified for account <code>{state.userId}</code>.</p>
        <div className="flex flex-wrap gap-2">
          <button className="secondary-action" disabled={busy} type="button"
            onClick={()=>void logOut()}><LogOut className="h-4 w-4"/>Sign out</button>
          <button className="secondary-action" disabled={busy} type="button"
            onClick={()=>void signIn(true)}>Switch Google account</button>
          <Link href="/sync-status" className="underline">View local sync status</Link>
        </div>
        </details></div>:
       <div className="space-y-3">
         {state.status==='error'?<p role="alert">Cloud identity could not be verified.
           No local records were changed.</p>:null}
         <button className="primary-action" type="button" disabled={busy}
           onClick={()=>void signIn()}><LogIn className="h-4 w-4"/>
           {busy?'Opening Google…':'Sign in with Google'}</button>
         {state.status==='error'?<button className="secondary-action" type="button"
           onClick={()=>void retry()}><RefreshCw className="h-4 w-4"/>Retry</button>:null}
       </div>}

      {isSupabaseConfigured&&state.status!=='signed-in'?<div className="space-y-3 mt-5">
        <h2 className="font-semibold">Email account</h2>
        <label className="block" htmlFor="tb-cloud-email">Email</label>
        <input id="tb-cloud-email" className="w-full rounded border p-3" type="email" autoComplete="email" value={email} onChange={event=>setEmail(event.target.value)}/>
        <label className="block" htmlFor="tb-cloud-password">Password</label>
        <input id="tb-cloud-password" className="w-full rounded border p-3" type="password" autoComplete="current-password" value={password} onChange={event=>setPassword(event.target.value)}/>
        <div className="flex flex-wrap gap-2">
          <button className="primary-action" type="button" disabled={busy||!email.trim()||!password} onClick={()=>void emailAction('signin')}>Sign in with email</button>
          <button className="secondary-action" type="button" disabled={busy||!email.trim()||!password} onClick={()=>void emailAction('signup')}>Create email account</button>
          <button className="secondary-action" type="button" disabled={busy||!email.trim()} onClick={()=>void requestRecovery()}>Forgot password?</button>
        </div>
        <p className="text-sm">Use at least 12 characters for a new password. Email confirmation and recovery require internet access.</p>
      </div>:null}
      {message?<p role="status">{message}</p>:null}
      {error?<p role="alert">{error}</p>:null}
    </section>
    <Link href="/" className="back-link">Return to offline Tallybook</Link>
  </div>;
}



