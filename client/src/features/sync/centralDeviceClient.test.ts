import {describe,it,expect,vi} from 'vitest';
const {proof,activate}=vi.hoisted(()=>({proof:vi.fn(),activate:vi.fn()}));
vi.mock('./deviceKeyVault',()=>({signDeviceEnrollmentProof:proof,activateDeviceKey:activate}));
import {createCentralDeviceClient} from './centralDeviceClient';
import type {DeviceKeyScope} from './deviceKeyVault';

const scope={supabaseOrigin:'https://test.supabase.co',userId:'user',cloudCompanyId:'company',
  localCompanyId:'local',shopId:'shop',staffId:'staff',deviceId:'device'} as DeviceKeyScope;
const receipt={companyId:'company',storeId:'shop',userId:'user',staffId:'staff',deviceId:'device',
  publicKeyBound:true as const,hardwareBound:false as const};
const guards={resolveUserId:async()=>scope.userId,currentLocalScope:()=>({companyId:'local',staffId:'staff'})};
const serverOrigin='https://tallybook.example';
describe('explicit central device transport',()=>{
  it('sends only bearer authorization without cookies and activates after exact receipt',async()=>{
    proof.mockResolvedValue({publicKeySpkiPem:'public',proofSignature:'signature'});
    activate.mockResolvedValue(undefined);
    const calls:RequestInit[]=[];
    const client=createCentralDeviceClient({serverOrigin,accessToken:'x'.repeat(30),
      transport:async(url,init)=>{expect(url).toBe(serverOrigin+'/api/central/devices/redeem');
        calls.push(init);return {status:200,redirected:false,type:'basic',url,
          headers:new Headers({'content-type':'application/json'}),text:async()=>JSON.stringify(receipt)} as Response;}});
    expect(await client.redeemKeyInvite(scope,'a'.repeat(64),guards)).toEqual(receipt);
    expect(calls[0].credentials).toBe('omit');
    expect(calls[0].redirect).toBe('error');
    expect(JSON.parse(calls[0].body as string)).toEqual({token:'a'.repeat(64),staffId:'staff',
      deviceId:'device',publicKeySpkiPem:'public',proofSignature:'signature'});
    expect(activate).toHaveBeenCalledWith(scope,receipt,guards.resolveUserId,guards.currentLocalScope);
  });
  it('keeps the key pending on an untrusted response',async()=>{
    activate.mockClear();proof.mockResolvedValue({publicKeySpkiPem:'public',proofSignature:'signature'});
    const client=createCentralDeviceClient({serverOrigin,accessToken:'x'.repeat(30),
      transport:async(url)=>({status:200,redirected:true,type:'basic',url,
        headers:new Headers({'content-type':'application/json'}),text:async()=>JSON.stringify(receipt)} as Response)});
    await expect(client.redeemKeyInvite(scope,'a'.repeat(64),guards)).rejects.toThrow();
    expect(activate).not.toHaveBeenCalled();
    expect(()=>createCentralDeviceClient({serverOrigin:'http://tallybook.example',accessToken:'x'.repeat(30)})).toThrow();
  });
});
