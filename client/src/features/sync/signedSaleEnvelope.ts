import {validateCentralSaleEvent, type CentralSaleEvent} from './centralSaleEvent';

export type SignedSaleEnvelope={version:1;eventId:string;operationId:string;businessId:string;
  shopId:string;staffId:string;deviceId:string;payloadBase64:string;signature:string};
const ID=/^[A-Za-z0-9:_-]{1,128}$/;
function base64url(bytes:Uint8Array):string {
  let binary='';
  for(let i=0;i<bytes.length;i+=8192)
    binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
  return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function signingBytes(e:Omit<SignedSaleEnvelope,'signature'>):Uint8Array {
  return new TextEncoder().encode(['tallybook.central.sale.v1',e.eventId,e.operationId,
    e.businessId,e.shopId,e.staffId,e.deviceId,e.payloadBase64].join('\n'));
}

/** Build an upload-time claim from the immutable local event. The key must be
 * the non-extractable private key enrolled for this actor, shop and device.
 * This does not attest the physical origin or payment status of the sale.
 */
export async function signLocalSaleEvent(event:CentralSaleEvent,deviceId:string,
  privateKey:CryptoKey,subtle:SubtleCrypto=globalThis.crypto.subtle):Promise<SignedSaleEnvelope> {
  validateCentralSaleEvent(event);
  if(!event.shopId||![event.id,event.operationId,event.businessProfileId,event.shopId,
    event.staffId,deviceId].every(id=>ID.test(id))||
    privateKey?.type!=='private'||privateKey.extractable!==false||
    privateKey.algorithm?.name!=='Ed25519'||!privateKey.usages.includes('sign'))
    throw Error('Sale event cannot be signed for cloud upload.');
  const payloadBytes=new TextEncoder().encode(JSON.stringify(event));
  if(payloadBytes.length===0||payloadBytes.length>64*1024)
    throw Error('Sale event exceeds the signed upload limit.');
  const unsigned:Omit<SignedSaleEnvelope,'signature'>={version:1,eventId:event.id,
    operationId:event.operationId,businessId:event.businessProfileId,shopId:event.shopId,
    staffId:event.staffId,deviceId,payloadBase64:base64url(payloadBytes)};
  const signature=new Uint8Array(await subtle.sign('Ed25519',privateKey,signingBytes(unsigned) as BufferSource));
  if(signature.length!==64)throw Error('Invalid Ed25519 sale signature.');
  return {...unsigned,signature:base64url(signature)};
}
