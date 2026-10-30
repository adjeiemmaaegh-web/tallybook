import type {QaSaleEvent,QaSalePage} from './qaSalePageBoundary.mjs';

const BASE64=/^[A-Za-z0-9_-]{1,87382}$/;
const hex=(bytes:Uint8Array)=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
function decode(value:string):Uint8Array {
  if(!BASE64.test(value))throw Error('QA claim lacks exact signed payload bytes.');
  const padded=value.replace(/-/g,'+').replace(/_/g,'/');
  const binary=atob(padded+'='.repeat((4-padded.length%4)%4));
  const bytes=Uint8Array.from(binary,ch=>ch.charCodeAt(0));
  if(bytes.length>64*1024 || btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')!==value)
    throw Error('QA claim exact payload encoding is invalid.');
  return bytes;
}
export async function verifyQaExactSalePayloads(page:Readonly<QaSalePage>,
  localCompanyId:string,subtle:SubtleCrypto=crypto.subtle):Promise<Readonly<QaSalePage>> {
  const events:QaSaleEvent[]=[];
  for(const event of page.events){
    const bytes=decode(event.payloadBase64??'');
    const digest=hex(new Uint8Array(await subtle.digest('SHA-256',bytes as BufferSource)));
    if(digest!==event.payloadSha256)throw Error('QA claim payload digest differs from signed bytes.');
    let payload:Record<string,unknown>;
    try{
      const parsed:unknown=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
      if(!parsed||typeof parsed!=='object'||Array.isArray(parsed)||
         JSON.stringify(parsed)!==new TextDecoder().decode(bytes))throw Error();
      payload=parsed as Record<string,unknown>;
    }catch{throw Error('QA claim exact payload is invalid JSON.');}
    if(payload.id!==event.eventId||payload.operationId!==event.operationId||
       payload.shopId!==event.storeId||payload.staffId!==event.staffId||
       payload.businessProfileId!==localCompanyId||payload.kind!=='sale.completed'||
       payload.payloadVersion!==1||payload.deliveryStatus!=='local_only')
      throw Error('QA claim signed payload scope differs from server claim.');
    events.push(Object.freeze({...event,payload}));
  }
  return Object.freeze({...page,events:Object.freeze(events)});
}
