/** Run 15 — PROVIDER-NEUTRAL MOCK payment state machine.
 * No processor API, provider token, real-money charge or retail-ledger posting.
 * Intent and event evidence is explicitly simulated, never proof of money.
 */
const fail=message=>{throw Error(message);};
const ID=/^[a-zA-Z0-9:_-]{8,100}$/;
const COMPANY=/^[a-zA-Z0-9:_-]{1,128}$/;
const CCY=/^[A-Z]{3}$/;
const date=x=>typeof x==="string"&&Number.isFinite(Date.parse(x))&&new Date(x).toISOString()===x;
const validKey=x=>typeof x==="string"&&ID.test(x);
const minor=x=>Number.isSafeInteger(x)&&x>=0&&x<=9_000_000_000_000;
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const copy=x=>JSON.parse(JSON.stringify(x));
export const RUN15_PROVIDER_NAME="mock-only";
export function validateRun15MockIntent(x) {
  if(!x||typeof x!=="object"||Array.isArray(x)||
    !COMPANY.test(x.businessProfileId??"")||!validKey(x.id)||
    !validKey(x.submissionKey)||!minor(x.amountMinor)||x.amountMinor<1||
    !CCY.test(x.currency??"")||!["card","mobile"].includes(x.method)||
    !date(x.createdAt)||x.status!=="pending"||x.refundedMinor!==0||
    x.mockOnly!==true||x.provider!=="mock-only"||x.financialPostingPerformed!==false||
    x.authoritativeSettlement!==false||
    Object.keys(x).sort().join(",")!==
    "amountMinor,authoritativeSettlement,businessProfileId,createdAt,currency,financialPostingPerformed,id,method,mockOnly,provider,refundedMinor,status,submissionKey")
    fail("Invalid payment sandbox intent; real settlement is forbidden.");
  return copy(x);
}
export function validateRun15MockEvent(x) {
  if(!x||typeof x!=="object"||Array.isArray(x)||
    !validKey(x.id)||!validKey(x.intentId)||!COMPANY.test(x.businessProfileId??"")||
    !["timeout","succeed","fail","refund","chargeback"].includes(x.action)||
    !date(x.createdAt)||!minor(x.amountMinor)||!Number.isSafeInteger(x.sequence)||x.sequence<1||x.sequence>10000||x.mockOnly!==true||
    x.financialPostingPerformed!==false||x.authoritativeSettlement!==false||
    Object.keys(x).sort().join(",")!==
    "action,amountMinor,authoritativeSettlement,businessProfileId,createdAt,financialPostingPerformed,id,intentId,mockOnly,sequence")
    fail("Invalid mocked payment event.");
  if(x.action==="refund" ? x.amountMinor<1 : x.amountMinor!==0)
    fail("Mock event amount does not match action.");
  return copy(x);
}
export function applyRun15MockEvent(intent,event,priorEvents=[]) {
  const seed=validateRun15MockIntent({
    ...intent,status:"pending",refundedMinor:0
  });
  const current=copy(intent);
  if(!["pending","succeeded","failed","partially-refunded","refunded","charged-back"].includes(current.status)||
    !minor(current.refundedMinor)||current.refundedMinor>seed.amountMinor||
    current.businessProfileId!==seed.businessProfileId||current.id!==seed.id)
    fail("Invalid current mock payment state.");
  const incoming=validateRun15MockEvent(event);
  if(incoming.businessProfileId!==current.businessProfileId||incoming.intentId!==current.id)
    fail("Mock callback crosses company or intent identity.");
  const seen=new Set();
  let already=false;
  for(const prior of priorEvents) {
    const saved=validateRun15MockEvent(prior);
    if(saved.businessProfileId!==current.businessProfileId||saved.intentId!==current.id||
      seen.has(saved.id))fail("Mock payment event history invalid.");
    seen.add(saved.id);
    if(saved.id===incoming.id) {
      if(!same(saved,incoming))fail("Reused mock event ID with conflicting contents.");
      already=true;
    }
  }
  if(already)return Object.freeze({intent:current,replayed:true,financialPostingPerformed:false});
  const updated=copy(current);
  if(incoming.action==="timeout"){
    if(updated.status!=="pending")fail("Only a pending payment can time out.");
    // A timeout is NOT failure, success or money receipt.
  }else if(incoming.action==="succeed"){
    if(updated.status!=="pending")fail("Mock capture is not pending.");
    updated.status="succeeded";
  }else if(incoming.action==="fail"){
    if(updated.status!=="pending")fail("Mock payment is not pending.");
    updated.status="failed";
  }else if(incoming.action==="refund"){
    if(!["succeeded","partially-refunded"].includes(updated.status))
      fail("Only a simulated captured payment can be refunded.");
    const total=updated.refundedMinor+incoming.amountMinor;
    if(!minor(total)||total>updated.amountMinor)fail("Mock refund exceeds simulated capture.");
    updated.refundedMinor=total;
    updated.status=total===updated.amountMinor?"refunded":"partially-refunded";
  }else if(incoming.action==="chargeback"){
    if(updated.status!=="succeeded"||updated.refundedMinor!==0)
      fail("Mock chargeback requires unrefunded simulated capture.");
    updated.status="charged-back";
  }
  return Object.freeze({intent:updated,replayed:false,financialPostingPerformed:false});
}
export function auditRun15MockTimeline(intent,events) {
  const origin=validateRun15MockIntent(intent);
  if(!Array.isArray(events)||events.length>10000)fail("Invalid mock payment event history.");
  let current=origin;
  const accepted=[];
  for(const event of events) {
    if(event.sequence!==accepted.length+1)fail("Mock payment event sequence is missing or out of order.");
    const result=applyRun15MockEvent(current,event,accepted);
    if(result.replayed)fail("Duplicate event stored in mock journal.");
    current=result.intent;accepted.push(event);
  }
  return Object.freeze({intent:current,eventCount:accepted.length,
    financialPostingPerformed:false,authoritativeSettlement:false});
}
