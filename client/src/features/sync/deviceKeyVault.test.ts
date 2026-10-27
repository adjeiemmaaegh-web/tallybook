import {describe,it,expect} from 'vitest';
import {createHash,createPublicKey,verify,webcrypto} from 'node:crypto';
import {createPendingDeviceKey,signDeviceEnrollmentProof,activateDeviceKey,
  loadActiveDeviceKey,forgetDeviceKey,type DeviceKeyScope} from './deviceKeyVault';

const scope:DeviceKeyScope={supabaseOrigin:'https://test.supabase.co',
  userId:'11111111-1111-4111-8111-111111111111',
  cloudCompanyId:'22222222-2222-4222-8222-222222222222',
  localCompanyId:'localA',staffId:'staffA',shopId:'shopA',deviceId:'deviceVaultA'};
const local={companyId:'localA',staffId:'staffA'};
const user=async()=>scope.userId;
const current=()=>local;
const cryptoApi=webcrypto.subtle as unknown as SubtleCrypto;

describe('device-local signing key vault',()=>{
  it('persists a non-extractable pending key, proves possession, activates and forgets it',async()=>{
    const prepared=await createPendingDeviceKey(scope,user,current,cryptoApi);
    expect(prepared.deviceId).toBe(scope.deviceId);
    await expect(loadActiveDeviceKey(scope,user,current)).rejects.toThrow();
    const token='a'.repeat(64);
    const proof=await signDeviceEnrollmentProof(scope,token,user,current,cryptoApi);
    expect(proof.publicKeySpkiPem).toBe(prepared.publicKeySpkiPem);
    const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
    const bytes=Buffer.from(['tallybook.device.enroll.v1',hash(token),scope.cloudCompanyId,
      scope.shopId,scope.userId,scope.staffId,scope.deviceId,hash(proof.publicKeySpkiPem)].join('\n'));
    expect(verify(null,bytes,createPublicKey(proof.publicKeySpkiPem),
      Buffer.from(proof.proofSignature,'base64url'))).toBe(true);
    await expect(activateDeviceKey(scope,{companyId:scope.cloudCompanyId,storeId:scope.shopId,
      userId:scope.userId,staffId:'wrong',deviceId:scope.deviceId,
      publicKeyBound:true,hardwareBound:false},user,current)).rejects.toThrow();
    const receipt={companyId:scope.cloudCompanyId,storeId:scope.shopId,userId:scope.userId,
      staffId:scope.staffId,deviceId:scope.deviceId,publicKeyBound:true as const,hardwareBound:false as const};
    await activateDeviceKey(scope,receipt,user,current);
    const key=await loadActiveDeviceKey(scope,user,current);
    expect(key.extractable).toBe(false);
    await expect(loadActiveDeviceKey(scope,async()=> '33333333-3333-4333-8333-333333333333',current)).rejects.toThrow();
    await forgetDeviceKey(scope,user,current);
    await expect(loadActiveDeviceKey(scope,user,current)).rejects.toThrow();
  });
});
