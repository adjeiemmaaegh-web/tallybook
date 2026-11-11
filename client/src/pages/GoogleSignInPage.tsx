/** V19 Run 4: account controls use verified cloud session state only. */
import "./TallybookAccount.css";
import { workspaceOwner, revisitOriginalLedger } from "@/auth/ownerWorkspace";
import {useState} from 'react';
import {CloudBusinessPanel} from '@/cloud/CloudBusinessPanel';
import {Run18UpdateNotice} from '@/components/Run18UpdateNotice';
import {Link,useLocation} from 'wouter';
import {Eye,EyeOff,LogOut,RefreshCw} from 'lucide-react';
import {AuthShell} from '@/components/AuthShell';
import {getSupabaseClient,isSupabaseConfigured} from '@/lib/supabase';
import {useRun4CloudSession} from '@/auth/useRun4CloudSession';
import {confirmSharedDeviceHandover} from '@/cloud/sharedDeviceHandover';

export default function GoogleSignInPage(){
  const {state,retry,signOut}=useRun4CloudSession(isSupabaseConfigured);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string|null>(null);

  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [message,setMessage]=useState<string|null>(null);
  const [mode,setMode]=useState<'signin'|'signup'>('signin');
  const [showPassword,setShowPassword]=useState(false);
  function switchMode(next:'signin'|'signup'){setMode(next);setError(null);setMessage(null);setShowPassword(false);}
  async function emailAction(mode:'signup'|'signin'){
    if(busy||!isSupabaseConfigured)return;
    const address=email.trim();
    if(!/^\S+@\S+\.\S+$/.test(address)){setError('Enter a valid email address.');return;}
    if(!password){setError(mode==='signup'?'Choose a password.':'Enter your password.');return;}
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
      else if(code==='email_address_invalid')setError('That email address was not accepted. Check it, or use another address.');
      else if(code==='user_already_exists'||code==='email_exists')setError('An account already uses this email. Choose Sign in with email, or Forgot password.');
      else if(code==='weak_password')setError('Choose a stronger password: at least 12 characters, mixing words, numbers or symbols.');
      else if(code==='over_email_send_rate_limit'||code==='over_request_rate_limit')setError('Too many attempts. Wait a few minutes, then try again.');
      else if(code==='signup_disabled')setError('New email accounts are switched off at the moment. Sign in with Google instead.');
      else if(!navigator.onLine)setError('You are offline. Connect to the internet to sign in or create an account.');
      else setError('Email account action failed. Check your email, password and connection.');
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
        if(state.status !== "signed-in" || !state.userId || !await confirmSharedDeviceHandover(state.userId)) return;
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
      if(state.status !== 'signed-in' || !state.userId || !await confirmSharedDeviceHandover(state.userId)) return;
      if(!await signOut())throw Error('Sign-out could not be confirmed. Cloud access stays locked.');
    }catch(e){setError(e instanceof Error?e.message:'Cloud sign-out failed.');}
    finally{setBusy(false);}
  }
  const [location] = useLocation();
  const settingsView = location === '/settings';
  const signedIn = state.status === 'signed-in';
  if(signedIn) return <div className="tb-verified-page">
    <header className="tb-verified-header">
      <Link className="tb-account-brand" href="/welcome"><span className="tb-account-brand-mark" aria-hidden="true">T</span><span><strong>Tallybook</strong><small>BY ALCHEMY</small></span></Link>
      <Link href={settingsView ? "/shop" : "/welcome"}>{settingsView ? "Back to shop" : "Back to welcome"}</Link>
    </header>
    <div className="tb-account-form-area">
      {/* Account and shop screens sit outside AppShell; staged updates still show here. */}
      <Run18UpdateNotice/>
      <section className="tb-verified-body">
        <div className="space-y-3">
          <CloudBusinessPanel key={state.userId} accountOnly autoOpen={!settingsView} showSettings={settingsView}/>
          {settingsView ? <details className="rounded border p-3"><summary className="cursor-pointer py-2 font-semibold">Account menu</summary>
            <p className="op-row-sub">Sales, stock, reports and local backups
              remain on this device. Signing out does not encrypt or erase
              records stored in this browser.</p>
            <p className="break-all" role="status">Cloud session verified. You’re signed in.</p>
            <div className="flex flex-wrap gap-2">
              <button className="secondary-action" disabled={busy} type="button"
                onClick={()=>void logOut()}><LogOut className="h-4 w-4"/>Sign out</button>
              <button className="secondary-action" disabled={busy} type="button"
                onClick={()=>void signIn(true)}>Switch Google account</button>
              {workspaceOwner === state.userId && <button type="button" className="secondary-action"
                onClick={() => revisitOriginalLedger(state.userId!)}>Return to original ledger options</button>}
              <Link href="/sync-status" className="underline">View local sync status</Link>
            </div>
          </details> : <button type="button" className="tb-onboarding-exit" disabled={busy} onClick={()=>void logOut()}>Sign out</button>}
        </div>
        {message?<p role="status">{message}</p>:null}
        {error?<p role="alert">{error}</p>:null}
      </section>
    </div>
  </div>;

  const signup=mode==='signup';
  return <AuthShell
    title={signup?'Create your account':'Welcome back'}
    subtitle={signup?'Start with your email, or continue with Google':'Sign in to your Tallybook workspace'}
    notice={<Run18UpdateNotice/>}
    footer={<p className="tb-auth-note">Already verified as an owner? <Link href="/">Open your device ledger</Link>. Access stays protected by your account and local staff permissions.</p>}>
    {!isSupabaseConfigured?<p role="alert" className="tb-auth-status">Cloud account configuration is unavailable.</p>:<>
      {state.status==='checking'?<p role="status" className="tb-auth-status">Verifying session with Supabase…</p>:null}
      {state.status==='offline'?<p role="status" className="tb-auth-status">Connect to the internet to verify your account before opening a shop.</p>:null}
      {state.status==='error'?<div className="tb-auth-status" role="alert">Cloud identity could not be verified. No local records were changed.
        <button className="tb-auth-link tb-auth-retry" type="button" onClick={()=>void retry()}><RefreshCw className="inline h-4 w-4" aria-hidden="true"/> Retry</button></div>:null}

      <button className="tb-auth-google" type="button" disabled={busy} onClick={()=>void signIn()}>
        <GoogleMark/>{busy?'Opening Google…':'Continue with Google'}
      </button>
      <p className="tb-auth-divider">Or continue with email</p>

      <form className="tb-auth-form" noValidate onSubmit={event=>{event.preventDefault();void emailAction(mode);}}>
        <div className="tb-auth-field">
          <label htmlFor="tb-cloud-email">Email address</label>
          <div className="tb-auth-input"><input id="tb-cloud-email" type="email" autoComplete="email" inputMode="email" placeholder="you@business.com" value={email} onChange={event=>setEmail(event.target.value)}/></div>
        </div>
        <div className="tb-auth-field">
          <label htmlFor="tb-cloud-password">Password</label>
          <div className="tb-auth-input has-toggle">
            <input id="tb-cloud-password" type={showPassword?'text':'password'} autoComplete={signup?'new-password':'current-password'} placeholder="Your password" value={password} onChange={event=>setPassword(event.target.value)}/>
            <button type="button" className="tb-auth-eye" aria-label={showPassword?'Hide password':'Show password'} aria-pressed={showPassword} onClick={()=>setShowPassword(value=>!value)}>
              {showPassword?<EyeOff size={22} aria-hidden="true"/>:<Eye size={22} aria-hidden="true"/>}
            </button>
          </div>
          {signup?<p className="tb-auth-hint">Use at least 12 characters. Email confirmation and recovery need internet access.</p>:null}
        </div>
        <button className="tb-auth-submit" type="submit" disabled={busy}>
          {busy?(signup?'Creating account…':'Signing in…'):(signup?'Create account':'Sign in')}
        </button>
      </form>

      <div className="tb-auth-links">
        {signup?<>
          <span className="tb-auth-hint">Already have an account?</span>
          <button className="tb-auth-link is-strong" type="button" onClick={()=>switchMode('signin')}>Sign in</button>
        </>:<>
          <button className="tb-auth-link" type="button" disabled={busy} onClick={()=>void requestRecovery()}>Forgot password?</button>
          <span aria-hidden="true"/>
          <button className="tb-auth-link is-strong" type="button" onClick={()=>switchMode('signup')}>Create an account</button>
        </>}
      </div>
      {message?<p role="status" className="tb-auth-status">{message}</p>:null}
      {error?<p role="alert" className="tb-auth-status">{error}</p>:null}
    </>}
  </AuthShell>;
}

/** The Google "G" in its brand colours (the brand guidelines ask for the multicolour mark on a white button). */
function GoogleMark(){
  return <svg width="24" height="24" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
    <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"/>
    <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.2 5.5-4.7 7.2l7.5 5.8c4.4-4.1 7-10.1 7-17.5z"/>
    <path fill="#FBBC05" d="M10.5 28.7c-.5-1.5-.8-3-.8-4.7s.3-3.2.8-4.7l-7.9-6.1C.9 16.4 0 20.1 0 24s.9 7.6 2.6 10.8l7.9-6.1z"/>
    <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.8 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/>
  </svg>;
}
