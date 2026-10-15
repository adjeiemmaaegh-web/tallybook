/** Run 5: tenant-scope EVERY cloud service operation inside one DB transaction.
 * This does not authorize financial ledger changes or turn on cloud sync.
 */
import {validateRun5Request,requireRun5Access,assertRun5ScopedRows,
  assertRun5ScopedPayload} from './run5TenantPolicy.mjs';
const deny=()=>{throw Error('Tenant operation denied');};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function createRun5TenantService({resolveSession,store,clock=Date.now,features={}}={}){
  if(typeof resolveSession!=='function'||typeof store?.transaction!=='function')deny();
  async function transact({session,companyId,domain,action,recordId=null},task){
    const request=validateRun5Request({companyId,domain,action,recordId});
    if(typeof session!=='string'||session.length<20||session.length>16384)deny();
    const principal=await resolveSession(session);
    if(!principal||typeof principal.userId!=='string'||typeof principal.sessionId!=='string')deny();
    return store.transaction(async tx=>{
      const now=clock();
      if(!Number.isSafeInteger(now)||now<=0||now>=principal.expiresAtEpochMs||
         await tx.assertActiveSession(principal.sessionId,principal.userId,now)!==true)deny();
      const company=await tx.getCompany(companyId);
      const membership=await tx.getMembership(companyId,principal.userId);
      const verified=requireRun5Access({principal,company,membership,request,now});
      return task(tx,verified);
    });
  }
  const audit=async(tx,verified)=>tx.appendAudit({companyId:verified.companyId,
    actorId:verified.userId,action:verified.action,domain:verified.domain,
    recordId:verified.recordId});
  return Object.freeze({
    async read({session,companyId,domain,recordId=null,limit=50}){
      if(!Number.isSafeInteger(limit)||limit<1||limit>200)deny();
      return transact({session,companyId,domain,recordId,action:'read'},
        async(tx,ctx)=>Object.freeze({companyId,domain,rows:assertRun5ScopedRows(
          await tx.readRecords({companyId,domain,recordId,limit}),companyId,{max:limit,domain})}));
    },
    async writeMetadata({session,companyId,domain,recordId,data,expectedRevision=0}){
      if(!['catalog','assistant'].includes(domain)||!uuid.test(recordId??'')||
         !Number.isSafeInteger(expectedRevision)||expectedRevision<0)deny();
      const payload=assertRun5ScopedPayload({companyId,domain,recordId,data},companyId);
      return transact({session,companyId,domain,recordId,action:'write'},
        async(tx,ctx)=>{
          const result=await tx.upsertMetadata({companyId,domain,recordId,
            data:payload.data,expectedRevision,actorId:ctx.userId});
          if(result?.companyId!==companyId||result.recordId!==recordId||
             result.domain!==domain||!Number.isSafeInteger(result.revision)||
             result.revision<=expectedRevision)deny();
          await audit(tx,ctx);
          return Object.freeze({companyId,domain,recordId,revision:result.revision});
        });
    },
    async report({session,companyId,domain}){
      return transact({session,companyId,domain,action:'report'},async(tx,ctx)=>{
        const count=await tx.countRecords({companyId,domain});
        if(!Number.isSafeInteger(count)||count<0)deny();
        await audit(tx,ctx);
        return Object.freeze({companyId,domain,recordCount:count,provisional:true});
      });
    },
    async exportManifest({session,companyId,domain}){
      return transact({session,companyId,domain,action:'export'},async(tx,ctx)=>{
        const count=await tx.countRecords({companyId,domain});
        if(!Number.isSafeInteger(count)||count<0)deny();
        await audit(tx,ctx);
        return Object.freeze({companyId,domain,recordCount:count,
          containsBusinessData:false});
      });
    },
    async backup({session,companyId,domain}){
      if(features.backup!==true)deny();
      return transact({session,companyId,domain,action:'backup'},async(tx,ctx)=>{
        const rows=assertRun5ScopedRows(await tx.readRecords({
          companyId,domain,recordId:null,limit:200}),companyId,{max:200,domain});
        await audit(tx,ctx);
        return Object.freeze({companyId,domain,rows,complete:false});
      });
    },
    async importMetadata({session,companyId,domain,records}){
      if(features.import!==true||!['catalog','assistant'].includes(domain)||
         !Array.isArray(records)||records.length<1||records.length>100)deny();
      const seen=new Set();
      for(const value of records){
        assertRun5ScopedPayload(value,companyId);
        if(value.domain!==domain||seen.has(value.recordId))deny();
        seen.add(value.recordId);
      }
      return transact({session,companyId,domain,action:'import'},async(tx,ctx)=>{
        for(const value of records)await tx.insertImportedMetadata({
          companyId,domain,recordId:value.recordId,data:value.data,actorId:ctx.userId});
        await audit(tx,ctx);
        return Object.freeze({companyId,domain,imported:records.length});
      });
    },
    async assistantContext({session,companyId,domain}){
      if(features.assistant!==true)deny();
      return transact({session,companyId,domain,action:'assistant'},async(tx,ctx)=>{
        const context=assertRun5ScopedRows(await tx.readRecords({
          companyId,domain,recordId:null,limit:50}),companyId,{max:50,domain});
        await audit(tx,ctx);
        return Object.freeze({companyId,domain,context,externalInferenceEnabled:false});
      });
    },
    async syncPreview({session,companyId,domain}){
      if(features.sync!==true)deny();
      return transact({session,companyId,domain,action:'sync'},async(tx,ctx)=>{
        const count=await tx.countRecords({companyId,domain});
        if(!Number.isSafeInteger(count)||count<0)deny();
        await audit(tx,ctx);
        return Object.freeze({companyId,domain,queuedCount:count,
          replicationEnabled:false});
      });
    }
  });
}
