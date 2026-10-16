/** Run 14 — opaque encrypted replica journal. Server cannot decrypt a retail record.
 * No ledger mutations, automatic conflict resolution, or multi-device checkout.
 * Every append is durable, append-only and authorized separately at ingress.
 */
import { open, lstat, unlink } from "node:fs/promises";
import { constants, } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, isAbsolute, resolve } from "node:path";
const ID=/^[A-Za-z0-9:_-]{1,128}$/;
const HEX=/^[0-9a-f]{64}$/;
const B64=/^[A-Za-z0-9+/]+={0,2}$/;
const MAX_BYTES=80*1024*1024;
const MAX_EVENT_BYTES=48*1024;
const ZERO="0".repeat(64);
const deny=message=>{throw new Error(message);};
const okId=x=>typeof x==="string"&&ID.test(x);
const iso=x=>typeof x==="string"&&Number.isFinite(Date.parse(x))&&new Date(x).toISOString()===x;
const plain=x=>x!==null&&typeof x==="object"&&!Array.isArray(x);
const keys=(x,n)=>Object.keys(x).sort().join(",")===n.split(",").sort().join(",");
export function validateRun14Envelope(input) {
  if(!plain(input)||!keys(input,"version,organizationId,deviceId,eventId,operationId,sequence,previousDigest,createdAt,ciphertext,nonce,salt,ciphertextSha256")||
    input.version!==1||![input.organizationId,input.deviceId,input.eventId,input.operationId].every(okId)||
    !Number.isSafeInteger(input.sequence)||input.sequence<1||input.sequence>1_000_000||
    !iso(input.createdAt)||typeof input.previousDigest!=="string"||!HEX.test(input.previousDigest)||
    typeof input.ciphertextSha256!=="string"||!HEX.test(input.ciphertextSha256)||
    typeof input.salt!=="string"||!B64.test(input.salt)||
    typeof input.nonce!=="string"||!B64.test(input.nonce)||
    typeof input.ciphertext!=="string"||!B64.test(input.ciphertext)||input.ciphertext.length>MAX_EVENT_BYTES*2)
    deny("Invalid encrypted relay envelope.");
  const nonce=Buffer.from(input.nonce,"base64");
  const salt=Buffer.from(input.salt,"base64");
  const ciphertext=Buffer.from(input.ciphertext,"base64");
  if(nonce.length!==12||salt.length!==16||ciphertext.length<17||ciphertext.length>MAX_EVENT_BYTES||
    nonce.toString("base64")!==input.nonce||salt.toString("base64")!==input.salt||
    ciphertext.toString("base64")!==input.ciphertext||
    createHash("sha256").update(ciphertext).digest("hex")!==input.ciphertextSha256)
    deny("Encrypted relay payload is malformed or corrupted.");
  return Object.freeze({...input});
}
const same=(a,b)=>Object.keys(a).every(k=>a[k]===b[k]);
function inspectChain(entries,envelope) {
  const sameOrg=entries.filter(e=>e.organizationId===envelope.organizationId);
  const event=sameOrg.find(e=>e.eventId===envelope.eventId);
  if(event)return {status:same(event,envelope)?"duplicate":"conflict",reason:same(event,envelope)?"same-event":"event-id-reuse",cursor:sameOrg.findIndex(e=>e===event)+1};
  if(sameOrg.some(e=>e.operationId===envelope.operationId))
    return {status:"conflict",reason:"operation-id-reuse",cursor:0};
  const device=sameOrg.filter(e=>e.deviceId===envelope.deviceId);
  const last=device.at(-1);
  if(envelope.sequence!==(last?.sequence??0)+1 ||
    envelope.previousDigest!==(last?.ciphertextSha256??ZERO))
    deny("Encrypted event sequence or previous digest diverges; resolve offline conflict.");
  return {status:"new",reason:null,cursor:sameOrg.length+1};
}
export function createRun14EncryptedReplicaStore(filename) {
  if(typeof filename!=="string"||!isAbsolute(filename)||filename.includes("\0"))
    deny("Absolute private replica journal path required.");
  const path=resolve(filename);
  const lockName=path+".lock";
  async function guard(fn) {
    const dir=await lstat(dirname(path));
    if(!dir.isDirectory()||(dir.mode&0o022)!==0)deny("Replica journal directory is unsafe.");
    let lock;
    for(let attempt=0;attempt<20;attempt++){
      try{lock=await open(lockName,constants.O_WRONLY|constants.O_EXCL|constants.O_CREAT|constants.O_NOFOLLOW,0o600);break;}
      catch(error){
        if(error.code!=="EEXIST"||attempt===19)throw error;
        // A stale lock is NEVER automatically broken; bounded contention
        // permits cooperating readers and writers to finish safely.
        await new Promise(resolve=>setTimeout(resolve,25));
      }
    }
    if(!lock)deny("Replica journal lock could not be acquired.");
    const original=await lock.stat();
    if(!original.isFile()||original.nlink!==1||(original.mode&0o077)!==0){
      await lock.close();deny("Unsafe replica lock.");
    }
    try{return await fn();}finally{
      const current=await lstat(lockName).catch(()=>null);
      await lock.close();
      if(!current||current.dev!==original.dev||current.ino!==original.ino||
          !current.isFile()||current.nlink!==1||(current.mode&0o077)!==0)
        deny("Replica lock changed; do not remove it.");
      await unlink(lockName);
    }
  }
  async function readEntries() {
    let handle;
    try{handle=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);}
    catch(e){if(e.code==="ENOENT")return [];throw e;}
    try{
      const info=await handle.stat();
      if(!info.isFile()||info.nlink!==1||(info.mode&0o077)!==0||info.size>MAX_BYTES)
        deny("Replica journal is inaccessible or exceeds safe size.");
      const data=await handle.readFile("utf8");
      if(data&&!data.endsWith("\n"))deny("Truncated replica journal.");
      const events=[], seen=new Map();
      for(const line of data.split("\n")){
        if(!line)continue;
        if(Buffer.byteLength(line)>MAX_EVENT_BYTES*2+2048)deny("Oversized replica record.");
        let parsed;try{parsed=JSON.parse(line);}catch{deny("Damaged replica record.");}
        const item=validateRun14Envelope(parsed);
        const prior=seen.get(item.organizationId)??[];
        if(inspectChain(prior,item).status!=="new")deny("Conflicting replica journal history.");
        prior.push(item);seen.set(item.organizationId,prior);events.push(item);
      }
      return events;
    }finally{await handle.close();}
  }
  return Object.freeze({
    async append(raw) {
      const item=validateRun14Envelope(raw);
      return guard(async()=>{
        const events=await readEntries();
        const outcome=inspectChain(events,item);
        if(outcome.status!=="new")return Object.freeze({
          status:outcome.status,reason:outcome.reason,organizationId:item.organizationId,
          eventId:item.eventId,ciphertextSha256:item.ciphertextSha256,cursor:outcome.cursor,
          financialReplicationEnabled:false
        });
        const line=JSON.stringify(item)+"\n";
        const oldBytes=events.reduce((sum,x)=>sum+Buffer.byteLength(JSON.stringify(x)+"\n"),0);
        if(oldBytes+Buffer.byteLength(line)>MAX_BYTES)deny("Replica journal storage capacity reached.");
        const fd=await open(path,constants.O_CREAT|constants.O_APPEND|constants.O_WRONLY|constants.O_NOFOLLOW,0o600);
        try{const info=await fd.stat();
          if(!info.isFile()||info.nlink!==1||(info.mode&0o077)!==0)deny("Unsafe replica journal file.");
          await fd.writeFile(line);await fd.sync();
        }finally{await fd.close();}
        return Object.freeze({status:"stored",reason:null,organizationId:item.organizationId,
          eventId:item.eventId,ciphertextSha256:item.ciphertextSha256,cursor:outcome.cursor,
          financialReplicationEnabled:false});
      });
    },
    async page(organizationId,after=0,limit=20) {
      if(!okId(organizationId)||!Number.isSafeInteger(after)||after<0||
        !Number.isSafeInteger(limit)||limit<1||limit>20)deny("Invalid replica pagination.");
      return guard(async()=>{
        const entries=(await readEntries()).filter(x=>x.organizationId===organizationId);
        if(after>entries.length)deny("Replica cursor exceeds durable history.");
        return Object.freeze({organizationId,after,nextCursor:Math.min(after+limit,entries.length),
          hasMore:after+limit<entries.length,events:Object.freeze(entries.slice(after,after+limit)),
          financialReplicationEnabled:false});
      });
    }
  });
}
