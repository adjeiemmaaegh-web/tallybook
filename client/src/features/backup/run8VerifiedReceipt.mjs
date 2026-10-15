/** Run 8 local backup verification marker.
 * Earlier "lastBackupAt" entries meant only download was initiated.
 * This new marker is issued only after an encrypted file is reselected,
 * byte-matched, decrypted and parsed. Still NOT proof of off-device retention.
 */
export const RUN8_VERIFIED_RECEIPT_KEY='verifiedBackupReceiptV2';
export const RUN8_VERIFIED_RECEIPT_KIND='tallybook-verified-local-file-v2';
function validDate(x){
 return typeof x==='string'&&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(x)&&
  Number.isFinite(Date.parse(x))&&new Date(x).toISOString()===x;
}
export function serializeRun8VerifiedReceipt(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||
    Object.keys(value).length!==5||
    Object.keys(value).some(k=>!['kind','companyId','createdAt','verifiedAt','sha256'].includes(k))||
    value.kind!==RUN8_VERIFIED_RECEIPT_KIND||
    typeof value.companyId!=='string'||!value.companyId.trim()||
    value.companyId.length>200||
    !validDate(value.createdAt)||!validDate(value.verifiedAt)||
    typeof value.sha256!=='string'||!/^[0-9a-f]{64}$/.test(value.sha256))
  throw Error('Invalid verified backup-file receipt.');
 return JSON.stringify({
  kind:RUN8_VERIFIED_RECEIPT_KIND,
  companyId:value.companyId,
  createdAt:value.createdAt,
  verifiedAt:value.verifiedAt,
  sha256:value.sha256
 });
}
export function parseRun8VerifiedReceipt(raw){
 if(typeof raw!=='string'||raw.length>1024)
  throw Error('Invalid verified backup-file receipt.');
 let value;
 try{value=JSON.parse(raw);}catch{throw Error('Invalid verified backup-file receipt.');}
 const normalized=serializeRun8VerifiedReceipt(value);
 const result=JSON.parse(normalized);
 return Object.freeze(result);
}
