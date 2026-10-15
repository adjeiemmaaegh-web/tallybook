/** Transaction-bound Run 5 cloud authorization.
 * RLS protects database rows; this service additionally verifies a live
 * Supabase session and membership inside the same serializable transaction.
 * "execute" is a trusted server callback, never supplied from HTTP data.
 */
import {assertRun5TenantAccess} from './run5TenantPolicy.mjs';
const deny=()=>{throw Error('Cloud tenant authorization denied');};
export function createRun5TenantAuthorizer({resolveSession,store,clock=Date.now}={}){
  if(typeof resolveSession!=='function'||typeof store?.transaction!=='function'||
     typeof clock!=='function')deny();
  return Object.freeze({
    async authorize({accessToken,companyId,action},execute){
      if(typeof accessToken!=='string'||accessToken.length<20||accessToken.length>16384)
        deny();
      const principal=await resolveSession(accessToken);
      if(principal?.active!==true)deny();
      return store.transaction(async tx=>{
        if(typeof tx?.assertActiveSession!=='function'||
           typeof tx?.getCompany!=='function'||
           typeof tx?.getMembership!=='function')deny();
        const now=clock();
        if(!Number.isSafeInteger(now)||now<=0||
           now>=principal.expiresAtEpochMs)deny();
        if(await tx.assertActiveSession(principal.sessionId,principal.userId,now)!==true)deny();
        const company=await tx.getCompany(companyId);
        const membership=await tx.getMembership(companyId,principal.userId);
        const context=assertRun5TenantAccess({
          principal,company,membership,companyId,action,now
        });
        if(execute===undefined)return context;
        if(typeof execute!=='function')deny();
        return execute(tx,context);
      });
    }
  });
}
