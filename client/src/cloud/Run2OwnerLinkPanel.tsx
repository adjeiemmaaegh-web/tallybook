import {useState} from 'react';
import {getSupabaseClient} from '@/lib/supabase';
import {db} from '@/db/TallybookDB';
import {getActiveBusinessProfileId} from '@/features/business/activeCompany';
import {createBackup} from '@/features/backup/backup';
import {requestRun2OwnerLink} from '@/features/security/run2OwnerLink';

export function Run2OwnerLinkPanel({cloudCompanyId,userId}:{cloudCompanyId:string;userId:string}){
 const [name,setName]=useState('');
 const [approval,setApproval]=useState('');
 const [message,setMessage]=useState('');
 const [busy,setBusy]=useState(false);
 async function submit(){
  setBusy(true);setMessage('');
  try{
   const client=getSupabaseClient();
   const local=await db.businessProfiles.get(getActiveBusinessProfileId());
   if(!local||local.name!==name.trim())throw Error('Type the exact active company name.');
   const backup=await createBackup();
   const {data,error}=await client.auth.getSession();
   if(error||data.session?.user.id!==userId)throw Error('Owner session changed.');
   if(!window.confirm('Confirm this approved company link? Local data stays on this device.'))return;
   await requestRun2OwnerLink({companies:[{id:local.id,name:local.name}],
    localCompanyId:local.id,exactTypedCompanyName:name,verifiedAccountUserId:userId,
    cloudCompanyId,recoveryApprovalId:approval,backup,
    accessToken:data.session.access_token,ownerConfirmed:true});
   setMessage('Link recorded; cloud data access remains disabled.');
  }catch(e){setMessage(e instanceof Error?e.message:'Link denied.');}
  finally{setBusy(false);}
 }
 return <form className="space-y-2 border-t pt-3" onSubmit={e=>{e.preventDefault();void submit();}}>
  <h3 className="font-semibold">Review local company link</h3>
  <p className="text-sm">Requires an independently approved recovery case. No records will be uploaded.</p>
  <label className="block" htmlFor="run2-name">Active local company name</label>
  <input className="w-full rounded border p-2" id="run2-name" value={name}
   onChange={e=>setName(e.target.value)} required />
  <label className="block" htmlFor="run2-proof">Recovery approval ID</label>
  <input className="w-full rounded border p-2" id="run2-proof" value={approval}
   onChange={e=>setApproval(e.target.value)} required />
  <button type="submit" disabled={busy} className="rounded border px-4 py-2">
   {busy?'Checking…':'Confirm company link'}</button>
  <p role="status">{message}</p>
 </form>;
}
