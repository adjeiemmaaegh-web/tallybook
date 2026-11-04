import './businessSetup.css';
import { Store, Users } from 'lucide-react';
import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase";
import { createBusiness } from "./businessIdentity";
import {listVerifiedCloudBusinesses} from "./cloudMembership";
import type {VerifiedCloudBusiness} from "./cloudMembershipBoundary.mjs";
import {Run3MembershipPanel} from "./Run3MembershipPanel";
import {QaDeviceEnrollmentPanel} from './QaDeviceEnrollmentPanel';

/** Account identity only. Creating a cloud business does not claim local data. */
export function CloudBusinessPanel({accountOnly=false}:{accountOnly?:boolean}={}) {
  const [userId, setUserId] = useState<string | null>(null);
  const [business, setBusiness] = useState<VerifiedCloudBusiness | null>(null);
  const [accessible, setAccessible] = useState<VerifiedCloudBusiness[]>([]);
  const [draftName,setDraftName]=useState("");
  const [profileName,setProfileName]=useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [choice,setChoice]=useState<'owner'|'employee'|null>(null);
  const [membershipChecked,setMembershipChecked]=useState(false);
  const [membershipRevision,setMembershipRevision]=useState(0);
  const revision = useRef(0);
  const inFlight = useRef(false);
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let active = true;
    const client = getSupabaseClient();
    const refresh = async () => {
      const started = ++revision.current; setChoice(null); setName(""); setMembershipChecked(false);
      setUserId(null); setBusiness(null); setAccessible([]); setError(null); setBusy(true);
      try {
        const { data: { user }, error: authError } = await client.auth.getUser();
        if (!active || started !== revision.current) return;
        if (authError || !user) { setBusy(false); return; }
        setUserId(user.id);
        const metadata=user.user_metadata??{};
        const display=[metadata.preferred_name,metadata.given_name,metadata.full_name,metadata.name]
          .find(value=>typeof value==='string'&&value.trim());
        setProfileName(display?.trim().slice(0,80)??""); setDraftName(display?.trim().slice(0,80)??"");
        const list = await listVerifiedCloudBusinesses();
        if (active && started === revision.current) {
          setAccessible([...list]); setMembershipChecked(true);
          setBusiness(list[0] ?? null);
        }
      } catch (cause) {
        if (active && started === revision.current) setError(cause instanceof Error ? cause.message : "Could not check your cloud business.");
      } finally {
        if (active && started === revision.current) setBusy(false);
      }
    };
    // Defer async auth work outside the Supabase auth callback lock.
    const { data: { subscription } } = client.auth.onAuthStateChange(() => {
      revision.current++;
      setUserId(null); setBusiness(null); setAccessible([]);
      setTimeout(() => { if (active) void refresh(); }, 0);
    });
    void refresh();
    return () => { active = false; revision.current++; subscription.unsubscribe(); };
  }, [membershipRevision]);

  async function saveProfileName(){
    const preferred=draftName.trim(), started=revision.current;
    if(!preferred||preferred.length>80||!userId||inFlight.current)return;
    inFlight.current=true;setBusy(true);setError(null);
    try{
      const auth=getSupabaseClient().auth;
      const verified=await auth.getUser();
      if(verified.error||verified.data.user?.id!==userId||started!==revision.current)throw Error("Sign in again to update your profile.");
      const result=await auth.updateUser({data:{preferred_name:preferred}});
      if(result.error||result.data.user?.id!==userId)throw Error("Could not save your preferred name.");
      if(started===revision.current)setProfileName(preferred);
    }catch(cause){if(started===revision.current)setError(cause instanceof Error?cause.message:"Could not update profile.");}
    finally{inFlight.current=false;if(started===revision.current)setBusy(false);}
  }
  const create = async () => {
    if (!membershipChecked || choice !== "owner" || !userId || inFlight.current || !name.trim()) return;
    inFlight.current = true;
    const started = revision.current;
    setBusy(true); setError(null);
    try {
      const { data: { user }, error: authError } = await getSupabaseClient().auth.getUser();
      if (authError || user?.id !== userId || started !== revision.current) throw new Error("Your account changed. Check your sign-in and try again.");
      const key = `tallybook.cloud.create.v1:${import.meta.env.VITE_SUPABASE_URL}:${userId}:${encodeURIComponent(name.trim())}`;
      // Persist before the request so a lost response/reload can safely retry.
      if (!navigator.locks) throw new Error("This browser cannot safely prepare a cloud business. Use an updated browser.");
      const requestId = await navigator.locks.request("tallybook.cloud.create", () => {
        const id = localStorage.getItem(key) ?? crypto.randomUUID();
        localStorage.setItem(key, id);
        return id;
      });
      if (started !== revision.current) throw new Error("Your account changed. Check your sign-in and try again.");
      const result = await createBusiness(name, requestId);
      // A creation receipt alone is not membership evidence. Re-query through
      // RLS and verified account identity before presenting owner controls.
      const verified = await listVerifiedCloudBusinesses();
      const created = verified.find(entry => entry.id === result.id);
      if (!created || created.role !== "owner" ||
          created.owner_id !== userId || result.owner_id !== userId)
        throw new Error("Cloud business ownership could not be verified.");
      if (started === revision.current) {
        setBusiness(created);
        setAccessible([...verified]);
      }
    } catch (cause) {
      if (started === revision.current) setError(cause instanceof Error ? cause.message : "Could not create the cloud business.");
    } finally {
      inFlight.current = false;
      if (started === revision.current) setBusy(false);
    }
  };

  return <section className="rounded border p-4 space-y-3" aria-label="Cloud business account">
    {accountOnly&&userId&&profileName&&<p className="text-xl font-semibold">Hi, {profileName.split(/\s+/)[0]}</p>}
    {accountOnly&&userId&&<details open={profileName?undefined:true} className="rounded border p-3"><summary>My profile</summary>
      <form onSubmit={event=>{event.preventDefault();void saveProfileName();}}>
        <label htmlFor="preferred-name">What should we call you?</label>
        <input id="preferred-name" autoComplete="given-name" maxLength={80} value={draftName} onChange={event=>setDraftName(event.target.value)} className="block w-full rounded border p-2"/>
        <button type="submit" disabled={busy||!draftName.trim()||draftName.trim()===profileName}>Save name</button>
      </form>
      <p>Shop role: {business?.role??"Awaiting verified membership"}</p>
      <p className="break-all">Account ID: {userId}</p>
    </details>}
    <h2 className="font-semibold">{accountOnly ? "Business setup" : "Cloud business account"}</h2>
    <p className="text-sm">Prepare your business account for cloud services. Local sales, stock and customer records are not uploaded or linked by this step.</p>
    {!isSupabaseConfigured ? <p>Cloud account access has not been configured.</p> : busy ? <p role="status">Checking your cloud business…</p> : !userId ? <Link href="/account" className="underline">Sign in to prepare your cloud business</Link> : business ? <div role="status">
      {accessible.length>1 ? <label className="block text-sm" htmlFor="cloud-select">Cloud company
        <select id="cloud-select" className="ml-2 rounded border p-1" value={business.id}
          onChange={event=>setBusiness(accessible.find(entry=>entry.id===event.target.value)??null)}>
          {accessible.map(entry=><option key={entry.id} value={entry.id}>{entry.name}</option>)}
        </select>
      </label> : null}
      <p className="font-semibold">{business.name}</p>{accountOnly&&business.role==="owner"&&<Link href="/" className="primary-action">Open my workspace</Link>}<p className="text-sm">{business.role === "owner" ? "Verified cloud owner membership." : "Verified cloud attendant membership."} This is account membership only, not a local staff unlock. Record synchronization is not active yet.</p></div> : !membershipChecked ? <p>Business membership could not be checked. Reload to retry.</p> : <div className="space-y-3"><h3 className="text-xl font-semibold">How will you use Tallybook?</h3>
        <div className="grid gap-3">
          <button type="button" aria-label="I own a business" className="tb-role-option" aria-pressed={choice==="owner"} onClick={()=>setChoice("owner")}>
            <Store aria-hidden="true"/><span><strong>I own a business</strong><small>Create a business account for your shop.</small></span>
          </button>
          <button type="button" aria-label="I work for someone else" className="tb-role-option" aria-pressed={choice==="employee"} onClick={()=>{setChoice("employee");setName("");}}>
            <Users aria-hidden="true"/><span><strong>I work for someone else</strong><small>Find your account ID to share with your employer.</small></span>
          </button>
        </div>{choice==="employee"?<p>Give your employer your account ID <code>{userId}</code> so they can invite you to the correct business.</p>:choice==="owner"?<form className="space-y-2" onSubmit={event => { event.preventDefault(); void create(); }}>
      <label className="block" htmlFor="cloud-business-name">Cloud business name</label>
      <input className="w-full rounded border p-2" id="cloud-business-name" value={name} onChange={event => setName(event.target.value)} required maxLength={80} />
      <button className="rounded border px-4 py-2" type="submit" disabled={!name.trim()}>Create cloud business</button>
    </form>:null}</div>}
    {isSupabaseConfigured && userId &&
      (choice==="employee" || business?.role==="owner" || import.meta.env.VITE_TALLYBOOK_RUN3_MEMBERSHIP_PREVIEW === "true")
      ? <Run3MembershipPanel key={userId+":"+(business?.id ?? "")} userId={userId} companyId={business?.id ?? null}
         isOwner={business?.role === "owner"} onAccepted={()=>setMembershipRevision(value=>value+1)}/> : null}
    {error && <p role="alert">{error}</p>}
    {!accountOnly&&isSupabaseConfigured&&userId&&business&&
      import.meta.env.VITE_TALLYBOOK_RUN3_MEMBERSHIP_PREVIEW==='true'&&
      import.meta.env.VITE_SUPABASE_URL==='https://lmneuqxfyxplrxjswpma.supabase.co'
      ?<QaDeviceEnrollmentPanel userId={userId} companyId={business.id} isOwner={business.role==='owner'}/>:null}
  </section>;
}






