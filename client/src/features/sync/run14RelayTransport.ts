/** Run 14 — explicit HTTPS ciphertext transfer only.
 * Credentials/passphrases remain in caller memory and are never persisted.
 * Network uncertainty never causes automatic retry or financial posting.
 */
import type {TallybookDB} from "@/db/TallybookDB";
import {getActiveBusinessProfileId} from "@/features/business/activeCompany";
import {requirePermission} from "@/features/staff/staff";
import {withCoordinatedRetailWrite} from "@/features/backup/coordinatedRetailWrite";
import {assertRun7RetailWriteReady} from "@/features/backup/run7RetailWriteBarrier.mjs";
import {pendingRun14Envelopes,stripRun14LocalState,importRun14Page,
 type Run14QueuedEnvelope,type Run14ReplicaPage} from "./run14LocalRelay";
import {validateRun14Envelope} from "./run14Crypto";

export interface Run14RelayConflict {
 id:string;businessProfileId:string;eventId:string;
 reason:"event-id-reuse"|"operation-id-reuse"|"receipt-mismatch";
 detectedAt:string;status:"unresolved";
}
export interface Run14RelayCredentials {capability:string;session:string}
export type Run14RelayTransport=(url:string,init:RequestInit)=>Promise<Response>;
export interface Run14RelayReceipt {
 status:"stored"|"duplicate"|"conflict";reason:null|"same-event"|"event-id-reuse"|"operation-id-reuse";
 organizationId:string;eventId:string;ciphertextSha256:string;cursor:number;
 financialReplicationEnabled:false;
}
const ID=/^[A-Za-z0-9:_-]{1,128}$/;
export const RUN14_NETWORK_RELEASE_ENABLED=false as const;
export function validateRun14RelayEndpoint(endpoint:string):string {
 if(typeof endpoint!=="string"||endpoint.length>2048)throw Error("Invalid encrypted relay endpoint.");
 let url:URL;
 try{url=new URL(endpoint);}catch{throw Error("Invalid encrypted relay URL.");}
 if(url.protocol!=="https:"||!url.hostname||url.username||url.password||
    url.search||url.hash||url.pathname!=="/api/sync/replication/events"||
    url.origin==="null")throw Error("Only a clean HTTPS encrypted relay endpoint is permitted.");
 return url.href;
}
function credentialsHeaders(credentials:Run14RelayCredentials,company:string,deviceId:string):HeadersInit{
 if(!ID.test(company)||!ID.test(deviceId)||
    typeof credentials?.capability!=="string"||
    !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(credentials.capability)||
    credentials.capability.length>4096||
    typeof credentials?.session!=="string"||
    !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(credentials.session)||
    credentials.session.length>4096)
  throw Error("Missing authenticated encrypted relay credentials.");
 return {"authorization":"Bearer "+credentials.capability,
   "x-tallybook-session":"Bearer "+credentials.session,
   "x-tallybook-org-id":company,"x-tallybook-device-id":deviceId};
}
async function strictJSON<T>(response:Response,url:string,maxBytes:number):Promise<T>{
 if(!response||response.redirected||response.type==="opaque"||
    response.url!==url||!/^application\/json(?:\s*;|\s*$)/i.test(response.headers.get("content-type")??""))
    throw Error("Untrusted encrypted relay response.");
 const announced=response.headers.get("content-length");
 if(announced!==null&&Number(announced)>maxBytes)throw Error("Untrusted encrypted relay response exceeds size limit.");
 const text=await response.text();
 if(new TextEncoder().encode(text).byteLength>maxBytes)throw Error("Oversized encrypted relay response.");
 let result:unknown;try{result=JSON.parse(text);}catch{throw Error("Malformed encrypted relay JSON.");}
 return result as T;
}
function verifyReceipt(receipt:Run14RelayReceipt,event:Run14QueuedEnvelope,status:number){
 if(!receipt||typeof receipt!=="object"||Array.isArray(receipt)||
    Object.keys(receipt).sort().join(",")!=="ciphertextSha256,cursor,eventId,financialReplicationEnabled,organizationId,reason,status"||
    receipt.organizationId!==event.businessProfileId||receipt.eventId!==event.id||
    receipt.ciphertextSha256!==event.ciphertextSha256||
    receipt.financialReplicationEnabled!==false||
    !Number.isSafeInteger(receipt.cursor)||receipt.cursor<0||
    !((status===201&&receipt.status==="stored"&&receipt.reason===null)||
      (status===200&&receipt.status==="duplicate"&&receipt.reason==="same-event")||
      (status===409&&receipt.status==="conflict"&&["event-id-reuse","operation-id-reuse"].includes(receipt.reason??""))))
   throw Error("Relay receipt was not authenticated for this exact queued ciphertext.");
}
async function confirmLocalRelayPermission(database:TallybookDB,company:string,deviceId:string) {
  if(company!==getActiveBusinessProfileId())throw Error("Company switched before encrypted relay transfer.");
  return database.transaction("r",[
    database.appMeta,database.businessProfiles,database.syncConsents,
    database.syncDevices,database.staffMembers
  ],async()=>{
    await assertRun7RetailWriteReady(database.appMeta);
    await requirePermission("staff",database,company);
    if(!await database.businessProfiles.get(company)||
       (await database.syncConsents.get(company))?.enabled!==true)
      throw Error("Local company synchronization consent is disabled.");
    const device=await database.syncDevices.get(deviceId);
    if(!device||device.businessProfileId!==company||device.status!=="active")
      throw Error("Local device enrollment has been revoked.");
    if(company!==getActiveBusinessProfileId())throw Error("Company changed during relay authorization.");
  });
}
async function recordConflict(database:TallybookDB,company:string,event:Run14QueuedEnvelope,reason:Run14RelayConflict["reason"]) {
 await withCoordinatedRetailWrite(async()=>database.transaction("rw",[
   database.appMeta,database.businessProfiles,database.syncConsents,
   database.syncDevices,database.staffMembers,database.syncReplicaOutbox,
   database.syncReplicaConflicts
 ],async()=>{
   await assertRun7RetailWriteReady(database.appMeta);
   await requirePermission("staff",database,company);
   if((await database.syncConsents.get(company))?.enabled!==true||
      (await database.syncDevices.get(event.deviceId))?.status!=="active"||
      getActiveBusinessProfileId()!==company)throw Error("Replica conflict no longer authorized.");
   const saved=await database.syncReplicaOutbox.get(event.id);
   if(!saved||saved.businessProfileId!==company||saved.ciphertextSha256!==event.ciphertextSha256)
     throw Error("Pending event changed during conflict review.");
   const id=company+":"+event.id;
   const previous=await database.syncReplicaConflicts.get(id);
   if(previous&&previous.reason!==reason)throw Error("Conflicting remote reports require owner review.");
   if(!previous)await database.syncReplicaConflicts.add({
     id,businessProfileId:company,eventId:event.id,reason,
     detectedAt:new Date().toISOString(),status:"unresolved"
   });
 }));
}
/** Explicit one-at-a-time delivery. Fail if an earlier event remains pending. */
export async function sendOneRun14Event(
 database:TallybookDB,company:string,eventId:string,endpoint:string,
 credentials:Run14RelayCredentials,transport:Run14RelayTransport=fetch,
):Promise<"acknowledged"|"already-acknowledged"|"conflict"> {
 if(!RUN14_NETWORK_RELEASE_ENABLED)throw Error("Run 14 network activation is awaiting owner authorization and acceptance.");
 const url=validateRun14RelayEndpoint(endpoint);
 if(company!==getActiveBusinessProfileId()||!ID.test(eventId))throw Error("Invalid local replica scope.");
 const pending=await pendingRun14Envelopes(company,database);
 const item=pending.find(e=>e.id===eventId);
 if(!item)throw Error("Requested replica is not pending.");
 if(pending.some(e=>e.deviceId===item.deviceId&&e.sequence<item.sequence))
   throw Error("An earlier encrypted event must be delivered first.");
 await confirmLocalRelayPermission(database,company,item.deviceId);
 const response=await transport(url,{method:"POST",mode:"cors",redirect:"error",
   credentials:"omit",cache:"no-store",
   headers:{...credentialsHeaders(credentials,company,item.deviceId),"content-type":"application/json"},
   body:JSON.stringify(stripRun14LocalState(item))});
 if(![200,201,409].includes(response.status))
   throw Error("Relay did not durably acknowledge ciphertext; event remains pending.");
 const receipt=await strictJSON<Run14RelayReceipt>(response,url,2048);
 verifyReceipt(receipt,item,response.status);
 if(receipt.status==="conflict") {
   await recordConflict(database,company,item,receipt.reason as Run14RelayConflict["reason"]);
   return "conflict";
 }
 return withCoordinatedRetailWrite(async()=>database.transaction("rw",[
   database.appMeta,database.businessProfiles,database.staffMembers,
   database.syncConsents,database.syncDevices,database.syncReplicaOutbox
 ],async()=>{
   await assertRun7RetailWriteReady(database.appMeta);
   await requirePermission("staff",database,company);
   if((await database.syncConsents.get(company))?.enabled!==true||
      (await database.syncDevices.get(item.deviceId))?.status!=="active"||
      getActiveBusinessProfileId()!==company)
     throw Error("Sync permission changed before acknowledgement.");
   const saved=await database.syncReplicaOutbox.get(item.id);
   if(!saved||saved.businessProfileId!==company||saved.ciphertextSha256!==item.ciphertextSha256)
     throw Error("Replica pending identity changed.");
   if(saved.status==="acknowledged")return "already-acknowledged";
   if(saved.status!=="pending")throw Error("Unexpected local encrypted event state.");
   await database.syncReplicaOutbox.put({...saved,status:"acknowledged",
     acknowledgedAt:new Date().toISOString(),serverCursor:receipt.cursor});
   return "acknowledged";
 }));
}
/** Download a page and authenticate EVERY AES-GCM envelope before saving
 * ciphertext in quarantined local inbox. Never executes remote financial ops.
 */
export async function pullOneRun14Page(
 database:TallybookDB,company:string,deviceId:string,endpoint:string,
 credentials:Run14RelayCredentials,passphrase:string,
 transport:Run14RelayTransport=fetch
):Promise<number>{
 if(!RUN14_NETWORK_RELEASE_ENABLED)throw Error("Run 14 network activation is awaiting owner authorization and acceptance.");
 const base=validateRun14RelayEndpoint(endpoint);
 if(company!==getActiveBusinessProfileId())throw Error("Company changed during replication.");
 const cursor=await database.syncReplicaCursors.get(company);
 const after=cursor?.nextCursor??0;
 if(!Number.isSafeInteger(after)||after<0)throw Error("Corrupt local replica cursor.");
 const target=new URL(base);target.searchParams.set("after",String(after));
 await confirmLocalRelayPermission(database,company,deviceId);
 const response=await transport(target.href,{method:"GET",mode:"cors",redirect:"error",
   credentials:"omit",cache:"no-store",headers:credentialsHeaders(credentials,company,deviceId)});
 if(response.status!==200)throw Error("Encrypted replica read was not authorized.");
 const page=await strictJSON<Run14ReplicaPage>(response,target.href,1800000);
 if(!page||page.organizationId!==company||!Array.isArray(page.events)||
   page.events.length>20||page.after!==after||
   page.nextCursor!==after+page.events.length||page.financialReplicationEnabled!==false)
   throw Error("Invalid encrypted replica pagination.");
 for(const event of page.events)validateRun14Envelope(event);
 return importRun14Page(database,company,deviceId,page,passphrase);
}

/** Obtain a five-minute, server-issued device capability from an independently
 * verified human session. The returned token exists only in caller memory.
 */
export async function requestRun14Capability(
 endpoint:string,company:string,deviceId:string,
 session:string,scope:"sync:replicate:read"|"sync:replicate:write",
 transport:Run14RelayTransport=fetch
):Promise<string> {
 if(!RUN14_NETWORK_RELEASE_ENABLED)throw Error("Run 14 capabilities remain release-gated.");
 const base=validateRun14RelayEndpoint(endpoint);
 if(company!==getActiveBusinessProfileId()||!ID.test(deviceId)||
    !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(session)||session.length>4096)
   throw Error("Invalid scoped capability request.");
 const target=new URL(base);target.pathname="/api/sync/replication/capability";
 const response=await transport(target.href,{method:"POST",mode:"cors",redirect:"error",
   credentials:"omit",cache:"no-store",headers:{
    "content-type":"application/json","x-tallybook-session":"Bearer "+session},
   body:JSON.stringify({organizationId:company,deviceId,scope})});
 if(response.status!==201)throw Error("Trusted server did not issue a scoped capability.");
 const result=await strictJSON<{capability:string;organizationId:string;deviceId:string;
   scope:string;expiresAt:string}>(response,target.href,2048);
 if(!result||result.organizationId!==company||result.deviceId!==deviceId||
    result.scope!==scope||typeof result.capability!=="string"||
    !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(result.capability)||
    result.capability.length>4096||
    !Number.isFinite(Date.parse(result.expiresAt))||
    Date.parse(result.expiresAt)<=Date.now()||
    Date.parse(result.expiresAt)>Date.now()+5*60_000+1000)
   throw Error("Malformed or expired server relay capability.");
 return result.capability;
}
