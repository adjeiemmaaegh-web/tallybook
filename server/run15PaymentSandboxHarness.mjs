/** Run 15 mock-only server harness.
 * No external provider, HTTP route, live payment keys or retail database.
 * Signed fixtures prove only HMAC integrity of an isolated local simulation.
 */
import {createPaymentGateway} from "./paymentGateway.mjs";
import {verifyRun15MockCallback} from "./run15SignedMockCallback.mjs";
const deny=()=>{throw Error("Mock payment sandbox operation denied.");};
const ID=/^[A-Za-z0-9:_-]{1,128}$/;
export function createRun15MockSandboxHarness({key,environment="local-test"}={}) {
 if(!["local-test","local-development"].includes(environment)||
   typeof key!=="string"||Buffer.byteLength(key)<32)deny();
 const gateway=createPaymentGateway({mode:"mock",environment});
 const accepted=new Map();
 return Object.freeze({
  createIntent(input) {
    if(!input||!ID.test(input.companyId??"")||
      !/^[A-Za-z0-9_-]{1,100}$/.test(input.submissionKey??""))
      deny();
    const result=gateway.createIntent(input);
    return Object.freeze({...result,simulated:true,authoritativeSettlement:false,
      financialPostingPerformed:false});
  },
  inspect(companyId,submissionKey) {
    return Object.freeze({...gateway.inspect(companyId,submissionKey),
      simulated:true,authoritativeSettlement:false,financialPostingPerformed:false});
  },
  /** Only caller-supplied signed mock fixture; never accepts a provider webhook. */
  applySignedMockEvent(body,signature,companyId,now=Date.now()) {
    if(!ID.test(companyId??""))deny();
    const event=verifyRun15MockCallback(body,signature,key,{companyId,now});
    const token=JSON.stringify([event.businessProfileId,event.eventId]);
    const fingerprint=JSON.stringify([event.intentId,event.action,event.amountMinor]);
    const previous=accepted.get(token);
    if(previous){
      if(previous.fingerprint!==fingerprint)deny();
      return previous.result;
    }
    const result=gateway.simulate({
      companyId:event.businessProfileId,submissionKey:event.intentId,
      eventId:event.eventId,action:event.action,
      ...(event.action==="refund"?{refundMinor:event.amountMinor}:{})
    });
    const saved=Object.freeze({...result,simulated:true,
      authoritativeSettlement:false,financialPostingPerformed:false});
    accepted.set(token,{fingerprint,result:saved});
    return saved;
  }
 });
}
