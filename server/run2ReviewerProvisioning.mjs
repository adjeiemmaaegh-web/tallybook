/** Privileged, out-of-band two-operator reviewer enrollment.
 * Not callable by public routes. No automatic first reviewer creation.
 */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fail=()=>{throw Error('Reviewer provisioning denied');};
export function createRun2ReviewerProvisioner({privatePool,verifyOperatorApprovals,clock=Date.now}){
  if(typeof privatePool?.connect!=='function'||typeof verifyOperatorApprovals!=='function')fail();
  return Object.freeze({
    async provision({reviewerId,operatorA,operatorB,approvalId,approvalDigest}){
      if(![reviewerId,operatorA,operatorB].every(x=>UUID.test(x??''))||
         reviewerId===operatorA||reviewerId===operatorB||operatorA===operatorB||
         typeof approvalId!=='string'||!UUID.test(approvalId)||
         !/^[a-f0-9]{64}$/.test(approvalDigest??''))fail();
      const decision=await verifyOperatorApprovals({reviewerId,operatorA,operatorB,
        approvalId,approvalDigest});
      const now=clock();
      if(decision!==true||!Number.isSafeInteger(now)||now<=0)fail();
      const client=await privatePool.connect();
      let began=false;
      try{
        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');began=true;
        const actors=await client.query('select id from auth.users where id=any($1::uuid[]) for share',
          [[reviewerId,operatorA,operatorB]]);
        if(actors.rows?.length!==3||
           new Set(actors.rows.map(x=>x.id)).size!==3)fail();
        const created=await client.query(`insert into public.company_recovery_reviewers
          (user_id,status,authorized_by,authorized_at) values ($1,'active',$2,
          to_timestamp($3::double precision/1000)) returning user_id`,
          [reviewerId,operatorA,now]);
        if(created.rowCount!==1)fail();
        const audit=await client.query(`insert into public.company_recovery_reviewer_approvals
          (id,reviewer_id,operator_a,operator_b,approval_digest,created_at)
          values ($1,$2,$3,$4,$5,to_timestamp($6::double precision/1000)) returning id`,
          [approvalId,reviewerId,operatorA,operatorB,approvalDigest,now]);
        if(audit.rowCount!==1)fail();
        await client.query('COMMIT');
        return Object.freeze({reviewerId,status:'active'});
      }catch(error){if(began)await client.query('ROLLBACK').catch(()=>{});throw error;}
      finally{client.release();}
    }
  });
}
