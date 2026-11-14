import {useEffect,useRef,useState} from 'react';
import {Check,Copy} from 'lucide-react';
import { confirmAction } from "@/lib/confirmAction";
import {acceptCloudInvitation,inviteCloudAttendant,listCloudMembers,
 revokeCloudAttendant,revokeCloudInvitation,type Run3Member} from './run3MembershipClient';
/** Cloud membership preview. Does not grant local POS access or sync records. */
export function Run3MembershipPanel({userId,companyId,isOwner,onAccepted}:{
 userId:string;companyId:string|null;isOwner:boolean;onAccepted?:()=>void
}){
 const [target,setTarget]=useState('');
 const [token,setToken]=useState('');
 const [issued,setIssued]=useState<{inviteToken:string;invitationId:string}|null>(null);
 const [members,setMembers]=useState<Run3Member[]>([]);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('');
 const [copied,setCopied]=useState(false);
 const generation=useRef(0);
 const inFlight=useRef(false);
 useEffect(()=>{
   generation.current++;
   inFlight.current=false;
   setBusy(false);setTarget('');setToken('');setIssued(null);setMembers([]);
   setMessage('');setCopied(false);
   return()=>{generation.current++;};
 },[userId,companyId]);
 async function execute(task:()=>Promise<void>){
   if(inFlight.current)return;
   inFlight.current=true;const initial=generation.current;
   setBusy(true);setMessage('');setCopied(false);
   try{await task();}
   catch(e){if(initial===generation.current)setMessage(e instanceof Error?e.message:'Cloud action denied.');}
   finally{if(initial===generation.current){inFlight.current=false;setBusy(false);}}
 }
 const isCurrent=(stamp:number)=>stamp===generation.current;
 async function copyPrivateCode(){
   if(busy||!issued||!navigator.clipboard?.writeText){setMessage('Copy is unavailable. Select the code and share it privately.');return;}
   try{await navigator.clipboard.writeText(issued.inviteToken);setCopied(true);setMessage('Code copied. Share only with the intended account.');}
   catch{setMessage('Copy is unavailable. Select the code and share it privately.');}
 }
 const canManage=!!companyId&&isOwner;
 return <section className="rounded border p-4 space-y-3" aria-label="Join a business">
  <h3 className="font-semibold">Have an invitation code?</h3>
  <p className="text-sm">Invitations are bound to the intended signed-in account and expire after 24 hours. A code does not grant access to another account.</p>
  <p className="text-sm">If your employer supplied an eight-character shop join code instead, use the shop join page—not this private invitation form.</p>
  <form className="space-y-2" onSubmit={e=>{e.preventDefault();void execute(async()=>{
    const started=generation.current;
    const receipt=await acceptCloudInvitation(token.trim());
    if(!isCurrent(started))return;
    if(receipt.userId!==userId)throw Error('Different account accepted invitation.');
    setToken('');setMessage('Invitation accepted. Verifying your cloud membership…');onAccepted?.();
  });}}>
   <label className="block" htmlFor="run3-token">Invitation code</label>
   <input id="run3-token" value={token} onChange={e=>setToken(e.target.value.trim())}
    className="w-full rounded border p-2 font-mono" autoComplete="off" autoCapitalize="off" spellCheck={false}
    maxLength={50} aria-describedby="run3-token-help"/>
   <small id="run3-token-help" className="block text-sm">Paste the complete private code. Its format begins with v1.</small>
   <button type="submit" disabled={busy||!/^v1\.[A-Za-z0-9_-]{43}$/.test(token)} className="primary-action">
    Join business</button>
  </form>
  {canManage?<div className="border-t pt-3 space-y-2">
   <form className="space-y-2" onSubmit={e=>{e.preventDefault();void execute(async()=>{
    const started=generation.current;
    const recipient=target.trim();
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(recipient))
      throw Error('Enter the intended employee account UUID. Email alone cannot authorize a membership.');
    const r=await inviteCloudAttendant(companyId!,recipient);
    if(!isCurrent(started))return;
    setIssued(r);setTarget('');setMessage('Private invitation created for the selected account.');
   });}}>
    <label htmlFor="run3-recipient" className="block">Employee account ID (UUID)</label>
    <p className="text-sm">The employee must sign in and share their account ID privately. An email address by itself is not sufficient. The server verifies the target again when the code is redeemed.</p>
    <input id="run3-recipient" className="w-full rounded border p-2"
      value={target} onChange={e=>setTarget(e.target.value.trim())} autoComplete="off"
      maxLength={36} spellCheck={false} aria-describedby="run3-recipient-help"/>
    <small id="run3-recipient-help" className="block text-sm">This is not a personal ID number or an Emirates ID.</small>
    <button type="submit" disabled={busy||!target.trim()} className="rounded border px-3 py-2">
      Create targeted invitation</button>
   </form>
   {issued?<div role="status" className="break-all border rounded p-2">
     <p className="text-sm">One-time invitation token (share privately with its intended account):</p>
     <code className="tb-private-invite-code" aria-label="Private invitation token">{issued.inviteToken}</code>
     <button type="button" className="secondary-action inline-flex items-center gap-2" disabled={busy}
       onClick={()=>void copyPrivateCode()}>{copied?<Check aria-hidden="true"/>:<Copy aria-hidden="true"/>}{copied?"Copied":"Copy private code"}</button>
     <button type="button" className="block underline" disabled={busy}
      onClick={()=>void execute(async()=>{
       const started=generation.current;
       await revokeCloudInvitation(companyId!,issued.invitationId);
       if(!isCurrent(started))return;
       setIssued(null);setMessage('Pending invitation revoked.');
      })}>Revoke this invitation</button>
   </div>:null}
   <button type="button" className="rounded border px-3 py-2" disabled={busy}
    onClick={()=>void execute(async()=>{
     const started=generation.current;
     const rows=await listCloudMembers(companyId!);
     if(!isCurrent(started))return;
     setMembers(rows);setMessage('Membership list refreshed.');
    })}>Refresh cloud membership list</button>
   <ul className="space-y-2">{members.map(member=><li key={member.userId}
     className="break-all rounded border p-2 text-sm">
     {member.userId} — {member.role}
     {member.role==='attendant'?<button type="button" disabled={busy}
      className="ml-2 underline" onClick={()=>void execute(async()=>{
       if(!(await confirmAction('Remove this account from this cloud company?')))return;
       const started=generation.current;
       await revokeCloudAttendant(companyId!,member.userId);
       if(!isCurrent(started))return;
       setMembers(before=>before.filter(m=>m.userId!==member.userId));
       setMessage('Cloud membership revoked; local files unchanged.');
      })}>Revoke</button>:null}
    </li>)}</ul>
  </div>:null}
  <p role="status" className="text-sm">{message}</p>
 </section>;
}

