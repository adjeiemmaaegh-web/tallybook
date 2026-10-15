/** Stage 9 server-side store/device authorization. Never import into the browser.
 * Grants come from a trusted transactional provider, not local IndexedDB,
 * localStorage, decoded JWT or the browser's selected company/store.
 * Call for each write; do not cache positive decisions across operations.
 */
const ID=/^[A-Za-z0-9:_-]{1,128}$/;
const allowedId=x=>typeof x==='string'&&ID.test(x);
const denied=()=>{throw Error('Store/device access is not authorized');};
const rights=Object.freeze({
 'store.read':new Set(['owner','attendant']),
 'store.sale':new Set(['owner','attendant']),
 'store.stock':new Set(['owner']),
 'store.transfer':new Set(['owner']),
 'store.manage':new Set(['owner']),
});
export function createStoreDeviceAuthorizer({resolveSession,readBoundary,clock=Date.now}){
 if(typeof resolveSession!=='function'||typeof readBoundary!=='function'||typeof clock!=='function')denied();
 return async function requireStoreDeviceAccess({session,companyId,storeId,deviceId,action}){
  if(!allowedId(companyId)||!allowedId(storeId)||!allowedId(deviceId)||
    !Object.hasOwn(rights,action))denied();
  const now=clock();
  if(!Number.isSafeInteger(now)||now<=0)denied();
  const principal=await resolveSession(session);
  if(!allowedId(principal?.userId)||principal?.active!==true)denied();
  // The repository must supply an authoritative database read whose isolation
  // is adequate for the intended write. Only the verified result is consumed.
  const boundary=await readBoundary({companyId,storeId,deviceId,userId:principal.userId,now});
  if(!boundary||boundary.companyId!==companyId||boundary.storeId!==storeId||
     boundary.deviceId!==deviceId||boundary.userId!==principal.userId||
     boundary.companyOwnerId==null||!allowedId(boundary.companyOwnerId)||
     boundary.membershipStatus!=='active'||boundary.storeStatus!=='active'||
     boundary.deviceStatus!=='active'||boundary.deviceUserId!==principal.userId||
     boundary.deviceCompanyId!==companyId||boundary.deviceStoreId!==storeId||
     !Number.isSafeInteger(boundary.deviceExpiresAt)||boundary.deviceExpiresAt<=now||
     !rights[action].has(boundary.role)||
     (boundary.role==='owner' && boundary.companyOwnerId!==principal.userId)||
     (boundary.role==='attendant' && boundary.companyOwnerId===principal.userId))denied();
  return Object.freeze({companyId,storeId,deviceId,userId:principal.userId,role:boundary.role,action,authorizedAt:now});
 };
}
