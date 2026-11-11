import {useEffect,useState,type FormEvent} from 'react';
import { confirmAction } from "@/lib/confirmAction";
import {toast} from 'sonner';
import {useBusinessProfile} from '@/contexts/BusinessProfileContext';
import {currentCompanyReturnPolicy} from '@/features/business/returnPolicy.mjs';
import {updateCompanyReturnPolicy} from '@/features/business/returnPolicySettings';

/** Owner-facing, per-company opt-in. No universal refund promise is assumed.
 * Old sales without terms remain outside automatically authorized return paths.
 */
export function CompanyReturnPolicySettings(){
 const {profile,refresh}=useBusinessProfile();
 const saved=currentCompanyReturnPolicy(profile?.returnPolicyHistory);
 const [enabled,setEnabled]=useState(saved.enabled);
 const [full,setFull]=useState(saved.allowFullReversal);
 const [partial,setPartial]=useState(saved.allowCashPartial);
 const [days,setDays]=useState(String(saved.maxAgeDays));
 const [reason,setReason]=useState('');
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState<string|null>(null);
 useEffect(()=>{
  const p=currentCompanyReturnPolicy(profile?.returnPolicyHistory);
  setEnabled(p.enabled);setFull(p.allowFullReversal);
  setPartial(p.allowCashPartial);setDays(String(p.maxAgeDays));
  setReason('');setError(null);
 },[profile?.id,profile?.updatedAt]);
 if(!profile)return null;
 async function save(event:FormEvent<HTMLFormElement>){
  event.preventDefault();
  if(!profile||busy)return;
  const maxAgeDays=Number(days);
  const settings={enabled,allowFullReversal:enabled&&full,
   allowCashPartial:enabled&&partial,maxAgeDays};
  if(!Number.isSafeInteger(maxAgeDays)||maxAgeDays<1||maxAgeDays>3650){
   setError('Choose a whole-number return window between 1 and 3650 days.');
   return;
  }
  if(enabled&&!full&&!partial){
   setError('Select at least one return type, or choose no refunds.');
   return;
  }
  if(!reason.trim()){setError('Explain the reason for this policy change.');return;}
  const decision=enabled?'ENABLE the selected refund paths':'DISABLE all refunds';
  if(!(await confirmAction(`Change the policy of ${profile.name} to ${decision}? Future refunds must follow the saved policy. Existing money and sale records will not be changed.`)))return;
  setBusy(true);setError(null);
  try{
   const updated=await updateCompanyReturnPolicy(settings,reason);
   await refresh();
   toast.success(`Refund policy revision ${updated.revision} saved for ${profile.name}.`);
  }catch(err){setError(err instanceof Error?err.message:'Could not save the company refund policy.');}
  finally{setBusy(false);}
 }
 return <section className="business-form-shell" aria-labelledby="return-policy-title">
  <div className="form-ledger-head"><div>
   <p className="ledger-kicker">Business-controlled refunds</p>
   <h2 id="return-policy-title">Choose your company's return policy.</h2>
   <p>Refunds are OFF until this company explicitly enables them. Other businesses have independent policies.</p>
   <p>Configure the system to reflect your own terms, subject to applicable consumer laws and mandatory legal remedies. This setting cannot override customers' legal rights.</p>
  </div><div className="form-ledger-stamp"><span className="workspace-marker">RET</span>
   <span>Revision {saved.revision}</span></div></div>
  <form className="business-form" onSubmit={event=>void save(event)}>
   <label><span>Company return rule</span><select value={enabled?'enabled':'disabled'}
    onChange={e=>{
     const yes=e.target.value==='enabled';setEnabled(yes);
     if(yes&&!full&&!partial)setFull(true);
    }} disabled={busy}>
    <option value="disabled">No refunds or returns</option>
    <option value="enabled">Allow selected returns (owner-approved)</option>
   </select></label>
   {enabled&&<div className="form-section">
    <label><input type="checkbox" checked={full}
      onChange={e=>setFull(e.target.checked)} disabled={busy}/>
      {' '}Allow full-sale ledger reversals</label>
    <label><input type="checkbox" checked={partial}
      onChange={e=>setPartial(e.target.checked)} disabled={busy}/>
      {' '}Allow eligible restockable cash-only partial returns</label>
    <p>Card/provider refunds, credit changes, services and unsupported stock dispositions remain unavailable even when the company allows returns.</p>
   </div>}
   <label><span>Maximum return age (days)</span><input type="number"
    min={1} max={3650} step={1} value={days} onChange={e=>setDays(e.target.value)}
    disabled={busy||!enabled} required={enabled}/></label>
   <label><span>Reason for policy decision</span><textarea value={reason}
    onChange={e=>setReason(e.target.value)} maxLength={240} required
    placeholder="For example: owner-authorized 14-day cash returns" disabled={busy}/></label>
   <p>New sales capture the original policy. New refund postings require both the sale-time terms and the current company terms; policy changes do not rewrite old receipts.</p>
   {error&&<p role="alert">{error}</p>}
   <div className="form-save-row"><p className="form-save-note" role="status">
    Current policy: {saved.enabled
     ? `enabled; full ${saved.allowFullReversal?'yes':'no'}, partial cash ${saved.allowCashPartial?'yes':'no'}, ${saved.maxAgeDays}-day limit`
     : 'no refunds'}. Historical revisions: {profile.returnPolicyHistory?.length??0}.
   </p><button className="primary-action" type="submit"
    disabled={busy||!reason.trim()}>{busy?'Saving…':'Save company refund policy'}</button></div>
  </form>
 </section>;
}
