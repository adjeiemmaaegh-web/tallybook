/** Owner-confirmed, server-only local staff/shop binding. No public route. */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ID=/^[A-Za-z0-9:_-]{1,128}$/;
const denied=()=>{throw Error('Staff/shop provisioning denied');};

export function createUuidStaffShopProvisioningService({resolveSession,store,clock=Date.now}) {
  if(typeof resolveSession!=='function'||typeof store?.transaction!=='function'||
     typeof clock!=='function')denied();
  return Object.freeze({
    async provision({session,companyId,localCompanyId,storeId,staffId,targetUserId}) {
      if(!UUID.test(companyId??'')||!UUID.test(targetUserId??'')||
         ![localCompanyId,storeId,staffId].every(id=>typeof id==='string'&&ID.test(id)))denied();
      const principal=await resolveSession(session);
      const now=clock();
      if(principal?.active!==true||!UUID.test(principal.userId??'')||
         !UUID.test(principal.sessionId??'')||!Number.isSafeInteger(now)||now<=0||
         !Number.isSafeInteger(principal.expiresAtEpochMs)||principal.expiresAtEpochMs<=now)denied();
      return store.transaction(async tx=>{
        for(const method of ['assertActiveSession','getCompany','getBinding','getMembership',
          'getStore','insertStore','getStaff','insertStaff','getAssignment','insertAssignment','appendAudit'])
          if(typeof tx?.[method]!=='function')denied();
        if(await tx.assertActiveSession(principal.sessionId,principal.userId,now)!==true)denied();
        const [company,binding,owner,target]=await Promise.all([
          tx.getCompany(companyId),tx.getBinding(companyId),
          tx.getMembership(companyId,principal.userId),tx.getMembership(companyId,targetUserId),
        ]);
        if(company?.id!==companyId||company.ownerId!==principal.userId||
           binding?.companyId!==companyId||binding.localCompanyId!==localCompanyId||
           binding.ownerId!==principal.userId||owner?.role!=='owner'||
           owner.userId!==principal.userId||target?.userId!==targetUserId||
           !['owner','attendant'].includes(target.role))denied();
        let changed=false;
        const existingStore=await tx.getStore(companyId,storeId);
        if(existingStore){if(existingStore.status!=='active')denied();}
        else {await tx.insertStore(companyId,storeId);changed=true;}
        const existingStaff=await tx.getStaff(companyId,staffId,targetUserId);
        if(existingStaff){
          if(existingStaff.userId!==targetUserId||existingStaff.active!==true)denied();
        } else {await tx.insertStaff(companyId,staffId,targetUserId);changed=true;}
        const existingAssignment=await tx.getAssignment(companyId,storeId,staffId);
        if(existingAssignment){if(existingAssignment.active!==true)denied();}
        else {await tx.insertAssignment(companyId,storeId,staffId);changed=true;}
        if(changed)await tx.appendAudit({companyId,localCompanyId,storeId,staffId,
          targetUserId,actorId:principal.userId,at:now});
        return Object.freeze({companyId,localCompanyId,storeId,staffId,
          userId:targetUserId,status:'active'});
      });
    },
  });
}
