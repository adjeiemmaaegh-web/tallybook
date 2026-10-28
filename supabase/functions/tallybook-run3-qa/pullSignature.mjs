/** Verify the one-use read proof against the owner-approved SPKI device key. */
export async function verifyPullSignature(pem,signature,parts,
  subtle=globalThis.crypto.subtle){
  if(typeof pem!=='string'||pem.length>2048||
     !/^-----BEGIN PUBLIC KEY-----\n[A-Za-z0-9+/=\n]+\n-----END PUBLIC KEY-----\n$/.test(pem)||
     !/^[A-Za-z0-9_-]{86}$/.test(signature)||
     !Array.isArray(parts)||parts.length!==8||
     !parts.every(part=>typeof part==='string'&&part.length<=512))return false;
  try{
    const spki=Uint8Array.from(atob(pem.replace(/-----[^-]+-----|\s/g,'')),x=>x.charCodeAt(0));
    const encoded=signature.replace(/-/g,'+').replace(/_/g,'/');
    const bytes=Uint8Array.from(atob(encoded+'=='),x=>x.charCodeAt(0));
    if(bytes.length!==64)return false;
    const key=await subtle.importKey('spki',spki,{name:'Ed25519'},false,['verify']);
    return subtle.verify('Ed25519',key,bytes,
      new TextEncoder().encode(parts.join('\n')));
  }catch{return false;}
}
