import './businessSetup.css';
import { ArrowRight, Store, Users } from 'lucide-react';
import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase";
import { createBusiness } from "./businessIdentity";
import {BUSINESS_TYPES,saveBusinessType,type BusinessType} from "./businessClassification";
import {BusinessTypeEditor} from "./BusinessTypeEditor";
import {listVerifiedCloudBusinesses} from "./cloudMembership";
import type {VerifiedCloudBusiness} from "./cloudMembershipBoundary.mjs";
import {cloudEntryDestination} from "./cloudEntryDestination";
import {Run3MembershipPanel} from "./Run3MembershipPanel";
import {QaDeviceEnrollmentPanel} from './QaDeviceEnrollmentPanel';

/** Account identity only. Creating a cloud business does not claim local data. */
export function CloudBusinessPanel({accountOnly=false,autoOpen=false,showSettings=true}:{accountOnly?:boolean;autoOpen?:boolean;showSettings?:boolean}={}) {
  const [, navigate] = useLocation();
  const [userId, setUserId] = useState<string | null>(null);
  const [business, setBusiness] = useState<VerifiedCloudBusiness | null>(null);
  const [accessible, setAccessible] = useState<VerifiedCloudBusiness[]>([]);
  const [draftName,setDraftName]=useState("");
  const [profileName,setProfileName]=useState("");
  const [email,setEmail]=useState("");
  const [name, setName] = useState("");
  const [businessType,setBusinessType]=useState<BusinessType|"">("");
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
        setUserId(user.id); setEmail(user.email ?? "");
        const metadata=user.user_metadata??{};
        const display=[metadata.preferred_name,metadata.given_name,metadata.full_name,metadata.name]
          .find(value=>typeof value==='string'&&value.trim());
        setProfileName(display?.trim().slice(0,80)??""); setDraftName(display?.trim().slice(0,80)??"");
        const list = await listVerifiedCloudBusinesses();
        if (active && started === revision.current) {
          setAccessible([...list]); setMembershipChecked(true);
          setBusiness(list[0] ?? null);
          if (accountOnly && list.length === 0) {
            try {
              const step = sessionStorage.getItem('tallybook.setup.step:' + user.id);
              if (step === 'owner' || step === 'employee') setChoice(step);
            } catch { /* Continue with the role chooser when storage is unavailable. */ }
          }
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
  }, [accountOnly, membershipRevision]);

  // A unique server-verified company enters its appropriate home automatically.
  // Unlinked users remain in onboarding; multiple memberships require explicit selection.
  useEffect(() => {
    if (!accountOnly || !autoOpen || !userId || !membershipChecked || accessible.length !== 1 || !business) return;
    navigate(cloudEntryDestination(business.role));
  }, [accountOnly, autoOpen, userId, membershipChecked, accessible, business, navigate]);

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
  function selectSetup(next: 'owner' | 'employee' | null) {
    setChoice(next);
    if (accountOnly && userId) {
      try {
        const key = 'tallybook.setup.step:' + userId;
        if (next) sessionStorage.setItem(key, next);
        else sessionStorage.removeItem(key);
      } catch { /* Storage is optional for resuming setup. */ }
    }
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
        if(businessType){
          try{await saveBusinessType(created.id,businessType);}
          catch(cause){
            if(started===revision.current)setError("Your business was created and ownership verified, but its type could not be saved. Use the Business type settings below to retry. "+(cause instanceof Error?cause.message:""));
            return;
          }
        }
        // Never navigate from a stale, authenticated account after an async save.
        if(started!==revision.current)return;
        // Business creation never imports private device records.
        navigate("/shop?view=dashboard");
      }
    } catch (cause) {
      if (started === revision.current) setError(cause instanceof Error ? cause.message : "Could not create the cloud business.");
    } finally {
      inFlight.current = false;
      if (started === revision.current) setBusy(false);
    }
  };

  return <section className={accountOnly ? "tb-verified-panel space-y-3" : "rounded border p-4 space-y-3"} aria-label="Cloud business account">
    {!accountOnly && <h2 className="font-semibold">Cloud business account</h2>}
    {accountOnly && autoOpen && membershipChecked && accessible.length === 1 && business && <p role="status" className="tb-opening-shop">Opening your {business.role === "owner" ? "owner dashboard" : "attendant home"}…</p>}
    {accountOnly && business && showSettings && <h1>Your business</h1>}
    {!isSupabaseConfigured ? <p>Cloud account access has not been configured.</p> : busy ? <p role="status">Checking your cloud business…</p> : !userId ? <Link href="/account" className="underline">Sign in to prepare your cloud business</Link> : business ? <div role="status">
      {accessible.length>1 ? <label className="block text-sm" htmlFor="cloud-select">Cloud company
        <select id="cloud-select" className="ml-2 rounded border p-1" value={business.id}
          onChange={event=>setBusiness(accessible.find(entry=>entry.id===event.target.value)??null)}>
          {accessible.map(entry=><option key={entry.id} value={entry.id}>{entry.name}</option>)}
        </select>
      </label> : null}
      <p className="tb-business-name">{business.name}</p>
      <p className="text-sm">{business.role === "owner"
        ? "View your shop’s sales, stock and team."
        : "Record sales at your assigned store."}</p>
      <Link href={cloudEntryDestination(business.role)} className="primary-action">
        {business.role === "owner" ? "Open owner dashboard" : "Open attendant home"}
      </Link>{business.role==="owner"&&showSettings&&<BusinessTypeEditor key={business.id} companyId={business.id}/>}</div> : !membershipChecked ? <p>Business membership could not be checked. Reload to retry.</p> : <div className="space-y-3">{(!accountOnly || !choice) && <>{accountOnly ? <div className="tb-role-intro">
          <p>Tallybook · by Alchemy</p>
          <h1>What will your role be?</h1>
          <span>You’re signed in. Create your shop or join your employer’s shop.</span>
        </div> : <h3 className="text-xl font-semibold">How will you use Tallybook?</h3>}
        <div className="tb-role-grid grid gap-3">
          <button type="button" aria-label="I own a business" className="tb-role-option" aria-pressed={choice==="owner"} onClick={()=>selectSetup("owner")}>
            <Store aria-hidden="true"/><span><strong>I own a business</strong><small>Create my business and manage my team.</small></span><ArrowRight aria-hidden="true"/>
          </button>
          <button type="button" aria-label="I work for someone else" className="tb-role-option" aria-pressed={choice==="employee"} onClick={()=>{selectSetup("employee");setName("");}}>
            <Users aria-hidden="true"/><span><strong>I work for someone else</strong><small>Join my employer’s shop using an invitation.</small></span><ArrowRight aria-hidden="true"/>
          </button>
        </div></>}
        {accountOnly && choice && <div className="tb-role-intro">
          <button type="button" className="secondary-action" onClick={()=>{selectSetup(null);setError(null);}}>Back to role selection</button>
          <h1>{choice==="owner" ? "Create your business" : "Join your employer’s shop"}</h1>
        </div>}
        {choice==="employee"?<div className="tb-join-guidance"><p>Ask your employer to invite <strong>{email || "the email you signed in with"}</strong>. Enter the private invitation below, or use an eight-character shop join code.</p><Link href="/shop" className="secondary-action">Use an eight-character join code</Link></div>:choice==="owner"?<form className="space-y-2" onSubmit={event => { event.preventDefault(); void create(); }}>
      <p className="text-sm">Creating a business does not upload sales, stock or customer records from this device.</p>
      <label className="block" htmlFor="cloud-business-name">Business name</label>
      <input className="w-full rounded border p-2" id="cloud-business-name" value={name} onChange={event => setName(event.target.value)} required maxLength={80} />
      <label className="block" htmlFor="cloud-business-type">What kind of business? (optional)</label>
      <select id="cloud-business-type" value={businessType} onChange={event=>setBusinessType(event.target.value as BusinessType|"")} className="w-full rounded border p-2">
        <option value="">Choose later</option>{BUSINESS_TYPES.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}
      </select>
      <p className="tb-business-type-hint">This helps describe your business. Your chosen type does not lock features or change sales/refund permissions.</p>
      <button className="primary-action" type="submit" disabled={!name.trim()}>Create business</button>
    </form>:null}</div>}
    {isSupabaseConfigured && userId &&
      (choice==="employee" || (!accountOnly && import.meta.env.VITE_TALLYBOOK_RUN3_MEMBERSHIP_PREVIEW === "true"))
      ? <Run3MembershipPanel key={userId+":"+(business?.id ?? "")} userId={userId} companyId={business?.id ?? null}
         isOwner={business?.role === "owner"} onAccepted={()=>setMembershipRevision(value=>value+1)}/> : null}
    {accountOnly&&showSettings&&userId&&profileName&&<p className="text-xl font-semibold">Hi, {profileName.split(/\s+/)[0]}</p>}
    {accountOnly&&showSettings&&userId&&<details className="rounded border p-3"><summary>My profile</summary>
      <form onSubmit={event=>{event.preventDefault();void saveProfileName();}}>
        <label htmlFor="preferred-name">What should we call you?</label>
        <input id="preferred-name" autoComplete="given-name" maxLength={80} value={draftName} onChange={event=>setDraftName(event.target.value)} className="block w-full rounded border p-2"/>
        <button type="submit" className="secondary-action" disabled={busy||!draftName.trim()||draftName.trim()===profileName}>Save name</button>
      </form>
      <p>Shop role: {business?.role??(membershipChecked ? "No shared shop linked yet" : "Checking membership")}</p>
      <p className="break-all">Signed in as: {email || userId}</p>
    </details>}
    {error && <p role="alert">{error}</p>}
    {!accountOnly&&isSupabaseConfigured&&userId&&business&&
      import.meta.env.VITE_TALLYBOOK_RUN3_MEMBERSHIP_PREVIEW==='true'&&
      import.meta.env.VITE_SUPABASE_URL==='https://lmneuqxfyxplrxjswpma.supabase.co'
      ?<QaDeviceEnrollmentPanel userId={userId} companyId={business.id} isOwner={business.role==='owner'}/>:null}
  </section>;
}






