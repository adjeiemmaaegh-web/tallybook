/** Edge-compatible counterpart of server/deviceKeyEnrollmentBytes.
 * Caller must obtain actor and invitation scope from verified server state.
 * This proves key possession only; it does not grant enrollment authority.
 */
import {verifyPullSignature} from './pullSignature.mjs';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ID=/^[A-Za-z0-9:_-]{1,128}$/;
export async function verifyEnrollmentProof({token,companyId,storeId,userId,
  staffId,deviceId,publicKeySpkiPem,proofSignature},subtle=globalThis.crypto.subtle){
  if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token)||
     !UUID.test(companyId??'')||!UUID.test(userId??'')||
     ![storeId,staffId,deviceId].every(v=>typeof v==='string'&&ID.test(v))||
     typeof publicKeySpkiPem!=='string'||publicKeySpkiPem.length>500)return false;
  try{
    const hash=async value=>Array.from(new Uint8Array(await subtle.digest('SHA-256',
      new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');
    return await verifyPullSignature(publicKeySpkiPem,proofSignature,
      ['tallybook.device.enroll.v1',await hash(token),companyId,storeId,userId,
       staffId,deviceId,await hash(publicKeySpkiPem)],subtle);
  }catch{return false;}
}
