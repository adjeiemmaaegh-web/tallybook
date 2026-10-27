import { useEffect, useState, type ReactNode } from 'react';
import { db } from '@/db/TallybookDB';
import { useRun4CloudSession } from './useRun4CloudSession';
import GoogleSignInPage from '@/pages/GoogleSignInPage';

const BINDING_KEY = 'friendsTestVerifiedAuthUserId';
export const friendsTestMode = import.meta.env.VITE_TALLYBOOK_FRIENDS_TEST_MODE === 'true';

export function decideFriendsWorkspaceBinding(boundUserId:string|undefined,
  hasExistingCompany:boolean,userId:string):'allow'|'bind'|'deny'{
  if(boundUserId)return boundUserId===userId?'allow':'deny';
  return hasExistingCompany?'deny':'bind';
}

/** The review origin must be fresh. Never attach an existing local ledger to a new cloud user. */
export function FriendsTestGate({children}:{children:ReactNode}){
  const {state}=useRun4CloudSession(true);
  const [access,setAccess]=useState<{userId:string;status:'checking'|'allow'|'deny'}|null>(null);
  useEffect(()=>{
    const userId=state.status==='signed-in'?state.userId:null;
    if(!userId){setAccess(null);return;}
    let active=true;
    setAccess({userId,status:'checking'});
    void (async()=>{
      const bound=window.localStorage.getItem(BINDING_KEY)??undefined;
      const hasExistingCompany=(await db.businessProfiles.count())>0;
      const decision=decideFriendsWorkspaceBinding(bound,hasExistingCompany,userId);
      if(decision==='bind')window.localStorage.setItem(BINDING_KEY,userId);
      return decision;
    })().then(decision=>{if(active)setAccess({userId,status:decision==='deny'?'deny':'allow'});})
      .catch(()=>{if(active)setAccess({userId,status:'deny'});});
    return()=>{active=false;};
  },[state.status,state.userId]);

  if(state.status==='checking'||state.status==='disabled')
    return <main className="mx-auto max-w-lg p-6" role="status">Checking your Tallybook account…</main>;
  if(state.status==='signed-out')return <GoogleSignInPage/>;
  if(state.status==='offline')return <main className="mx-auto max-w-lg p-6" role="status">Connect to the internet to verify your test account, then your local records can be opened.</main>;
  if(state.status==='error')return <main className="mx-auto max-w-lg p-6" role="alert">Your account could not be verified. Check your connection and reload this page.</main>;
  if(!access||access.userId!==state.userId||access.status==='checking')
    return <main className="mx-auto max-w-lg p-6" role="status">Checking this browser's test workspace…</main>;
  if(access.status==='deny')return <main className="mx-auto max-w-lg p-6 space-y-3" role="alert">
    <h1 className="text-xl font-semibold">This browser contains another local workspace</h1>
    <p>Use your own device or a new browser profile for testing. No local records were opened, changed or erased.</p>
    <GoogleSignInPage/>
  </main>;
  return <>{children}</>;
}
