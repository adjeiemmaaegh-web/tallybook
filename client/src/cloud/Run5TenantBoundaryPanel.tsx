import {useEffect,useState} from 'react';
import {readRun5CloudCatalog} from './run5TenantReadClient';
/** No local company switch or financial data exposure from this preview. */
export function Run5TenantBoundaryPanel({companyId,userId}:{
 companyId:string;userId:string
}){
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('No remote tenant data has been loaded.');
 useEffect(()=>{setMessage('No remote tenant data has been loaded.');setBusy(false);},
   [companyId,userId]);
 return <section className="rounded border p-3 space-y-2" aria-label="Cloud tenant authorization review">
  <h3 className="font-semibold">Tenant authorization preview</h3>
  <p className="text-sm">Read-only identity boundary check. No cloud records are
    uploaded, downloaded to your local ledger, synchronized or modified.</p>
  <button type="button" className="rounded border px-3 py-2" disabled={busy}
   onClick={()=>{void (async()=>{
     setBusy(true);setMessage('Checking company authorization…');
     try{
       const result=await readRun5CloudCatalog(companyId,userId);
       setMessage(`Authorized remote product records on this page: ${result.recordCount}.`);
     }catch{setMessage('Remote tenant access is unavailable or not authorized.');}
     finally{setBusy(false);}
   })();}}>
   {busy?'Verifying…':'Verify read-only cloud company scope'}
  </button>
  <p role="status" className="text-sm">{message}</p>
 </section>;
}
