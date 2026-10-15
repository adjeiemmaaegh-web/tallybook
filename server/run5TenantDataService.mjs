/**
 * V19 Run 5 — server-only, tenant-scoped cloud data boundary.
 * No browser company selector, local IndexedDB ID, or bearer-session payload is
 * accepted as owner evidence. All actions re-check canonical business/member
 * and live auth.sessions in the SAME SERIALIZABLE transaction as the data IO.
 * This is an inactive development adapter; NOT financial replication.
 */
import {requireRun5Access} from './run5TenantPolicy.mjs';
const DOMAIN=Object.freeze({
 products:'catalog',customers:'customers',suppliers:'suppliers',
 purchases:'purchases',sales:'sales','sale-lines':'sales',
 payments:'payments',expenses:'expenses',inventory:'inventory',
 ledger:'audit',assistant:'assistant',reports:'audit',
 backups:'audit',sync:'audit'
});
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RECORD=/^[A-Za-z0-9:_-]{1,128}$/;
const COLLECTIONS=new Set(['products','customers','suppliers','purchases',
  'sales','sale-lines','payments','expenses','inventory','ledger','assistant',
  'reports','backups','sync']);
const OWNER_ONLY=new Set(['ledger','reports','backups','assistant','sync',
  'expenses','purchases','suppliers']);
const MAX_PAGE=100,MAX_IMPORT=100,MAX_BODY=32768;
const deny=()=>{throw Error('Tenant data authorization denied');};
const validId=x=>typeof x==='string'&&UUID.test(x);
const validRecord=x=>typeof x==='string'&&RECORD.test(x);
const validCollection=x=>typeof x==='string'&&COLLECTIONS.has(x);
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
function assertScope(payload,companyId){
  if(!object(payload))deny();
  const visited=new WeakSet();
  const walk=(value,depth)=>{
    if(depth>20)deny();
    if(value===null||typeof value==='string'||typeof value==='boolean')return;
    if(typeof value==='number'&&Number.isSafeInteger(value))return;
    if(Array.isArray(value)){if(value.length>5000)deny();return value.forEach(v=>walk(v,depth+1));}
    if(!object(value)||Object.getPrototypeOf(value)!==Object.prototype||visited.has(value))deny();
    visited.add(value);
    for(const [key,val] of Object.entries(value)){
      if(['__proto__','prototype','constructor'].includes(key))deny();
      if(['companyId','businessProfileId','organizationId','tenantId'].includes(key)&&
        val!==companyId)deny();
      walk(val,depth+1);
    }
    visited.delete(value);
  };
  walk(payload,0);
  let serialized;
  try{serialized=JSON.stringify(payload);}catch{deny();}
  if(!serialized||serialized.length>MAX_BODY)deny();
  return payload;
}
function recordOut(record,companyId,collection){
  if(!record||record.companyId!==companyId||record.collection!==collection||
     !validRecord(record.id)||!Number.isSafeInteger(record.revision)||record.revision<1)deny();
  assertScope(record.payload,companyId);
  return Object.freeze({companyId,collection,id:record.id,
    revision:record.revision,payload:record.payload});
}
export function createRun5TenantDataService({resolveSession,store,clock=Date.now}={}){
  if(typeof resolveSession!=='function'||typeof store?.transaction!=='function'||
     typeof clock!=='function')deny();
  async function principal(token){
    if(typeof token!=='string'||token.length<20||token.length>16384)deny();
    const actor=await resolveSession(token);
    if(!validId(actor?.userId)||!validId(actor?.sessionId)||actor.active!==true||
       !Number.isSafeInteger(actor.expiresAtEpochMs))deny();
    return actor;
  }
  async function scoped(tx,actor,companyId,collection,kind){
    const now=clock();
    if(!validId(companyId)||!validCollection(collection)||
       !Number.isSafeInteger(now)||now<1||now>=actor.expiresAtEpochMs)deny();
    if(await tx.assertActiveSession(actor.sessionId,actor.userId,now)!==true)deny();
    const business=await tx.getCompany(companyId);
    const member=await tx.getMembership(companyId,actor.userId);
    if(business?.id!==companyId||!validId(business.ownerId)||
      member?.companyId!==companyId||member.userId!==actor.userId||
      member.status!=='active'||!['owner','attendant'].includes(member.role))deny();
    if(member.role==='owner'&&business.ownerId!==actor.userId)deny();
    if(member.role==='attendant'&&business.ownerId===actor.userId)deny();
    // Single authoritative Run 5 policy, including owner-only sensitive
    // exports/reports and a prohibition on generic financial writes.
    requireRun5Access({principal:actor,company:business,membership:member,
      request:{companyId,domain:DOMAIN[collection],
        action:kind==='owner'?'export':kind},now});
    if(member.role!=='owner'&&(kind!=='read'||
       !['products','inventory'].includes(collection)))deny();
    // Tenant RLS GUCs are installed only AFTER live session and membership
    // checks, in the same SQL transaction, never from HTTP request headers.
    if(await tx.activateTenantScope(actor.userId,companyId)!==true)deny();
    return Object.freeze({actorId:actor.userId,companyId,role:member.role,now});
  }
  const context=(input,collection,id=null)=>{
    if(!validId(input?.companyId)||!validCollection(collection)||
       (id!==null&&!validRecord(id)))deny();
  };
  const SAFE_METADATA_WRITES=new Set(['assistant']);
  const withScope=async ({session,companyId},collection,kind,callback)=>{
    context({companyId},collection);
    const actor=await principal(session);
    return store.transaction(async tx=>{
      const auth=await scoped(tx,actor,companyId,collection,kind);
      return callback(tx,auth);
    });
  };
  async function listScoped(input,kind='read'){
    const {companyId,collection}=input;
    const limit=input.limit??MAX_PAGE;
    const after=input.after??null;
    context(input,collection);
    if(!Number.isSafeInteger(limit)||limit<1||limit>MAX_PAGE||
       (after!==null&&!validRecord(after)))deny();
    return withScope(input,collection,kind,async(tx,auth)=>{
      const rows=await tx.listRows(companyId,collection,limit,after);
      if(!Array.isArray(rows)||rows.length>limit)deny();
      const items=rows.map(r=>recordOut(r,companyId,collection));
      await tx.appendAudit({companyId,actorId:auth.actorId,action:'read',
        collection,at:auth.now,recordId:null});
      return Object.freeze({companyId,collection,rows:items,
        nextCursor:items.length===limit?items.at(-1)?.id??null:null});
    });
  }
  return Object.freeze({
    async get(input){
      const {companyId,collection,id}=input;
      context(input,collection,id);
      return withScope(input,collection,'read',async(tx,auth)=>{
        const row=await tx.getRow(companyId,collection,id);
        if(!row)deny(); // Uniform denial also avoids cross-company ID enumeration.
        const value=recordOut(row,companyId,collection);
        await tx.appendAudit({companyId,actorId:auth.actorId,action:'read',
          collection,recordId:id,at:auth.now});
        return value;
      });
    },
    list:listScoped,
    async put(input){
      const {companyId,collection,id,payload,expectedRevision}=input;
      if(!SAFE_METADATA_WRITES.has(collection))deny();
      context(input,collection,id);
      if(!Number.isSafeInteger(expectedRevision)||expectedRevision<0)deny();
      assertScope(payload,companyId);
      return withScope(input,collection,'write',async(tx,auth)=>{
        // 0 = create only, positive = compare-and-swap current revision.
        const row=await tx.putRow({companyId,collection,id,payload,expectedRevision});
        const value=recordOut(row,companyId,collection);
        await tx.appendAudit({companyId,actorId:auth.actorId,action:'write',
          collection,recordId:id,at:auth.now});
        return value;
      });
    },
    async remove(input){
      const {companyId,collection,id,expectedRevision}=input;
      if(!SAFE_METADATA_WRITES.has(collection))deny();
      context(input,collection,id);
      if(!Number.isSafeInteger(expectedRevision)||expectedRevision<1)deny();
      return withScope(input,collection,'write',async(tx,auth)=>{
        await tx.deleteRow(companyId,collection,id,expectedRevision);
        await tx.appendAudit({companyId,actorId:auth.actorId,action:'delete',
          collection,recordId:id,at:auth.now});
        return Object.freeze({companyId,collection,id,removed:true});
      });
    },
    async exportRows(input){
      // Administrative export is always owner-only, never account-selector-only.
      const data=await listScoped({...input,limit:Math.min(input?.limit??MAX_PAGE,MAX_PAGE)},'owner');
      return Object.freeze({...data,exported:true});
    },
    async importRows(input){
      const {companyId,collection,rows}=input??{};
      // No generic import of finance, stock or customer records in Run 5.
      if(!SAFE_METADATA_WRITES.has(collection))deny();
      context(input,collection);
      if(!Array.isArray(rows)||rows.length<1||rows.length>MAX_IMPORT)deny();
      const seen=new Set();
      for(const r of rows){
        if(r?.companyId!==companyId||r.collection!==collection||
           !validRecord(r.id)||seen.has(r.id)||r.expectedRevision!==0)deny();
        seen.add(r.id);assertScope(r.payload,companyId);
      }
      return withScope(input,collection,'owner',async(tx,auth)=>{
        // Entire import in ONE serializable transaction and audit scope.
        for(const r of rows){
          const saved=await tx.putRow({...r,expectedRevision:0});
          recordOut(saved,companyId,collection);
        }
        await tx.appendAudit({companyId,actorId:auth.actorId,action:'import',
          collection,recordId:null,at:auth.now});
        return Object.freeze({companyId,collection,imported:rows.length});
      });
    },
    async report(input){
      // No user-supplied SQL, aggregate, filter or projection is executed.
      const collection='reports';
      const result=await listScoped({...input,collection},'owner');
      return Object.freeze({...result,authoritativeLedger:false});
    },
    async assistant(input){
      // Grounded data only. No assistant tool is permitted to bypass this.
      return listScoped({...input,collection:'assistant'},'owner');
    },
    async syncInspect(input){
      const data=await listScoped({...input,collection:'sync'},'owner');
      return Object.freeze({...data,replicationEnabled:false});
    }
  });
}
