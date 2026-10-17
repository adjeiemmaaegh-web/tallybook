/** Evidence hash detects accidental file alteration, not fraud or signoff.
 * Run 19 packages intentionally do not contain names, card numbers, PINs,
 * customer data, camera frames, payment credentials or recorded scans.
 */
import {verifyRun19EvidencePayload} from "./run19Acceptance.mjs";
const hex=bytes=>Array.from(bytes,byte=>byte.toString(16).padStart(2,"0")).join("");
export async function exportRun19Envelope(payload) {
 const verified=verifyRun19EvidencePayload(payload);
 if(!globalThis.crypto?.subtle)throw Error("Web Crypto SHA-256 unavailable: export cannot be verified on this device.");
 const text=JSON.stringify(verified);
 const bytes=new TextEncoder().encode(text);
 if(bytes.length>512*1024)throw Error("Real-device evidence report is too large to export.");
 const digest=hex(new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256",bytes)));
 return JSON.stringify({kind:"tallybook-run19-evidence-envelope",version:1,
  payload:verified,sha256:digest},null,2);
}
export async function importRun19Envelope(text){
 if(typeof text!=="string"||text.length>768*1024)
   throw Error("The selected Run 19 evidence file is too large.");
 let parsed;try{parsed=JSON.parse(text);}catch{throw Error("Invalid UAT evidence JSON.");}
 if(!parsed||typeof parsed!=="object"||Array.isArray(parsed)||
   Object.keys(parsed).sort().join(",")!=="kind,payload,sha256,version"||
   parsed.kind!=="tallybook-run19-evidence-envelope"||parsed.version!==1||
   typeof parsed.sha256!=="string"||!/^[a-f0-9]{64}$/.test(parsed.sha256))
   throw Error("Unsupported or tampered device evidence envelope.");
 const payload=verifyRun19EvidencePayload(parsed.payload);
 if(!globalThis.crypto?.subtle)throw Error("Web Crypto verification unavailable.");
 const bytes=new TextEncoder().encode(JSON.stringify(payload));
 const digest=hex(new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256",bytes)));
 if(digest!==parsed.sha256)throw Error("Device evidence SHA-256 mismatch. Do not use this file for acceptance.");
 return Object.freeze({payload,sha256:digest,integrity:"hash-match",
   ownerSignoff:false,independentReview:false,releaseAuthorized:false});
}
