-- Isolated QA follow-up. Apply after V49. Preserves all membership and invitation rows.
CREATE OR REPLACE FUNCTION public.run3_qa_membership_rpc(
 p_operation text,
 p_actor uuid,
 p_session uuid,
 p_company uuid DEFAULT NULL,
 p_target uuid DEFAULT NULL,
 p_token_hash text DEFAULT NULL,
 p_invitation uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE
 at_time timestamptz := clock_timestamp();
 active_owner uuid;
 actor_role text;
 target_role text;
 invite_row record;
 new_invitation uuid;
 v_company_id uuid;
 members_json jsonb;
BEGIN
 IF p_actor IS NULL OR p_session IS NULL OR p_operation NOT IN
   ('invite','accept','revokeMember','revokeInvite','listMembers')
 THEN RAISE EXCEPTION 'Membership action denied' USING ERRCODE='42501'; END IF;
 -- A validated JWT by itself is insufficient after logout/revocation.
 PERFORM 1 FROM auth.sessions s
  WHERE s.id=p_session AND s.user_id=p_actor
   AND (s.not_after IS NULL OR s.not_after>at_time)
  FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Active Auth session required' USING ERRCODE='42501'; END IF;

 IF p_operation='accept' THEN
   IF p_token_hash IS NULL OR p_token_hash !~ '^[a-f0-9]{64}$'
   THEN RAISE EXCEPTION 'Invitation proof invalid' USING ERRCODE='42501'; END IF;
   SELECT * INTO invite_row FROM public.company_member_invites
     WHERE token_sha256=p_token_hash FOR UPDATE;
   IF NOT FOUND OR invite_row.status<>'pending'
      OR invite_row.target_user_id<>p_actor OR invite_row.expires_at<=at_time
   THEN RAISE EXCEPTION 'Invitation unavailable' USING ERRCODE='42501'; END IF;
   v_company_id:=invite_row.company_id;
 ELSE
   IF p_company IS NULL THEN RAISE EXCEPTION 'Company required' USING ERRCODE='42501'; END IF;
   v_company_id:=p_company;
 END IF;

 -- Lock the company row to serialize owner invitations and membership removal.
 SELECT b.owner_id INTO active_owner FROM public.businesses b
   WHERE b.id=v_company_id FOR UPDATE;
 IF active_owner IS NULL THEN RAISE EXCEPTION 'Unknown company' USING ERRCODE='42501'; END IF;
 SELECT m.role INTO actor_role FROM public.business_members m
   WHERE m.business_id=v_company_id AND m.user_id=p_actor FOR UPDATE;

 IF p_operation='accept' THEN
   IF p_actor=active_owner OR actor_role IS NOT NULL
   THEN RAISE EXCEPTION 'Recipient is already a member' USING ERRCODE='42501'; END IF;
   IF invite_row.invited_by<>active_owner OR NOT EXISTS (
     SELECT 1 FROM public.business_members m WHERE m.business_id=v_company_id
       AND m.user_id=active_owner AND m.role='owner')
   THEN RAISE EXCEPTION 'Owner no longer authorized' USING ERRCODE='42501'; END IF;
   INSERT INTO public.business_members(business_id,user_id,role)
     VALUES(v_company_id,p_actor,'attendant');
   UPDATE public.company_member_invites
     SET status='accepted',closed_at=at_time WHERE id=invite_row.id AND status='pending';
   INSERT INTO public.company_membership_audit
     (company_id,actor_id,target_user_id,event_type,invitation_id,event_at)
     VALUES(v_company_id,p_actor,p_actor,'accepted',invite_row.id,at_time);
   RETURN jsonb_build_object('companyId',v_company_id,'userId',p_actor,'role','attendant');
 END IF;

 IF active_owner<>p_actor OR actor_role<>'owner'
 THEN RAISE EXCEPTION 'Owner-only membership action' USING ERRCODE='42501'; END IF;

 IF p_operation='listMembers' THEN
   SELECT coalesce(jsonb_agg(jsonb_build_object('companyId',v_company_id,
     'userId',x.user_id,'role',x.role,'status','active')),'[]'::jsonb)
     INTO members_json
     FROM (SELECT user_id,role FROM public.business_members
       WHERE business_id=v_company_id ORDER BY user_id LIMIT 101) x;
   IF jsonb_array_length(members_json)>100
   THEN RAISE EXCEPTION 'Membership list limit exceeded'; END IF;
   RETURN jsonb_build_object('companyId',v_company_id,'members',members_json);
 END IF;

 IF p_operation='invite' THEN
   IF p_target IS NULL OR p_target=p_actor OR p_token_hash IS NULL
      OR p_token_hash !~ '^[a-f0-9]{64}$'
   THEN RAISE EXCEPTION 'Invalid target/proof' USING ERRCODE='42501'; END IF;
   IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_target)
      OR EXISTS(SELECT 1 FROM public.business_members
         WHERE business_id=v_company_id AND user_id=p_target)
      OR EXISTS(SELECT 1 FROM public.company_member_invites
         WHERE company_id=v_company_id AND target_user_id=p_target
           AND status='pending' AND expires_at>at_time)
   THEN RAISE EXCEPTION 'Target unavailable' USING ERRCODE='42501'; END IF;
   new_invitation:=gen_random_uuid();
   INSERT INTO public.company_member_invites
    (id,company_id,invited_by,target_user_id,token_sha256,status,created_at,expires_at)
    VALUES(new_invitation,v_company_id,p_actor,p_target,p_token_hash,'pending',
           at_time,at_time+interval '15 minutes');
   INSERT INTO public.company_membership_audit
    (company_id,actor_id,target_user_id,event_type,invitation_id,event_at)
    VALUES(v_company_id,p_actor,p_target,'invited',new_invitation,at_time);
   RETURN jsonb_build_object('companyId',v_company_id,'targetUserId',p_target,
     'invitationId',new_invitation,
     'expiresAtEpochMs',floor(extract(epoch FROM at_time+interval '15 minutes')*1000)::bigint);
 END IF;

 IF p_operation='revokeInvite' THEN
   IF p_invitation IS NULL THEN RAISE EXCEPTION 'Invitation required' USING ERRCODE='42501'; END IF;
   SELECT * INTO invite_row FROM public.company_member_invites
     WHERE id=p_invitation AND company_id=v_company_id FOR UPDATE;
   IF NOT FOUND OR invite_row.status<>'pending'
   THEN RAISE EXCEPTION 'Invitation unavailable' USING ERRCODE='42501'; END IF;
   UPDATE public.company_member_invites SET status='revoked',closed_at=at_time
     WHERE id=p_invitation AND status='pending';
   INSERT INTO public.company_membership_audit
    (company_id,actor_id,target_user_id,event_type,invitation_id,event_at)
    VALUES(v_company_id,p_actor,invite_row.target_user_id,'invite-revoked',p_invitation,at_time);
   RETURN jsonb_build_object('invitationId',p_invitation,'revoked',true);
 END IF;

 IF p_operation='revokeMember' THEN
   IF p_target IS NULL OR p_target=p_actor
   THEN RAISE EXCEPTION 'Cannot revoke owner/self' USING ERRCODE='42501'; END IF;
   SELECT m.role INTO target_role FROM public.business_members m
     WHERE business_id=v_company_id AND user_id=p_target FOR UPDATE;
   IF target_role<>'attendant' OR target_role IS NULL
   THEN RAISE EXCEPTION 'No active attendant' USING ERRCODE='42501'; END IF;
   -- Refuse unsafe partial revocation while device/staff grants still refer to the account.
   IF EXISTS(SELECT 1 FROM public.company_device_keys k
      WHERE k.company_id=v_company_id AND k.user_id=p_target AND k.status='active')
      OR EXISTS(SELECT 1 FROM public.company_staff_identities s
        WHERE s.company_id=v_company_id AND s.user_id=p_target AND s.active)
   THEN RAISE EXCEPTION 'Active device/staff bindings require separate revocation'
      USING ERRCODE='42501'; END IF;
   -- Delete may fail on remaining foreign keys; transaction rollback is intentional.
   DELETE FROM public.business_members WHERE business_id=v_company_id
     AND user_id=p_target AND role='attendant';
   UPDATE public.company_member_invites SET status='revoked',closed_at=at_time
     WHERE company_id=v_company_id AND target_user_id=p_target AND status='pending';
   INSERT INTO public.company_membership_audit
    (company_id,actor_id,target_user_id,event_type,invitation_id,event_at)
    VALUES(v_company_id,p_actor,p_target,'member-revoked',NULL,at_time);
   RETURN jsonb_build_object('companyId',v_company_id,'targetUserId',p_target,'revoked',true);
 END IF;
 RAISE EXCEPTION 'Unrecognized action' USING ERRCODE='42501';
END $function$;

-- This is intentionally an exposed-schema RPC accessible ONLY to trusted
-- server-side service_role, not the browser roles, and scoped to QA project.
REVOKE ALL ON FUNCTION public.run3_qa_membership_rpc(
 text,uuid,uuid,uuid,uuid,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.run3_qa_membership_rpc(
 text,uuid,uuid,uuid,uuid,text,uuid) TO service_role;


