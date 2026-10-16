/** Run 14 — offline encrypted replication queue and quarantined inbox.
 * Secure relay ≠ permission to merge remote sales, money, stock or staff.
 * Passphrases/credentials are passed per explicit call, never stored here.
 */
import {nanoid} from "nanoid";
import {db,type TallybookDB} from "@/db/TallybookDB";
import {getActiveBusinessProfileId} from "@/features/business/activeCompany";
import {requirePermission} from "@/features/staff/staff";
import {withCoordinatedRetailWrite} from "@/features/backup/coordinatedRetailWrite";
import {assertRun7RetailWriteReady} from "@/features/backup/run7RetailWriteBarrier.mjs";
import {sealRun14Event,openRun14Event,validateRun14Envelope,RUN14_EMPTY_CHAIN_DIGEST,
 type Run14Envelope,type Run14ReplicaRecord} from "./run14Crypto";

export interface Run14QueuedEnvelope extends Run14Envelope {
  id:string; businessProfileId:string; status:"pending"|"acknowledged";
  acknowledgedAt?:string; serverCursor?:number;
}
export interface Run14InboxCopy {
  id:string;businessProfileId:string;serverCursor:number;
  envelope:Run14Envelope;receivedAt:string;verifiedBy:"aes-256-gcm";
  financialApplied:false;
}
export interface Run14Cursor {
  businessProfileId:string;nextCursor:number;updatedAt:string;
}
export interface Run14ReplicaPage {
  organizationId:string;after:number;nextCursor:number;hasMore:boolean;
  events:Run14Envelope[];financialReplicationEnabled:false;
}
const kinds=Object.freeze({
  inventoryMovements:"inventory-movement",
  sales:"sale-evidence",
  purchases:"purchase-evidence",
  storeTransferRequests:"store-transfer-evidence",
  saleReversals:"sale-reversal-evidence",
  cashPartialReturns:"cash-partial-return-evidence",
  inventoryCostEvents:"inventory-cost-evidence",
});
export type Run14SourceTable=keyof typeof kinds;
const id=/^[A-Za-z0-9:_-]{1,128}$/;
function companyScope(company:string) {
  if(!id.test(company)||company!==getActiveBusinessProfileId())
    throw Error("Active company identity changed during replica preparation.");
}
async function authority(database:TallybookDB,company:string,deviceId:string) {
  companyScope(company);
  await requirePermission("staff",database,company);
  const [profile,consent,device]=await Promise.all([
    database.businessProfiles.get(company),
    database.syncConsents.get(company),
    database.syncDevices.get(deviceId),
  ]);
  if(!profile||consent?.enabled!==true||!device||device.businessProfileId!==company||
    device.status!=="active")
    throw Error("Remote replication requires company consent and a locally active enrolled device.");
}
/** Read one saved immutable source row before sealing it. Never fabricate a
 * financial operation or infer absent remote checkout ordering.
 */
export async function queueRun14Evidence(input:{
  companyId:string;deviceId:string;sourceTable:Run14SourceTable;
  recordId:string;passphrase:string;operationId?:string;
},database:TallybookDB=db):Promise<Run14QueuedEnvelope> {
  const {companyId,deviceId,sourceTable,recordId,passphrase}=input;
  companyScope(companyId);
  if(!id.test(deviceId)||!id.test(recordId)||!Object.hasOwn(kinds,sourceTable))
    throw Error("Unsupported source evidence scope.");
  const operationId=input.operationId??nanoid(18);
  if(!id.test(operationId))throw Error("Invalid immutable operation ID.");
  const state=await database.transaction("r",[
    database.appMeta,database.businessProfiles,database.syncConsents,
    database.syncDevices,database.syncReplicaOutbox,database.staffMembers,
    database.table(sourceTable),
  ],async()=>{
    await assertRun7RetailWriteReady(database.appMeta);
    await authority(database,companyId,deviceId);
    const existing=await database.syncReplicaOutbox.where("[businessProfileId+operationId]").equals([companyId,operationId]).first();
    if(existing)throw Error("Operation is already queued; review its original ciphertext before retry.");
    const last=await database.syncReplicaOutbox.where("[businessProfileId+deviceId+sequence]")
      .between([companyId,deviceId,1],[companyId,deviceId,1_000_000]).last();
    const source=await database.table(sourceTable).get(recordId) as Record<string,unknown>|undefined;
    if(!source||source.businessProfileId!==companyId||source.id!==recordId)
      throw Error("Requested company ledger source record is missing.");
    const createdAt=new Date().toISOString();
    const record:Run14ReplicaRecord={recordKind:kinds[sourceTable],recordId,
      companyId,createdAt,content:JSON.parse(JSON.stringify(source)),
      automaticFinancialPosting:false};
    companyScope(companyId);
    return {record,createdAt,sequence:(last?.sequence??0)+1,
      previousDigest:last?.ciphertextSha256??RUN14_EMPTY_CHAIN_DIGEST};
  });
  const envelope=await sealRun14Event({
    organizationId:companyId,deviceId,eventId:nanoid(18),operationId,
    sequence:state.sequence,previousDigest:state.previousDigest,
    createdAt:state.createdAt,record:state.record,
  },passphrase);
  return withCoordinatedRetailWrite(async()=>database.transaction("rw",[
    database.appMeta,database.businessProfiles,database.syncConsents,
    database.syncDevices,database.syncReplicaOutbox,database.staffMembers,
    database.table(sourceTable),
  ],async()=>{
    await assertRun7RetailWriteReady(database.appMeta);
    await authority(database,companyId,deviceId);
    const existing=await database.syncReplicaOutbox.where("[businessProfileId+operationId]").equals([companyId,operationId]).first();
    if(existing)throw Error("Another invocation already queued this operation.");
    const last=await database.syncReplicaOutbox.where("[businessProfileId+deviceId+sequence]")
      .between([companyId,deviceId,1],[companyId,deviceId,1_000_000]).last();
    if((last?.sequence??0)+1!==envelope.sequence||
      (last?.ciphertextSha256??RUN14_EMPTY_CHAIN_DIGEST)!==envelope.previousDigest)
      throw Error("Replica chain advanced while encrypting. Review and start a new operation.");
    const latest=await database.table(sourceTable).get(recordId) as Record<string,unknown>|undefined;
    if(!latest||latest.businessProfileId!==companyId||
      JSON.stringify(latest)!==JSON.stringify(state.record.content))
      throw Error("Source ledger entry changed while replica was prepared.");
    companyScope(companyId);
    const queued:Run14QueuedEnvelope={...envelope,id:envelope.eventId,businessProfileId:companyId,status:"pending"};
    await database.syncReplicaOutbox.add(queued);
    return queued;
  }));
}
export async function pendingRun14Envelopes(company:string,database:TallybookDB=db) {
  companyScope(company);
  return database.transaction("r",database.businessProfiles,database.staffMembers,
    database.syncReplicaOutbox,async()=>{
    await requirePermission("staff",database,company);
    const rows=await database.syncReplicaOutbox.where("[businessProfileId+status]").equals([company,"pending"]).toArray();
    for(const row of rows) {validateRun14Envelope(stripRun14LocalState(row));if(row.businessProfileId!==company)throw Error("Replica outbox company corruption.");}
    companyScope(company);
    return rows.sort((a,b)=>a.deviceId.localeCompare(b.deviceId)||a.sequence-b.sequence);
  });
}
export function stripRun14LocalState(row:Run14QueuedEnvelope):Run14Envelope {
  const {id,businessProfileId,status,acknowledgedAt,serverCursor,...envelope}=row;
  validateRun14Envelope(envelope);
  if(id!==envelope.eventId||businessProfileId!==envelope.organizationId)throw Error("Local envelope identity corruption.");
  return envelope;
}
/** One remote page becomes durable only after every AEAD tag is verified.
 * No remote record is applied to the business ledger. */
export async function importRun14Page(
  database:TallybookDB,company:string,deviceId:string,page:Run14ReplicaPage,passphrase:string
):Promise<number> {
  companyScope(company);
  if(!page||page.organizationId!==company||page.financialReplicationEnabled!==false||
    !Number.isSafeInteger(page.after)||page.after<0||
    !Number.isSafeInteger(page.nextCursor)||page.nextCursor!==page.after+page.events?.length||
    !Array.isArray(page.events)||page.events.length>20||typeof page.hasMore!=="boolean")
    throw Error("Replica server page is malformed.");
  for(const envelope of page.events) {
    validateRun14Envelope(envelope);
    if(envelope.organizationId!==company)throw Error("Cross-company encrypted replica detected.");
    await openRun14Event(envelope,passphrase); // cryptographic proof, no financial mutation
  }
  return withCoordinatedRetailWrite(async()=>database.transaction("rw",[
    database.appMeta,database.businessProfiles,database.syncConsents,database.syncDevices,
    database.staffMembers,database.syncReplicaInbox,database.syncReplicaCursors
  ],async()=>{
    await assertRun7RetailWriteReady(database.appMeta);
    await authority(database,company,deviceId);
    const cursor=await database.syncReplicaCursors.get(company);
    if((cursor?.nextCursor??0)!==page.after)
      throw Error("Replica page cursor changed; never skip missing encrypted evidence.");
    const all=await database.syncReplicaInbox.where("businessProfileId").equals(company).toArray();
    const byDevice=new Map<string,{sequence:number;digest:string}>();
    const known=new Map<string,string>();
    for(const row of all.sort((a,b)=>a.serverCursor-b.serverCursor)) {
      const e=row.envelope;validateRun14Envelope(e);
      if(row.businessProfileId!==company||e.organizationId!==company||
        row.financialApplied!==false)throw Error("Remote replica inbox integrity failure.");
      known.set(e.eventId,e.ciphertextSha256);
      byDevice.set(e.deviceId,{sequence:e.sequence,digest:e.ciphertextSha256});
    }
    for(let i=0;i<page.events.length;i++) {
      const e=page.events[i],original=byDevice.get(e.deviceId);
      if(known.has(e.eventId))throw Error("Remote server replayed an already recorded event ID.");
      if(e.sequence!==(original?.sequence??0)+1||
        e.previousDigest!==(original?.digest??RUN14_EMPTY_CHAIN_DIGEST))
        throw Error("Remote device chain gap, fork or replay. Financial data unchanged.");
      byDevice.set(e.deviceId,{sequence:e.sequence,digest:e.ciphertextSha256});
      known.set(e.eventId,e.ciphertextSha256);
      await database.syncReplicaInbox.add({id:company+":"+(page.after+i+1),
        businessProfileId:company,serverCursor:page.after+i+1,
        envelope:e,receivedAt:new Date().toISOString(),
        verifiedBy:"aes-256-gcm",financialApplied:false});
    }
    companyScope(company);
    await database.syncReplicaCursors.put({businessProfileId:company,
      nextCursor:page.nextCursor,updatedAt:new Date().toISOString()});
    return page.nextCursor;
  }));
}
export async function inspectRun14InboxItem(
  database:TallybookDB,company:string,cursor:number,passphrase:string
):Promise<Run14ReplicaRecord> {
  companyScope(company);
  if(!Number.isSafeInteger(cursor)||cursor<1)throw Error("Invalid replica cursor.");
  const envelope=await database.transaction("r",database.businessProfiles,
    database.staffMembers,database.syncReplicaInbox,async()=>{
    await requirePermission("reports",database,company);
    const row=await database.syncReplicaInbox.get(company+":"+cursor);
    if(!row||row.businessProfileId!==company||row.financialApplied!==false)
      throw Error("Remote replica is missing or cannot be trusted.");
    return row.envelope;
  });
  const record=await openRun14Event(envelope,passphrase);
  companyScope(company);
  await requirePermission("reports",database,company);
  return record;
}
