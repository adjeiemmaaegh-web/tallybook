import {createHash} from 'node:crypto';
const digest=value=>createHash('sha256').update(value).digest('hex');
const denied=()=>{throw Error('Restore drill failed validation');};
function normalize(data){
  if(data?.kind!=='tallybook-local-backup'||data.formatVersion!==1||
     !data.records||!Array.isArray(data.records.businessProfiles)||
     data.records.businessProfiles.length!==1)denied();
  const id=data.records.businessProfiles[0].id;
  const out={};
  for(const [key,rows] of Object.entries(data.records)){
    if(key==='appMeta')continue;
    if(!Array.isArray(rows))denied();
    out[key]=rows.map(row=>{
      if(!row||typeof row!=='object'||Array.isArray(row))denied();
      if(key==='businessProfiles'?row.id!==id:
        key==='stockCountSessions'?row.companyId!==id:row.businessProfileId!==id)denied();
      return key==='syncConsents'?{...row,enabled:false,updatedAt:null}:row;
    }).sort((a,b)=>String(a.id??a.businessProfileId).localeCompare(String(b.id??b.businessProfileId)));
  }
  if(data.assistant!==undefined)out.assistant=data.assistant;
  return {id,digest:digest(JSON.stringify(out))};
}
export async function performIndependentRestoreDrill({backupText,companyId,makeIsolatedStore}){
  if(typeof backupText!=='string'||Buffer.byteLength(backupText)>12*1024*1024||
     typeof makeIsolatedStore!=='function')denied();
  let backup;
  try{backup=JSON.parse(backupText);}catch{denied();}
  const expected=normalize(backup);
  if(companyId!==expected.id)denied();
  const store=await makeIsolatedStore();
  if(!store||typeof store.empty!=='function'||typeof store.import!=='function'||
     typeof store.snapshot!=='function'||typeof store.destroy!=='function')denied();
  try{
    if(await store.empty()!==true)denied();
    await store.import(backup);
    const actual=normalize(await store.snapshot());
    if(actual.id!==expected.id||actual.digest!==expected.digest)denied();
    return Object.freeze({companyId,backupManifestSha256:digest(backupText),
      restoreReceiptSha256:digest(expected.digest+':'+actual.digest),
      verifiedAtEpochMs:Date.now()});
  }finally{await store.destroy();}
}
