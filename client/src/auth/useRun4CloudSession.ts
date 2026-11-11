/** Run 4 cloud-only session hook. Local ledger does not depend on it. */
import {useCallback,useEffect,useRef,useState} from 'react';
import {getSupabaseClient,isSupabaseConfigured} from '@/lib/supabase';
import {createRun4SessionController,
  type Run4SessionController,type Run4Snapshot} from './run4SessionController.mjs';

export type CloudSessionView=Run4Snapshot|{status:'disabled';userId:null;
  expiresAtEpochMs:null;generation:0};

export function useRun4CloudSession(enabled=true,requireServerProof=false){
  const [state,setState]=useState<CloudSessionView>({
    status:enabled?'checking':'disabled',userId:null,expiresAtEpochMs:null,generation:0
  });
  const controller=useRef<Run4SessionController|null>(null);

  useEffect(()=>{
    if(!enabled){setState({status:'disabled',userId:null,expiresAtEpochMs:null,generation:0});return;}
    if(!isSupabaseConfigured){
      setState({status:'error',userId:null,expiresAtEpochMs:null,generation:0});
      return;
    }
    let mounted=true;
    const client=getSupabaseClient();
    const session=createRun4SessionController({
      auth:{
        getSession:()=>client.auth.getSession(),
        getUser:()=>client.auth.getUser(),
        signOut:()=>client.auth.signOut({scope:'local'}),
        onAuthStateChange:callback=>client.auth.onAuthStateChange(event=>callback(event))
      },
      isOnline:()=>navigator.onLine,
      serverProof:requireServerProof?async ({userId,accessToken,expiresAtEpochMs})=>{
        if(!navigator.onLine||window.location.protocol!=='https:')
          throw Error('Secure server session proof unavailable');
        const res=await fetch('/api/run4/session/verify',{
          method:'POST',credentials:'omit',cache:'no-store',
          headers:{'Authorization':'Bearer '+accessToken},
        });
        if(!res.ok)throw Error('Cloud session was not verified');
        const result:unknown=await res.json();
        if(!result||typeof result!=='object'||Array.isArray(result))
          throw Error('Invalid server session proof');
        const p=result as Record<string,unknown>;
        if(p.active!==true||p.userId!==userId||p.expiresAtEpochMs!==expiresAtEpochMs)
          throw Error('Cloud session was revoked or changed');
        return {active:true,userId,expiresAtEpochMs};
      }:undefined,
      onChange:snapshot=>{if(mounted)setState(snapshot);}
    });
    controller.current=session;
    session.start();
    const refresh=()=>{void session.refresh();};
    const offline=()=>{session.offline();};
    const focus=()=>{if(document.visibilityState==='visible')refresh();};
    window.addEventListener('online',refresh);
    window.addEventListener('offline',offline);
    window.addEventListener('focus',focus);
    document.addEventListener('visibilitychange',focus);
    return ()=>{
      mounted=false;
      session.stop();
      if(controller.current===session)controller.current=null;
      window.removeEventListener('online',refresh);
      window.removeEventListener('offline',offline);
      window.removeEventListener('focus',focus);
      document.removeEventListener('visibilitychange',focus);
    };
  },[enabled,requireServerProof]);

  const retry=useCallback(async()=>controller.current?.refresh(),[]);
  const signOut=useCallback(async()=>controller.current?.signOut()??false,[]);
  return {state,retry,signOut};
}
