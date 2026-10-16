/** Run 15 isolated LOCAL-MOCK signing contract.
 * These HMAC proofs authenticate only a configured sandbox fixture, NOT a
 * provider, a live charge, a merchant settlement or a retail ledger event.
 * No HTTP route is mounted; no provider secret is stored on a browser.
 */
import {createHmac,timingSafeEqual} from "node:crypto";
const ID=/^[A-Za-z0-9:_-]{8,100}$/;
const COMPANY=/^[A-Za-z0-9:_-]{1,128}$/;
const HEX=/^[0-9a-f]{64}$/;
const deny=()=>{throw Error("Invalid sandbox-only signed callback.");};
const canonical=input=>{
  if(!input||typeof input!=="object"||Array.isArray(input)||
    Object.keys(input).sort().join(",")!=="action,amountMinor,businessProfileId,createdAt,eventId,intentId,mockOnly,provider"||
    !COMPANY.test(input.businessProfileId??"")||!ID.test(input.eventId??"")||
    !ID.test(input.intentId??"")||
    !["timeout","succeed","fail","refund","chargeback"].includes(input.action)||
    !Number.isSafeInteger(input.amountMinor)||input.amountMinor<0||
    (input.action==="refund"?input.amountMinor<1:input.amountMinor!==0)||
    input.mockOnly!==true||input.provider!=="mock-only"||
    typeof input.createdAt!=="string"||
    !Number.isFinite(Date.parse(input.createdAt))||
    new Date(input.createdAt).toISOString()!==input.createdAt)
    deny();
  return JSON.stringify({
    businessProfileId:input.businessProfileId,intentId:input.intentId,
    eventId:input.eventId,action:input.action,amountMinor:input.amountMinor,
    createdAt:input.createdAt,mockOnly:true,provider:"mock-only"
  });
};
const secret=key=>{
  if(typeof key!=="string"||Buffer.byteLength(key,"utf8")<32||Buffer.byteLength(key,"utf8")>4096)
    deny();
  return key;
};
export function signRun15MockCallback(event,key) {
  const body=canonical(event);
  const signature=createHmac("sha256",secret(key)).update(body).digest("hex");
  return Object.freeze({body,signature:"sha256="+signature,simulated:true});
}
export function verifyRun15MockCallback(body,signature,key,{companyId,now=Date.now()}={}) {
  if(typeof body!=="string"||Buffer.byteLength(body,"utf8")>4096||
    typeof signature!=="string"||!signature.startsWith("sha256=")||
    !HEX.test(signature.slice(7))||!Number.isSafeInteger(now))
    deny();
  const digest=createHmac("sha256",secret(key)).update(body).digest();
  const supplied=Buffer.from(signature.slice(7),"hex");
  if(supplied.length!==digest.length||!timingSafeEqual(supplied,digest))deny();
  let parsed;try{parsed=JSON.parse(body);}catch{deny();}
  if(canonical(parsed)!==body||parsed.businessProfileId!==companyId||
    Math.abs(now-Date.parse(parsed.createdAt))>5*60_000)
    deny();
  return Object.freeze({...parsed,simulated:true,authoritativeSettlement:false,
    financialPostingPerformed:false});
}
