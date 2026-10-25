/** Validates delivery bookkeeping without transmitting records. */
export type SyncEntry={companyId:string;operationId:string;sequence:number;status:'pending'|'sent'|'acked';payloadHash:string;ackHash?:string};
export type SyncFinding={code:string;operationId:string};
const hash=/^[0-9a-f]{64}$/i;
export function reconcileSyncQueue(entries:readonly SyncEntry[]):SyncFinding[]{const out:SyncFinding[]=[];const keys=new Set<string>();const seq=new Map<string,Set<number>>();
 for(const e of entries){const key=`${e.companyId}::${e.operationId}`;if(!e.companyId||!e.operationId)out.push({code:'MISSING_ID',operationId:e.operationId});
  if(keys.has(key))out.push({code:'DUPLICATE_OPERATION',operationId:e.operationId});keys.add(key);
  if(!Number.isSafeInteger(e.sequence)||e.sequence<0)out.push({code:'INVALID_SEQUENCE',operationId:e.operationId});
  const s=seq.get(e.companyId)??new Set<number>();if(s.has(e.sequence))out.push({code:'DUPLICATE_SEQUENCE',operationId:e.operationId});s.add(e.sequence);seq.set(e.companyId,s);
  if(!hash.test(e.payloadHash))out.push({code:'INVALID_PAYLOAD_HASH',operationId:e.operationId});
  if(e.status==='acked'&&(!e.ackHash||e.payloadHash.toLowerCase()!==e.ackHash.toLowerCase()))out.push({code:'ACK_MISMATCH',operationId:e.operationId});
  if(!['pending','sent','acked'].includes(e.status))out.push({code:'INVALID_STATUS',operationId:e.operationId});
 }return out;}
