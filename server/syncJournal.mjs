/** Server-controlled append-only synchronization journal.
 * Not wired to HTTP. All ingress remains disabled until authenticated persistence
 * and remote replay/financial reconciliation are verified end-to-end.
 */
import { open, lstat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve, dirname } from 'node:path';
const ID = /^[A-Za-z0-9:_-]{1,128}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const valid = s => typeof s === 'string' && ID.test(s);
const own = (o, k) => Object.prototype.hasOwnProperty.call(o,k);
const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
export function validateJournalEvent(e) {
  if (!object(e) || !valid(e.organizationId) || !valid(e.deviceId) || !valid(e.eventId) || !valid(e.operationId) ||
      typeof e.payloadDigest !== 'string' || !DIGEST.test(e.payloadDigest) ||
      Object.keys(e).sort().join(',') !== 'deviceId,eventId,operationId,organizationId,payloadDigest') throw new Error('Invalid journal event');
  return Object.freeze({organizationId:e.organizationId, deviceId:e.deviceId, eventId:e.eventId, operationId:e.operationId, payloadDigest:e.payloadDigest});
}
export function evaluateJournalEvent(entries, candidate) {
  const item = validateJournalEvent(candidate);
  for(const entry of entries) {
    if(entry.organizationId !== item.organizationId) continue;
    if(entry.eventId === item.eventId) {
      const exact = Object.keys(item).every(k=>item[k] === entry[k]);
      return Object.freeze({status:exact?'duplicate':'conflict',reason:exact?'same-event':'event-id-reuse'});
    }
    if(entry.operationId === item.operationId) return Object.freeze({status:'conflict',reason:'operation-id-reuse'});
  }
  return Object.freeze({status:'new',reason:null});
}
const LOCK_RETRY_MS = 20;
async function withLock(lockFile, callback) {
  // Exclusive process-level filesystem lock: stale locks fail closed and need
  // administrator intervention; never automatically break another writer's lock.
  let handle;
  for(let i=0;i<20;i++) {
    try {handle=await open(lockFile,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);break;}
    catch(e) {if(e.code!=='EEXIST' || i===19) throw e; await new Promise(r=>setTimeout(r,LOCK_RETRY_MS));}
  }
  // The exclusive lock is only valid while the pathname still names this
  // exact private, single-link inode. Never unlink an unexpected replacement.
  const original=await handle.stat();
  if(!original.isFile() || original.nlink!==1 || (original.mode & 0o077)!==0) {
    await handle.close(); throw new Error('Unsafe journal lock');
  }
  try {return await callback();} finally {
    const current=await lstat(lockFile).catch(()=>null);
    await handle.close();
    if(!current || !current.isFile() || current.dev!==original.dev || current.ino!==original.ino ||
        current.nlink!==1 || (current.mode & 0o077)!==0) throw new Error('Journal lock was replaced; refusing to unlink it');
    const {unlink}=await import('node:fs/promises'); await unlink(lockFile);
  }
}
async function readJournal(filename) {
  let handle;
  try {handle=await open(filename,constants.O_RDONLY|constants.O_NOFOLLOW);} catch(e) {if(e.code==='ENOENT') return []; throw e;}
  try {
    const info=await handle.stat();
    if(!info.isFile() || info.size>20_000_000 || (info.mode & 0o077)!==0 || info.nlink!==1) throw new Error('Unsafe journal file');
    const data=await handle.readFile({encoding:'utf8'});
    if(data.length && !data.endsWith('\n')) throw new Error('Incomplete journal record');
    const records=[]; const events=[];
    for(const line of data.split('\n')) {
      if(!line) continue;
      if(Buffer.byteLength(line)>2048) throw new Error('Oversized journal entry');
      const record=JSON.parse(line);
      if(!object(record) || record.version!==1 || !object(record.event) || typeof record.acceptedAt!=='string' ||
          Number.isNaN(Date.parse(record.acceptedAt)) || Object.keys(record).sort().join(',')!=='acceptedAt,event,version') throw new Error('Invalid journal record');
      const event=validateJournalEvent(record.event);
      if(evaluateJournalEvent(events,event).status!=='new') throw new Error('Duplicate or conflicting stored journal entry');
      events.push(event);records.push(Object.freeze({event,acceptedAt:record.acceptedAt}));
    }
    return records;
  } finally {await handle.close();}
}
export function createFileSyncJournal(filename) {
  if(typeof filename!=='string'|| !filename.startsWith('/')|| filename.includes('\0')) throw new Error('Absolute path required');
  const pathname=resolve(filename);
  async function guarded(action) {
    const parent=dirname(pathname);
    const folder=await lstat(parent);
    if(!folder.isDirectory() || (folder.mode & 0o022)!==0) throw new Error('Unsafe journal directory');
    return withLock(pathname+'.lock',action);
  }
  return Object.freeze({
    async inspect(organizationId) {
      if(!valid(organizationId)) throw new Error('Invalid organization ID');
      return guarded(async()=>Object.freeze((await readJournal(pathname)).filter(r=>r.event.organizationId===organizationId)));
    },
    async stageEvent(event) {
      const item=validateJournalEvent(event);
      return guarded(async()=>{
        const existing=await readJournal(pathname);
        const result=evaluateJournalEvent(existing.map(r=>r.event),item);
        if(result.status!=='new') return result;
        const record={version:1,event:item,acceptedAt:new Date().toISOString()};
        const serialized=JSON.stringify(record)+'\n';
        // O_EXCL on initial creation, and O_NOFOLLOW for subsequent opens.
        const fd=await open(pathname,constants.O_WRONLY|constants.O_APPEND|constants.O_CREAT|constants.O_NOFOLLOW,0o600);
        try {
          const before=await fd.stat();
          if(!before.isFile() || before.nlink!==1 || (before.mode & 0o077)!==0 || before.size+Buffer.byteLength(serialized)>20_000_000) throw new Error('Unsafe journal target');
          await fd.writeFile(serialized); await fd.sync();
        } finally {await fd.close();}
        return Object.freeze({status:'stored',reason:null});
      });
    }
  });
}
