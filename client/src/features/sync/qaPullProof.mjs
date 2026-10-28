/** QA-only possession proof for a one-use, server-bound sale read challenge. */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ID=/^[A-Za-z0-9:_-]{1,128}$/;
const NONCE=/^[A-Za-z0-9_-]{43}$/;
const CURSOR=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|\+00:00)$/;
const b64url=bytes=>btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');

export function validateQaPullChallenge(value,scope,now=Date.now()){
  if(!value||typeof value!=='object'||Array.isArray(value)||
     !UUID.test(value.challengeId??'')||!NONCE.test(value.nonce??'')||
     value.companyId!==scope?.companyId||value.deviceId!==scope?.deviceId||
     !Number.isSafeInteger(value.expiresAtEpochMs)||
     value.expiresAtEpochMs<=now||value.expiresAtEpochMs>now+120_000)
    throw Error('QA device challenge is invalid or expired.');
  return Object.freeze({challengeId:value.challengeId,nonce:value.nonce,
    expiresAtEpochMs:value.expiresAtEpochMs});
}

export function qaPullSigningBytes(scope,userId,challenge){
  if(!UUID.test(scope?.companyId??'')||!ID.test(scope?.deviceId??'')||
     !UUID.test(userId??'')||!UUID.test(challenge?.challengeId??'')||
     !NONCE.test(challenge?.nonce??'')||
     !CURSOR.test(scope?.afterUtc??'')||!Number.isFinite(Date.parse(scope.afterUtc))||
     !/^[A-Za-z0-9:_-]{0,128}$/.test(scope?.afterOperationId??''))
    throw Error('QA sale pull scope is invalid.');
  return new TextEncoder().encode(['tallybook.central.pull.v1',scope.companyId,
    scope.deviceId,userId,challenge.challengeId,challenge.nonce,scope.afterUtc,
    scope.afterOperationId].join('\n'));
}

export async function signQaPullChallenge(scope,userId,challenge,privateKey,
  subtle=globalThis.crypto.subtle){
  if(privateKey?.type!=='private'||privateKey.extractable!==false||
     privateKey.algorithm?.name!=='Ed25519'||!privateKey.usages.includes('sign'))
    throw Error('Active non-extractable device key required.');
  const bytes=qaPullSigningBytes(scope,userId,challenge);
  const signed=new Uint8Array(await subtle.sign('Ed25519',privateKey,bytes));
  if(signed.length!==64)throw Error('Invalid QA device proof.');
  return b64url(signed);
}
