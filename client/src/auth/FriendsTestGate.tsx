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

export async function checkTesterBinding(userId:string, isCurrent:()=>boolean,
  hasCompany=async()=>(await db.businessProfiles.count())>0):Promise<'allow'|'deny'> {
  const existing=window.localStorage.getItem(BINDING_KEY);
  if(existing)return isCurrent()&&existing===userId?'allow':'deny';
  if(!navigator.locks)return 'deny';
  return navigator.locks.request('tallybook.tester-binding.v1',{mode:'exclusive',ifAvailable:true},async lock=>{
    if(!lock||!isCurrent())return 'deny' as const;
    const occupied=await hasCompany();
    if(!isCurrent())return 'deny' as const;
    const bound=window.localStorage.getItem(BINDING_KEY)??undefined;
    const decision=decideFriendsWorkspaceBinding(bound,occupied,userId);
    if(decision==='bind')window.localStorage.setItem(BINDING_KEY,userId);
    return decision==='deny'?'deny' as const:'allow' as const;
  });
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
    void checkTesterBinding(userId,()=>active).then(decision=>{if(active)setAccess({userId,status:decision==='deny'?'deny':'allow'});})
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

