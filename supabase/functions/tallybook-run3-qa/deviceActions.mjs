import {verifyEnrollmentProof} from './enrollmentProof.mjs';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ID=/^[A-Za-z0-9:_-]{1,128}$/;
const actions={deviceProvision:'provision',deviceInvite:'invite',deviceRedeem:'redeem',deviceRevoke:'revoke'};
const hex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
const digest=async value=>hex(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))));
/** actor/session are supplied only after Auth.getUser and JWT checks in index.ts. */
export async function handleQaDeviceAction(client,action,body,actor,session){
 const operation=actions[action];
 if(!operation||!UUID.test(actor??'')||!UUID.test(session??'')||
   !UUID.test(body.companyId??'')||!ID.test(body.storeId??''))throw Error('Device scope invalid');
 const args={p_operation:operation,p_actor:actor,p_session:session,p_company:body.companyId,
  p_store:body.storeId,p_local:null,p_target:null,p_staff:null,p_device:null,p_token_hash:null,p_key:null};
 let token;
 if(operation==='provision'){
  if(!ID.test(body.localCompanyId??'')||!ID.test(body.staffId??'')||!UUID.test(body.targetUserId??''))
   throw Error('Staff scope invalid');
  Object.assign(args,{p_local:body.localCompanyId,p_staff:body.staffId,p_target:body.targetUserId});
 }else if(operation==='invite'){
  if(!UUID.test(body.targetUserId??''))throw Error('Invitation target invalid');
  token=hex(crypto.getRandomValues(new Uint8Array(32)));
  Object.assign(args,{p_target:body.targetUserId,p_token_hash:await digest(token)});
 }else if(operation==='redeem'){
  if(!await verifyEnrollmentProof({token:body.token,companyId:body.companyId,storeId:body.storeId,
    userId:actor,staffId:body.staffId,deviceId:body.deviceId,
    publicKeySpkiPem:body.publicKeySpkiPem,proofSignature:body.proofSignature}))
   throw Error('Enrollment proof denied');
  Object.assign(args,{p_staff:body.staffId,p_device:body.deviceId,
   p_token_hash:await digest(body.token),p_key:body.publicKeySpkiPem});
 }else{
  if(!ID.test(body.deviceId??''))throw Error('Device ID invalid');
  args.p_device=body.deviceId;
 }
 const {data,error}=await client.rpc('run3_qa_device_rpc',args);
 if(error||!data||typeof data!=='object'||Array.isArray(data)||data.companyId!==body.companyId)
  throw Error('Device database authorization denied');
 return operation==='invite'?{...data,token}:data;
}
