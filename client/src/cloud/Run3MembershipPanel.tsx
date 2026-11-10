import {useEffect,useState} from 'react';
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
 useEffect(()=>{setTarget('');setToken('');setIssued(null);setMembers([]);setMessage('');},
  [userId,companyId]);
 async function execute(task:()=>Promise<void>){
  if(busy)return;setBusy(true);setMessage('');
  try{await task();}catch(e){setMessage(e instanceof Error?e.message:'Cloud action denied.');}
  finally{setBusy(false);}
 }
 const canManage=!!companyId&&isOwner;
 return <section className="rounded border p-4 space-y-3" aria-label="Join a business">
  <h3 className="font-semibold">Have an invitation code?</h3>
  <p className="text-sm">The code works only for the account it was created for and expires 24 hours after the owner creates it.</p>
  <form className="space-y-2" onSubmit={e=>{e.preventDefault();void execute(async()=>{
    const receipt=await acceptCloudInvitation(token.trim());
    if(receipt.userId!==userId)throw Error('Different account accepted invitation.');
    setToken('');setMessage('You have joined the business. Opening your shop…');onAccepted?.();
  });}}>
   <label className="block" htmlFor="run3-token">Invitation code</label>
   <input id="run3-token" value={token} onChange={e=>setToken(e.target.value)}
    className="w-full rounded border p-2" autoComplete="off" spellCheck={false}/>
   <button type="submit" disabled={busy||!token.trim()} className="primary-action">
    Join business</button>
  </form>
  {canManage?<div className="border-t pt-3 space-y-2">
   <form className="space-y-2" onSubmit={e=>{e.preventDefault();void execute(async()=>{
    const r=await inviteCloudAttendant(companyId!,target.trim());
    setIssued(r);setTarget('');setMessage('One-time invitation created for the selected account.');
   });}}>
    <label htmlFor="run3-recipient" className="block">Attendant account user ID</label>
    <input id="run3-recipient" className="w-full rounded border p-2"
      value={target} onChange={e=>setTarget(e.target.value)} autoComplete="off"/>
    <button type="submit" disabled={busy||!target.trim()} className="rounded border px-3 py-2">
      Create targeted invitation</button>
   </form>
   {issued?<div role="status" className="break-all border rounded p-2">
     <p className="text-sm">One-time invitation token (share privately with its intended account):</p>
     <code>{issued.inviteToken}</code>
     <button type="button" className="block underline" disabled={busy}
      onClick={()=>void execute(async()=>{
       await revokeCloudInvitation(companyId!,issued.invitationId);
       setIssued(null);setMessage('Pending invitation revoked.');
      })}>Revoke this invitation</button>
   </div>:null}
   <button type="button" className="rounded border px-3 py-2" disabled={busy}
    onClick={()=>void execute(async()=>{
     const rows=await listCloudMembers(companyId!);setMembers(rows);
     setMessage('Membership list refreshed.');
    })}>Refresh cloud membership list</button>
   <ul className="space-y-2">{members.map(member=><li key={member.userId}
     className="break-all rounded border p-2 text-sm">
     {member.userId} — {member.role}
     {member.role==='attendant'?<button type="button" disabled={busy}
      className="ml-2 underline" onClick={()=>void execute(async()=>{
       if(!(await confirmAction('Remove this account from this cloud company?')))return;
       await revokeCloudAttendant(companyId!,member.userId);
       setMembers(before=>before.filter(m=>m.userId!==member.userId));
       setMessage('Cloud membership revoked; local files unchanged.');
      })}>Revoke</button>:null}
    </li>)}</ul>
  </div>:null}
  <p role="status" className="text-sm">{message}</p>
 </section>;
}

