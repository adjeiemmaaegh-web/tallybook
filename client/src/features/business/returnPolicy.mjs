/** Run 11: per-company default-DENY return authority with immutable historical
 * revisions saved in the company record. Pure, deterministic validation;
 * does not post money, invent FX, imply legal return terms or issue payments.
 * IndexedDB owners can still edit device-local records: not tamper-proof.
 */
const DENY='Company return policy does not authorize this refund.';
const issue=x=>{throw Error(x)};
const instant=value=>{
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)||
    !Number.isFinite(Date.parse(value))||new Date(value).toISOString()!==value)
   issue('Return policy has invalid chronological evidence.');
 return Date.parse(value);
};
const own=(obj,keys)=>obj&&typeof obj==='object'&&!Array.isArray(obj)&&
 Object.keys(obj).every(k=>keys.includes(k));
const validSettings=value=>
 own(value,['enabled','allowFullReversal','allowCashPartial','maxAgeDays'])&&
 typeof value.enabled==='boolean'&&typeof value.allowFullReversal==='boolean'&&
 typeof value.allowCashPartial==='boolean'&&
 Number.isSafeInteger(value.maxAgeDays)&&value.maxAgeDays>=1&&value.maxAgeDays<=3650&&
 (value.enabled || (!value.allowFullReversal&&!value.allowCashPartial))&&
 (!value.enabled || value.allowFullReversal||value.allowCashPartial);
const DEFAULT=Object.freeze({
 revision:0,effectiveAt:'1970-01-01T00:00:00.000Z',
 enabled:false,allowFullReversal:false,allowCashPartial:false,maxAgeDays:30
});
const eq=(a,b)=>a.revision===b.revision&&a.effectiveAt===b.effectiveAt&&
 a.enabled===b.enabled&&a.allowFullReversal===b.allowFullReversal&&
 a.allowCashPartial===b.allowCashPartial&&a.maxAgeDays===b.maxAgeDays;
export function validateReturnPolicyHistory(history){
 if(history===undefined)return null;
 if(!Array.isArray(history)||history.length>4096)issue('Invalid company return policy revision history.');
 let prior=null;
 for(let i=0;i<history.length;i++){
  const r=history[i];
  if(!own(r,['revision','effectiveAt','enabled','allowFullReversal',
    'allowCashPartial','maxAgeDays','reason','actorStaffId'])||
    !Number.isSafeInteger(r.revision)||r.revision!==i+1||
    !validSettings({enabled:r.enabled,allowFullReversal:r.allowFullReversal,
      allowCashPartial:r.allowCashPartial,maxAgeDays:r.maxAgeDays})||
    typeof r.reason!=='string'||!r.reason.trim()||
    r.reason.length>240||
    (r.actorStaffId!==undefined&&
      (typeof r.actorStaffId!=='string'||!r.actorStaffId.trim()))||
    (prior&&instant(r.effectiveAt)<instant(prior.effectiveAt)))
   issue('Invalid company return policy revision history.');
  instant(r.effectiveAt);
  prior=r;
 }
 return prior;
}
export function currentCompanyReturnPolicy(history){
 const latest=validateReturnPolicyHistory(history);
 return Object.freeze(latest ? {...latest}: {...DEFAULT});
}
export function appendCompanyReturnPolicy(history,settings,now,reason,actorStaffId){
 const prior=currentCompanyReturnPolicy(history);
 if(!validSettings(settings)||typeof reason!=='string'||!reason.trim()||
    reason.length>240||
    (actorStaffId!==undefined&&
     (typeof actorStaffId!=='string'||!actorStaffId.trim())))
  issue('Invalid return policy settings or reason.');
 const date=instant(now);
 if(date<instant(prior.effectiveAt))issue('Return policy revision cannot predate saved history.');
 if(history?.length>=4096)issue('Return policy revision journal is full.');
 const candidate=Object.freeze({
  revision:prior.revision+1,effectiveAt:now,
  enabled:settings.enabled,allowFullReversal:settings.allowFullReversal,
  allowCashPartial:settings.allowCashPartial,maxAgeDays:settings.maxAgeDays,
  reason:reason.trim(),...(actorStaffId?{actorStaffId}:{})
 });
 return Object.freeze([...(history??[]),candidate]);
}
const snapshot=value=>Object.freeze({
 revision:value.revision,effectiveAt:value.effectiveAt,
 enabled:value.enabled,allowFullReversal:value.allowFullReversal,
 allowCashPartial:value.allowCashPartial,maxAgeDays:value.maxAgeDays
});
export function saleReturnPolicySnapshot(history){
 return snapshot(currentCompanyReturnPolicy(history));
}
export function checkSaleReturnPolicySnapshot(history,saved){
 const expected=saved?.revision===0 ? DEFAULT :
 (Array.isArray(history)?history.find(row=>row.revision===saved?.revision):undefined);
 if(!expected||!own(saved,['revision','effectiveAt','enabled','allowFullReversal',
   'allowCashPartial','maxAgeDays'])||Object.keys(saved).length!==6||!eq(expected,saved))
  issue('Saved return policy snapshot has missing, altered or foreign revision evidence.');
 return snapshot(expected);
}
export function authorizeReturnPolicy(history,sale,kind,now){
 if(!['full','partialCash'].includes(kind))
  issue('Unsupported return disposition or refund method.');
 const when=instant(now),soldAt=instant(sale?.createdAt);
 if(when<soldAt)issue('Refund cannot predate the original sale.');
 const salePolicy=checkSaleReturnPolicySnapshot(history,sale?.returnPolicyAtSale);
 const active=saleReturnPolicySnapshot(history);
 if(instant(salePolicy.effectiveAt)>soldAt||instant(active.effectiveAt)>when)
  issue('Refund policy was not yet effective at the relevant posting time.');
 if(!salePolicy.enabled||!active.enabled||
    (kind==='full'&&(!salePolicy.allowFullReversal||!active.allowFullReversal))||
    (kind==='partialCash'&&(!salePolicy.allowCashPartial||!active.allowCashPartial)))
  issue(DENY);
 const maxAge=BigInt(Math.min(salePolicy.maxAgeDays,active.maxAgeDays))*86400000n;
 if(BigInt(when-soldAt)>maxAge)issue('This sale is outside the company return window.');
 return Object.freeze({
  salePolicy,decisionPolicy:active,kind,authorizedAt:now
 });
}
export function validateRecordedReturnPolicy(history,sale,event,kind){
 if(event?.policyEvidence===undefined)return Object.freeze({verified:false,legacy:true});
 const evidence=event.policyEvidence;
 if(!own(evidence,['salePolicy','decisionPolicy','kind','authorizedAt'])||
    Object.keys(evidence).length!==4||evidence.kind!==kind||
    evidence.authorizedAt!==event.createdAt)
  issue('Saved refund has invalid policy decision evidence.');
 const when=instant(evidence.authorizedAt);
 if(when<instant(sale.createdAt))issue('Refund policy decision predates original sale.');
 const before=checkSaleReturnPolicySnapshot(history,evidence.salePolicy);
 const at=checkSaleReturnPolicySnapshot(history,evidence.decisionPolicy);
 if(!eq(before,sale?.returnPolicyAtSale??{})||
    instant(at.effectiveAt)>when)
  issue('Refund policy snapshots do not match saved company history.');
 // A later company policy change must not erase evidence that an older
 // refund was legal under the revision in force when it was executed.
 const revisions=[DEFAULT,...(history??[])];
 const currentAt=revisions.filter(r=>instant(r.effectiveAt)<=when).at(-1);
 if(!currentAt||!eq(at,currentAt))
  issue('Refund policy decision was not current at recorded posting time.');
 if(!before.enabled||!at.enabled||
    (kind==='full'&&(!before.allowFullReversal||!at.allowFullReversal))||
    (kind==='partialCash'&&(!before.allowCashPartial||!at.allowCashPartial)))
  issue('Saved refund was recorded while the relevant return policy was disabled.');
 if(BigInt(when-instant(sale.createdAt))>
   BigInt(Math.min(before.maxAgeDays,at.maxAgeDays))*86400000n)
  issue('Saved refund exceeds recorded return age limit.');
 return Object.freeze({verified:true,legacy:false});
}
