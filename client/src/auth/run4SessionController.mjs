/** V19 Run 4: verified, memory-only cloud session state machine.
 * Supabase auth events and getSession are NOT proof of authentication.
 * Only getUser(), a matching cached token, expiry and the active generation
 * may establish UI cloud identity. Local IndexedDB access is separate.
 */
const denied=()=>{throw Error('Verified cloud session required');};
const validId=x=>typeof x==='string'&&x.length>0&&x.length<=128&&x.trim()===x;
export function createRun4SessionController({
  auth,clock=Date.now,isOnline=()=>true,
  schedule=fn=>{const id=setTimeout(fn,0);return ()=>clearTimeout(id);},
  alarm=(fn,ms)=>{const id=setTimeout(fn,ms);return ()=>clearTimeout(id);},
  onChange=()=>{}
}={}){
  if(typeof auth?.getUser!=='function'||typeof auth?.getSession!=='function'||
     typeof auth?.onAuthStateChange!=='function'||typeof auth?.signOut!=='function')denied();
  let generation=0,started=false,disposed=false,verifiedToken=null,expiryCancel=null;
  let subscription=null;
  let current=Object.freeze({status:'checking',userId:null,expiresAtEpochMs:null,generation:0});
  const emit=(status,userId=null,expiresAtEpochMs=null)=>{
    current=Object.freeze({status,userId,expiresAtEpochMs,generation});
    onChange(current);
    return current;
  };
  const clearAlarm=()=>{if(expiryCancel){expiryCancel();expiryCancel=null;}};
  const invalidate=(status='checking')=>{
    generation++;verifiedToken=null;clearAlarm();
    return emit(status);
  };
  const same=number=>!disposed&&number===generation;
  const validSession=(session,at)=>{
    if(!session||!validId(session.user?.id)||
       typeof session.access_token!=='string'||session.access_token.length<20||
       !Number.isSafeInteger(session.expires_at)||session.expires_at<=0||
       session.expires_at>Math.floor(Number.MAX_SAFE_INTEGER/1000))return false;
    const exp=session.expires_at*1000;
    return Number.isSafeInteger(at)&&exp>at;
  };
  async function refresh(){
    if(disposed)return current;
    const seq=++generation;
    verifiedToken=null;clearAlarm();emit('checking');
    if(!isOnline()){if(same(seq))emit('offline');return current;}
    try{
      const first=await auth.getSession();
      if(!same(seq))return current;
      if(first?.error){emit('error');return current;}
      const session=first?.data?.session,at=clock();
      if(!validSession(session,at)){emit('signed-out');return current;}
      const checked=await auth.getUser();
      if(!same(seq))return current;
      if(checked?.error||!validId(checked?.data?.user?.id)||
         checked.data.user.id!==session.user.id){
        emit('error');return current;
      }
      // Token changes, sign-out and account switching during getUser must not
      // reanimate a previous account from a stale in-flight result.
      const final=await auth.getSession();
      if(!same(seq))return current;
      if(final?.error||!validSession(final?.data?.session,clock())||
         final.data.session.user.id!==session.user.id||
         final.data.session.access_token!==session.access_token){
        emit('signed-out');return current;
      }
      if(!isOnline()){emit('offline');return current;}
      verifiedToken=session.access_token;
      const deadline=session.expires_at*1000;
      const state=emit('signed-in',session.user.id,deadline);
      const delay=Math.max(1,Math.min(2147483647,deadline-clock()));
      expiryCancel=alarm(()=>{
        if(same(seq)){
          invalidate('checking');
          schedule(()=>{if(!disposed)void refresh();});
        }
      },delay);
      return state;
    }catch{
      if(same(seq))emit(isOnline()?'error':'offline');
      return current;
    }
  }
  function authEvent(event){
    if(disposed)return;
    // The event's session is deliberately ignored, including INITIAL_SESSION
    // and TOKEN_REFRESHED. Never trust a locally editable session object.
    if(event==='SIGNED_OUT'){invalidate('signed-out');return;}
    invalidate(isOnline()?'checking':'offline');
    schedule(()=>{if(!disposed)void refresh();});
  }
  function start(){
    if(disposed)denied();
    if(started)return current;
    started=true;
    const result=auth.onAuthStateChange(event=>authEvent(event));
    subscription=result?.data?.subscription??null;
    schedule(()=>{if(!disposed)void refresh();});
    return current;
  }
  function stop(){
    if(disposed)return;
    disposed=true;generation++;verifiedToken=null;clearAlarm();
    subscription?.unsubscribe?.();subscription=null;
  }
  async function signOut(){
    invalidate('signed-out');
    try{
      const result=await auth.signOut();
      if(result?.error)throw Error('Sign out was not confirmed');
      return true;
    }catch{
      // Do not restore an unverified session after an unsuccessful sign-out.
      emit('error');return false;
    }
  }
  async function runVerified(work){
    if(typeof work!=='function')denied();
    const before=await refresh();
    if(before.status!=='signed-in'||!verifiedToken)denied();
    const initialToken=verifiedToken,initialGeneration=generation;
    const value=await work({userId:before.userId});
    if(disposed||generation!==initialGeneration||verifiedToken!==initialToken)denied();
    const after=await refresh();
    if(after.status!=='signed-in'||after.userId!==before.userId||
       verifiedToken!==initialToken)denied();
    return value;
  }
  return Object.freeze({
    start,stop,refresh,signOut,runVerified,
    getSnapshot:()=>current,
    offline:()=>invalidate('offline'),
    invalidate,
    authEvent
  });
}
