/** Run 20 nonauthoritative, local release worksheet archive.
 * Hash detects accidental changes; it is not independent attestation,
 * operational staging approval, a reviewer signature or production evidence.
 */
import {evaluateRun20Release,RUN20_DECISION_KIND} from "./run20ReleaseGates.mjs";
const stable=value=>JSON.stringify(value);
const digest=async text=>{
 if(!globalThis.crypto?.subtle)throw Error("Web Crypto unavailable. No release worksheet can be exported.");
 const bytes=new TextEncoder().encode(text);
 const hash=new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256",bytes));
 return Array.from(hash,v=>v.toString(16).padStart(2,"0")).join("");
};
export async function exportRun20Worksheet(input){
 const decision=evaluateRun20Release(input);
 const payload={kind:RUN20_DECISION_KIND,formatVersion:1,sourceSha:input.sourceSha.toLowerCase(),
  asOf:input.asOf,evidence:input.evidence,decision};
 const text=stable(payload);
 if(new TextEncoder().encode(text).length>256000)throw Error("Release worksheet exceeds the supported byte limit.");
 const sha256=await digest(text);
 return JSON.stringify({kind:"tallybook-v19-run20-evidence-envelope",formatVersion:1,
  payload,sha256},null,2);
}
export async function importRun20Worksheet(text){
 if(typeof text!=="string"||new TextEncoder().encode(text).length>384000)
   throw Error("Invalid or oversized release worksheet.");
 let root;try{root=JSON.parse(text);}catch{throw Error("Invalid release worksheet JSON.");}
 if(!root||typeof root!=="object"||Array.isArray(root)||
  Object.keys(root).sort().join(",")!=="formatVersion,kind,payload,sha256"||
  root.kind!=="tallybook-v19-run20-evidence-envelope"||root.formatVersion!==1||
  !/^[0-9a-f]{64}$/.test(root.sha256??""))
   throw Error("Unknown or unsupported release worksheet envelope.");
 const payload=root.payload;
 if(!payload||typeof payload!=="object"||Array.isArray(payload)||
   Object.keys(payload).sort().join(",")!=="asOf,decision,evidence,formatVersion,kind,sourceSha"||
   payload.kind!==RUN20_DECISION_KIND||payload.formatVersion!==1)
   throw Error("Unsupported release worksheet fields.");
 const computed=evaluateRun20Release(payload);
 if(stable(computed)!==stable(payload.decision))throw Error("Release decision differs from deterministic NO-GO policy.");
 if(await digest(stable(payload))!==root.sha256)
   throw Error("Release worksheet SHA mismatch; reject untrusted changes.");
 return Object.freeze({sourceSha:payload.sourceSha,asOf:payload.asOf,
  evidence:payload.evidence,decision:computed,sha256:root.sha256,
  independentReview:false,ownerAuthorization:false,releaseAuthorized:false});
}
