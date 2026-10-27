/** V19 Run 4: account controls use verified cloud session state only. */
import {useState} from 'react';
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
  async function submitEmail(mode:'signup'|'signin'){
    if(busy||!isSupabaseConfigured)return;
    setBusy(true);setError(null);setMessage(null);
    try{
      const auth=getSupabaseClient().auth;
      if(mode==='signup'){
        const {data,error:authError}=await auth.signUp({email:email.trim(),password,
          options:{emailRedirectTo:`${window.location.origin}/signin`}});
        if(authError)throw authError;
        setMessage(data.session?'Account created. Your test workspace is ready.':
          'Check your email and confirm your account, then return here to sign in.');
      }else{
        const {error:authError}=await auth.signInWithPassword({email:email.trim(),password});
        if(authError)throw authError;
        setMessage('Signed in. Open your test workspace.');
      }
      setPassword('');
    }catch(e){setError(e instanceof Error?e.message:'Email authentication failed.');}
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
      <p className="eyebrow"><ShieldCheck className="h-4 w-4" aria-hidden="true"/> Cloud authentication</p>
      <h1 style={{fontFamily:'var(--font-display)',fontSize:'2rem',margin:'12px 0 8px'}}>
        Tallybook account</h1>
      <p className="op-row-sub">{import.meta.env.VITE_TALLYBOOK_FRIENDS_TEST_MODE==='true'
        ? 'Sign in to open the website test workspace. Sales, stock, reports and local backups stay in this browser.'
        : 'Cloud identity is optional. Sales, stock, reports and local backups remain on this device without signing in.'}
        {' '}Signing out does not encrypt or erase records stored in this browser.</p>
      <p className="op-row-sub">For website testing, each person should use their own browser profile or device. Business records remain on that device until synchronization is separately enabled.</p>
      {!isSupabaseConfigured?<p role="alert">Cloud account configuration is unavailable.</p>:
       state.status==='checking'?<p role="status">Verifying session with Supabase…</p>:
       state.status==='offline'?<p role="status">Offline. Your local Tallybook remains available.</p>:
       state.status==='signed-in'?<div className="space-y-3">
        <p role="status">Cloud session verified for account <code>{state.userId}</code>.</p>
        <div className="flex flex-wrap gap-2">
          <button className="secondary-action" disabled={busy} type="button"
            onClick={()=>void logOut()}><LogOut className="h-4 w-4"/>Sign out</button>
          <button className="secondary-action" disabled={busy} type="button"
            onClick={()=>void signIn(true)}>Switch Google account</button>
          <Link href="/cloud-account" className="underline">Open cloud account preview</Link>
        </div>
       </div>:
       <div className="space-y-3">
         {state.status==='error'?<p role="alert">Cloud identity could not be verified.
           No local records were changed.</p>:null}
         <button className="primary-action" type="button" disabled={busy}
           onClick={()=>void signIn()}><LogIn className="h-4 w-4"/>
           {busy?'Opening Google…':'Sign in with Google'}</button>
         {state.status==='error'?<button className="secondary-action" type="button"
           onClick={()=>void retry()}><RefreshCw className="h-4 w-4"/>Retry</button>:null}
       </div>}
      {isSupabaseConfigured&&state.status!=='signed-in'?<form className="space-y-3 mt-5" onSubmit={event=>{event.preventDefault();void submitEmail('signin');}}>
        <h2 className="font-semibold">Use email and password</h2>
        <label className="block">Email<input className="w-full rounded border p-3" type="email" autoComplete="email" required value={email} onChange={event=>setEmail(event.target.value)} /></label>
        <label className="block">Password<input className="w-full rounded border p-3" type="password" autoComplete={"current-password"} minLength={6} required value={password} onChange={event=>setPassword(event.target.value)} /></label>
        <div className="flex flex-wrap gap-2"><button className="primary-action" type="submit" disabled={busy}>Sign in with email</button>
        <button className="secondary-action" type="button" disabled={busy} onClick={()=>void submitEmail('signup')}>Create account</button></div>
      </form>:null}
      {message?<p role="status">{message} <Link href="/">Open test workspace</Link></p>:null}
      {error?<p role="alert">{error}</p>:null}
    </section>
    <Link href="/" className="back-link">{import.meta.env.VITE_TALLYBOOK_FRIENDS_TEST_MODE==='true'?'Open test workspace':'Return to offline Tallybook'}</Link>
  </div>;
}
