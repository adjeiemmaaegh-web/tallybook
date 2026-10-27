/** Explicit enrollment transport for the private, disabled-by-default server.
 * The one-use token stays in memory. No Auth token or key enters business data.
 */
import {activateDeviceKey,signDeviceEnrollmentProof,type DeviceKeyScope} from './deviceKeyVault';

const bearer=/^[A-Za-z0-9._~-]{20,16384}$/;
const origin=(value:string):string=>{
  let url:URL;
  try{url=new URL(value);}catch{throw Error('Invalid central server origin.');}
  if(url.protocol!=='https:'||url.origin!==value||url.username||url.password||
     url.search||url.hash||url.pathname!=='/')throw Error('Central server requires an HTTPS origin.');
  return url.origin;
};
type Guards={resolveUserId:()=>Promise<string>;
  currentLocalScope:()=>{companyId:string|null;staffId:string|null}};
type Receipt={companyId:string;storeId:string;userId:string;staffId:string;deviceId:string;
  publicKeyBound:true;hardwareBound:false};

export function createCentralDeviceClient({serverOrigin,accessToken,transport=fetch}:{
  serverOrigin:string;accessToken:string;transport?:(url:string,init:RequestInit)=>Promise<Response>}) {
  const base=origin(serverOrigin);
  if(!bearer.test(accessToken))throw Error('Cloud sign-in required for device administration.');
  async function post<T>(path:string,body:Record<string,string>):Promise<T> {
    const url=base+path;
    const response=await transport(url,{method:'POST',mode:'cors',redirect:'error',
      cache:'no-store',credentials:'omit',headers:{'content-type':'application/json',
        authorization:`Bearer ${accessToken}`},body:JSON.stringify(body)});
    if(response.status!==200||response.redirected||response.type==='opaque'||
       response.url!==url||!/^application\/json(?:\s*;|\s*$)/i.test(response.headers.get('content-type')??''))
      throw Error('Device administration was not confirmed by the server.');
    const raw=await response.text();
    if(raw.length>2048)throw Error('Oversized device administration response.');
    try{return JSON.parse(raw) as T;}catch{throw Error('Invalid device administration response.');}
  }
  return Object.freeze({
    provisionStaff:({companyId,localCompanyId,storeId,staffId,targetUserId}:{
      companyId:string;localCompanyId:string;storeId:string;staffId:string;targetUserId:string})=>
      post<{status:'active'}>('/api/central/staff/provision',
        {companyId,localCompanyId,storeId,staffId,targetUserId}),
    issueInvite:({companyId,storeId,targetUserId}:{companyId:string;storeId:string;targetUserId:string})=>
      post<{inviteId:string;token:string;expiresAt:number}>('/api/central/devices/invite',
        {companyId,storeId,targetUserId}),
    async redeemKeyInvite(scope:DeviceKeyScope,token:string,guards:Guards):Promise<Receipt> {
      const proof=await signDeviceEnrollmentProof(scope,token,
        guards.resolveUserId,guards.currentLocalScope);
      const receipt=await post<Receipt>('/api/central/devices/redeem',{
        token,staffId:scope.staffId,deviceId:scope.deviceId,
        publicKeySpkiPem:proof.publicKeySpkiPem,proofSignature:proof.proofSignature});
      await activateDeviceKey(scope,receipt,guards.resolveUserId,guards.currentLocalScope);
      return receipt;
    },
    revokeKey:({companyId,deviceId}:{companyId:string;deviceId:string})=>
      post<{revoked:true}>('/api/central/devices/revoke',{companyId,deviceId}),
  });
}
