import { useEffect, useState, type ReactNode } from 'react';
import { db } from '@/db/TallybookDB';
import { useRun4CloudSession } from './useRun4CloudSession';
import { Redirect, Link } from 'wouter';
import { listVerifiedCloudBusinesses } from '@/cloud/cloudMembership';
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase';
import { Store, LogOut, ShieldCheck, WifiOff } from 'lucide-react';

const BINDING_KEY = 'friendsTestVerifiedAuthUserId';
/** Set after an online check proves this account owns a cloud business; lets that owner return offline. */
const VERIFIED_OWNER_KEY = 'tallybook.entry.verifiedOwner.v1';
export const friendsTestMode = import.meta.env.VITE_TALLYBOOK_FRIENDS_TEST_MODE === 'true';

export function decideFriendsWorkspaceBinding(boundUserId:string|undefined,
  hasExistingCompany:boolean,userId:string):'allow'|'bind'|'deny'{
  if(boundUserId)return boundUserId===userId?'allow':'deny';
  return hasExistingCompany?'deny':'bind';
}

function read(key:string){try{return window.localStorage.getItem(key);}catch{return null;}}

export async function checkTesterBinding(userId:string, isCurrent:()=>boolean,
  hasCompany=async()=>(await db.businessProfiles.count())>0):Promise<'allow'|'deny'> {
  const existing=read(BINDING_KEY);
  if(existing)return isCurrent()&&existing===userId?'allow':'deny';
  if(!navigator.locks)return 'deny';
  return navigator.locks.request('tallybook.tester-binding.v1',{mode:'exclusive',ifAvailable:true},async lock=>{
    if(!lock||!isCurrent())return 'deny' as const;
    const occupied=await hasCompany();
    if(!isCurrent())return 'deny' as const;
    const bound=read(BINDING_KEY)??undefined;
    const decision=decideFriendsWorkspaceBinding(bound,occupied,userId);
    if(decision==='bind')window.localStorage.setItem(BINDING_KEY,userId);
    return decision==='deny'?'deny' as const:'allow' as const;
  });
}

/** The owner explicitly takes over an unclaimed ledger already on this browser. The local staff PIN still guards it. */
export async function claimExistingWorkspace(userId:string):Promise<boolean>{
  if(!navigator.locks)return false;
  return navigator.locks.request('tallybook.tester-binding.v1',{mode:'exclusive'},async()=>{
    const bound=read(BINDING_KEY);
    if(bound&&bound!==userId)return false;
    window.localStorage.setItem(BINDING_KEY,userId);
    return true;
  });
}

/** An owner who verified online on this browser may reopen its ledger offline. */
export async function allowOfflineReturn(getCachedUserId:()=>Promise<string|null>):Promise<boolean>{
  const bound=read(BINDING_KEY), verified=read(VERIFIED_OWNER_KEY);
  if(!bound||bound!==verified)return false;
  try{return (await getCachedUserId())===bound;}catch{return false;}
}

type Access={userId:string|null;status:'checking'|'allow'|'deny'|'claim'|'setup'|'offline'};

function EntryCard({icon,title,children}:{icon:ReactNode;title:string;children:ReactNode}){
  return <main className="tb-entry">
    <section className="tb-entry-card" role="alert">
      <span className="tb-entry-icon" aria-hidden="true">{icon}</span>
      <h1>{title}</h1>
      {children}
    </section>
  </main>;
}

async function signOutHere(){
  try{await getSupabaseClient().auth.signOut();}finally{window.location.assign('/account');}
}

/**
 * Entry to this device's ledger: a verified cloud owner, on a browser that is theirs.
 * Never attaches one account's local ledger to another account without the owner choosing it.
 */
export function FriendsTestGate({children}:{children:ReactNode}){
  const {state}=useRun4CloudSession(true);
  const [access,setAccess]=useState<Access|null>(null);
  const [names,setNames]=useState<string[]>([]);
  const [claiming,setClaiming]=useState(false);
  useEffect(()=>{
    let active=true;
    if(state.status==='offline'){
      setAccess({userId:null,status:'checking'});
      void allowOfflineReturn(async()=>isSupabaseConfigured
        ?(await getSupabaseClient().auth.getSession()).data.session?.user.id??null:null)
        .then(ok=>{if(active)setAccess({userId:null,status:ok?'allow':'offline'});});
      return()=>{active=false;};
    }
    const userId=state.status==='signed-in'?state.userId:null;
    if(!userId){setAccess(null);return;}
    setAccess(previous=>previous?.userId===userId&&previous.status!=='checking'?previous:{userId,status:'checking'});
    void (async()=>{
      const businesses=await listVerifiedCloudBusinesses();
      if(!active)return;
      if(!businesses.some(business=>business.role==='owner'&&business.owner_id===userId)){
        setAccess({userId,status:'setup'});
        return;
      }
      const bound=read(BINDING_KEY);
      if(!bound&&(await db.businessProfiles.count())>0){
        const local=await db.businessProfiles.toArray();
        if(!active)return;
        setNames(local.map(profile=>profile.name).filter(Boolean));
        setAccess({userId,status:'claim'});
        return;
      }
      let status=await checkTesterBinding(userId,()=>active);
      // Another tab may have bound this browser for the same account while the lock was busy.
      if(status==='deny'&&read(BINDING_KEY)===userId)status='allow';
      if(status==='allow')try{window.localStorage.setItem(VERIFIED_OWNER_KEY,userId);}catch{/* offline return stays off */}
      if(active)setAccess({userId,status});
    })()
      .catch(()=>{if(active)setAccess({userId,status:'deny'});});
    return()=>{active=false;};
  },[state.status,state.userId]);

  if(state.status==='checking'||state.status==='disabled'||(access?.status==='checking'))
    return <main className="tb-entry" role="status"><p className="tb-entry-wait">Opening your Tallybook…</p></main>;
  if(state.status==='signed-out')return <Redirect to='/welcome' replace/>;
  if(state.status==='offline'&&access?.userId===null&&access.status==='allow')return <>{children}</>;
  if(state.status==='offline')return <EntryCard icon={<WifiOff/>} title="Connect once to open Tallybook">
    <p>The first time you open this device's ledger, Tallybook checks your account online. After that it opens offline on this device.</p>
  </EntryCard>;
  if(state.status==='error')return <EntryCard icon={<ShieldCheck/>} title="We couldn't check your account">
    <p>Check your connection, then try again. Nothing on this device was changed.</p>
    <div className="tb-entry-actions">
      <button type="button" className="primary-action" onClick={()=>window.location.reload()}>Try again</button>
      <Link href="/welcome" className="secondary-action">View Tallybook welcome</Link>
    </div>
  </EntryCard>;
  if(!access||access.userId!==state.userId)
    return <main className="tb-entry" role="status"><p className="tb-entry-wait">Opening your Tallybook…</p></main>;
  if(access.status==='setup')return <Redirect to='/account' replace/>;
  if(access.status==='claim')return <EntryCard icon={<Store/>} title="Use the ledger already on this device?">
    <p>This browser already holds {names.length?<strong>{names.join(', ')}</strong>:'a Tallybook business'} from before you signed in.
      Open it with your account to keep its sales, stock and customers. Your staff PIN still protects it.</p>
    <div className="tb-entry-actions">
      <button type="button" className="primary-action" disabled={claiming} onClick={()=>{
        setClaiming(true);
        void claimExistingWorkspace(access.userId!).then(ok=>{
          if(ok){try{window.localStorage.setItem(VERIFIED_OWNER_KEY,access.userId!);}catch{/* offline return stays off */}}
          setAccess({userId:access.userId,status:ok?'allow':'deny'});
        }).finally(()=>setClaiming(false));
      }}>{claiming?'Opening…':'Open it with my account'}</button>
      <Link href="/shop" className="secondary-action">Open shared shop instead</Link>
    </div>
  </EntryCard>;
  if(access.status==='deny')return <EntryCard icon={<ShieldCheck/>} title="This device's ledger belongs to another account">
    <p>It was opened with a different Tallybook sign-in, so we won't show its records to this account. Nothing was opened, changed or erased.</p>
    <p>Sign in with the account that set it up, or use your shared shop.</p>
    <div className="tb-entry-actions">
      <Link href="/shop" className="primary-action">Open shared shop</Link>
      <button type="button" className="secondary-action" onClick={()=>void signOutHere()}><LogOut className="h-4 w-4" aria-hidden="true"/>Sign out</button>
    </div>
  </EntryCard>;
  return <>{children}</>;
}
