/**
 * Restricted owner enrollment for a newly created, local-only company.
 *
 * This screen is mounted by AppShell only after IndexedDB confirms zero staff
 * and no prior staff governance. It is NOT the ordinary assistant parser.
 * PIN values remain in masked input state, never in chat history or assistant
 * prompts. createStaff() enforces the actual authorization/uniqueness policy.
 */
import {useRef,useState,type FormEvent} from "react";
import {Link} from "wouter";
import {db} from "@/db/TallybookDB";
import {useBusinessProfile} from "@/contexts/BusinessProfileContext";
import {createStaff,unlockStaff} from "@/features/staff/staff";

export default function ClementiaOwnerEnrollment(){
  const {profile,activeCompanyId}=useBusinessProfile();
  const [name,setName]=useState("");
  const [pin,setPin]=useState("");
  const [confirmPin,setConfirmPin]=useState("");
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");
  const [success,setSuccess]=useState(false);
  const active=useRef(false);

  const submit=async(event:FormEvent)=>{
    event.preventDefault();
    if(active.current||success)return;
    setError("");
    if(!profile){setError("No local business is ready. Complete the business setup first.");return;}
    if(name.trim().length<2||name.trim().length>80){setError("Enter the owner's name (2–80 characters).");return;}
    if(!/^\d{6,12}$/.test(pin)||pin!==confirmPin){
      setError("Enter a matching 6–12 digit PIN. The PIN stays outside the chat transcript.");
      return;
    }
    active.current=true;setSaving(true);
    const protectedPin=pin;
    try{
      // Fail closed: a company restored without its staff records must NOT be
      // re-initialized with an attacker-chosen owner credential.
      const [stored,members]=await db.transaction("r",[db.businessProfiles,db.staffMembers],async()=>[
        await db.businessProfiles.get(activeCompanyId),
        await db.staffMembers.where("businessProfileId").equals(activeCompanyId).count(),
      ]);
      if(!stored||stored.id!==profile.id||stored.staffGovernanceEnabled||members!==0)
        throw Error("Owner enrollment is unavailable. Use the existing staff unlock or restore a verified backup.");
      const created=await createStaff(name.trim(),"owner",protectedPin,db);
      // createStaff() marks governance enabled and writes the signed local
      // audit trail. unlockStaff() verifies the freshly hashed PIN before
      // opening the ordinary protected workspace.
      await unlockStaff(created.id,protectedPin,db);
      setSuccess(true);
    }catch(cause){
      setError(cause instanceof Error?cause.message:"Owner enrollment could not be completed.");
    }finally{
      setPin("");setConfirmPin("");setSaving(false);active.current=false;
    }
  };
  return <section className="assistant-page" aria-label="Clementia secure owner setup">
    <section className="assistant-hero">
      <span className="workspace-marker">ASK</span>
      <h1>{success?"Your owner account is ready":"Finish setup securely with Clementia"}</h1>
      <p>{success?"Your local staff account is unlocked. Clementia can now read and prepare actions within your permissions.":
        `Your business ${profile?.name??""} is saved. To protect its records, create the first owner account with a private PIN. This secure form is part of Clementia, not the chat transcript.`}</p>
    </section>
    {!success&&<form className="assistant-composer" onSubmit={event=>void submit(event)}>
      <label className="w-full">Owner display name
        <input className="input assistant-input" aria-label="Owner display name"
          value={name} onChange={event=>setName(event.target.value)} maxLength={80}
          autoComplete="name" disabled={saving} placeholder="Example: Ama Serwaa"/>
      </label>
      <label className="w-full">Choose a private PIN
        <input className="input assistant-input" aria-label="Owner PIN"
          type="password" inputMode="numeric" autoComplete="new-password"
          value={pin} onChange={event=>setPin(event.target.value)}
          maxLength={12} disabled={saving} placeholder="6–12 digits"/>
      </label>
      <label className="w-full">Repeat your PIN
        <input className="input assistant-input" aria-label="Confirm owner PIN"
          type="password" inputMode="numeric" autoComplete="new-password"
          value={confirmPin} onChange={event=>setConfirmPin(event.target.value)}
          maxLength={12} disabled={saving} placeholder="Confirm PIN"/>
      </label>
      {error&&<p role="alert">{error}</p>}
      <button type="submit" className="primary-action assistant-send" disabled={saving}>
        {saving?"Securing owner account…":"Create and unlock owner"}
      </button>
    </form>}
    <p role="status">{success?"Owner enrolled. You can start working with Clementia.":"Your PIN is never included in a message to the assistant."}</p>
    <p>If you prefer the standard protected enrollment form, <Link href="/staff">open Staff setup</Link>.</p>
  </section>;
}
