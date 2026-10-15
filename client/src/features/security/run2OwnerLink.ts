/** Explicit opt-in company-link request. Never modifies IndexedDB or roles. */
import {prepareOfflineBindingReview, type OfflineCompanyCandidate} from './offlineBindingReview';
import {parseBackup, stringifyBackup, type TallybookBackup} from '@/features/backup/backup';

export interface Run2OwnerLinkRequest {
  companies: readonly OfflineCompanyCandidate[];
  localCompanyId: string;
  exactTypedCompanyName: string;
  verifiedAccountUserId: string;
  cloudCompanyId: string;
  recoveryApprovalId: string;
  accessToken: string;
  backup: TallybookBackup;
  ownerConfirmed: true;
}
export async function requestRun2OwnerLink(input:Run2OwnerLinkRequest):Promise<{
  companyId:string;localCompanyId:string;bindingCreated:true;cloudAccessGranted:false;
}>{
  if(input.ownerConfirmed!==true)throw Error('Owner confirmation required.');
  const reviewed=prepareOfflineBindingReview(input.companies,input.localCompanyId,
    input.verifiedAccountUserId,input.exactTypedCompanyName);
  const backup=parseBackup(stringifyBackup(input.backup));
  if(backup.records.businessProfiles[0]?.id!==reviewed.companyId||
     !input.cloudCompanyId?.trim()||!input.recoveryApprovalId?.trim()||
     !input.accessToken||input.accessToken.length>16384)
    throw Error('Verified company backup and recovery approval are required.');
  // The authenticated owner and independently approved restore are
  // revalidated on the backend. Never trust a local email/company selector.
  if(typeof window==='undefined'||window.location.protocol!=='https:')
    throw Error('Secure online connection required for company linking.');
  const response=await fetch('/api/run2/ownership/bind',{
    method:'POST',
    credentials:'omit',
    headers:{'Content-Type':'application/json',
      Authorization:'Bearer '+input.accessToken},
    body:JSON.stringify({cloudCompanyId:input.cloudCompanyId,
      localCompanyId:reviewed.companyId,recoveryId:input.recoveryApprovalId})
  });
  if(!response.ok)throw Error('The owner-approved company link was not authorized.');
  const result:unknown=await response.json();
  if(!result||typeof result!=='object')throw Error('Invalid company-link receipt.');
  const r=result as Record<string,unknown>;
  if(r.companyId!==input.cloudCompanyId||r.localCompanyId!==reviewed.companyId||
     r.userId!==input.verifiedAccountUserId||r.bindingCreated!==true||
     r.cloudAccessGranted!==false)
    throw Error('Company-link receipt does not match the confirmed owner.');
  return {companyId:input.cloudCompanyId,localCompanyId:reviewed.companyId,
    bindingCreated:true,cloudAccessGranted:false};
}
