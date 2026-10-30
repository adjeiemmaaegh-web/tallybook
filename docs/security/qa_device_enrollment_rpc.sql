-- Isolated QA only. Service-role invocation after Edge Auth/proof verification.
-- Invoker security: browser roles have neither execution nor table privileges.
ALTER TABLE public.company_device_enrollment_invites ADD COLUMN IF NOT EXISTS redeemed_device_id text
 CHECK (redeemed_device_id IS NULL OR redeemed_device_id ~ '^[A-Za-z0-9:_-]{1,128}$');
GRANT USAGE ON SCHEMA auth TO service_role;
GRANT SELECT ON auth.sessions TO service_role;
-- PostgreSQL row locks require UPDATE privilege even when no update is issued.
GRANT UPDATE(id) ON auth.sessions TO service_role;
GRANT SELECT ON public.businesses,public.business_members,public.company_local_bindings TO service_role;
GRANT UPDATE(id) ON public.businesses TO service_role;
GRANT UPDATE(role) ON public.business_members TO service_role;
GRANT UPDATE(company_id) ON public.company_local_bindings TO service_role;
GRANT SELECT,INSERT,UPDATE ON public.company_store_scopes,public.company_staff_identities,
 public.company_staff_store_assignments,public.company_device_keys,public.company_device_grants,
 public.company_device_enrollment_invites,public.company_device_enrollment_audit,
 public.company_staff_store_binding_audit TO service_role;
GRANT USAGE ON SEQUENCE public.company_device_enrollment_audit_id_seq,
 public.company_staff_store_binding_audit_id_seq TO service_role;

CREATE OR REPLACE FUNCTION public.run3_qa_device_rpc(
 p_operation text,p_actor uuid,p_session uuid,p_company uuid,p_store text,
 p_local text DEFAULT NULL,p_target uuid DEFAULT NULL,p_staff text DEFAULT NULL,
 p_device text DEFAULT NULL,p_token_hash text DEFAULT NULL,p_key text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $body$
DECLARE
 at_time timestamptz:=clock_timestamp(); v_owner uuid; target_id uuid;
 invitation public.company_device_enrollment_invites%ROWTYPE;
 device_row public.company_device_keys%ROWTYPE;
 invitation_id uuid; grant_id uuid; staff_user uuid; active_flag boolean;
 store_status text; changed boolean:=false;
BEGIN
 IF p_operation IS NULL OR p_operation NOT IN ('provision','invite','redeem','revoke') OR
    p_actor IS NULL OR p_session IS NULL OR p_company IS NULL OR
    p_store IS NULL OR p_store !~ '^[A-Za-z0-9:_-]{1,128}$'
 THEN RAISE EXCEPTION 'Device action denied'; END IF;
 PERFORM 1 FROM auth.sessions s WHERE s.id=p_session AND s.user_id=p_actor
  AND (s.not_after IS NULL OR s.not_after>at_time) FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Active session required'; END IF;
 -- Serialize enrollment and membership mutations for this company.
 SELECT b.owner_id INTO v_owner FROM public.businesses b WHERE b.id=p_company FOR UPDATE;
 IF v_owner IS NULL THEN RAISE EXCEPTION 'Company unavailable'; END IF;
 PERFORM 1 FROM public.business_members m WHERE m.business_id=p_company
  AND m.user_id=v_owner AND m.role='owner' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Owner unavailable'; END IF;
 PERFORM 1 FROM public.business_members m WHERE m.business_id=p_company AND m.user_id=p_actor
  AND ((m.role='owner' AND p_actor=v_owner) OR (m.role='attendant' AND p_actor<>v_owner)) FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Membership required'; END IF;
 IF p_operation<>'redeem' AND p_actor<>v_owner THEN RAISE EXCEPTION 'Owner required'; END IF;

 IF p_operation='provision' THEN
  IF p_local IS NULL OR p_local !~ '^[A-Za-z0-9:_-]{1,128}$' OR
     p_staff IS NULL OR p_staff !~ '^[A-Za-z0-9:_-]{1,128}$' OR p_target IS NULL
  THEN RAISE EXCEPTION 'Binding invalid'; END IF;
  PERFORM 1 FROM public.company_local_bindings l WHERE l.company_id=p_company
    AND l.local_company_id=p_local AND l.owner_id=v_owner FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Verified local binding required'; END IF;
  PERFORM 1 FROM public.business_members m WHERE m.business_id=p_company AND m.user_id=p_target
    AND ((m.role='owner' AND p_target=v_owner) OR (m.role='attendant' AND p_target<>v_owner)) FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Target membership required'; END IF;
  SELECT s.status INTO store_status FROM public.company_store_scopes s
    WHERE s.company_id=p_company AND s.id=p_store FOR UPDATE;
  IF FOUND THEN
   IF store_status<>'active' THEN RAISE EXCEPTION 'Store revoked'; END IF;
  ELSE
   INSERT INTO public.company_store_scopes(company_id,id,status) VALUES(p_company,p_store,'active');
   changed:=true;
  END IF;
  SELECT s.user_id,s.active INTO staff_user,active_flag FROM public.company_staff_identities s
    WHERE s.company_id=p_company AND s.id=p_staff FOR UPDATE;
  IF FOUND THEN
   IF staff_user<>p_target OR active_flag IS NOT TRUE THEN RAISE EXCEPTION 'Staff binding conflict'; END IF;
  ELSE
   INSERT INTO public.company_staff_identities(company_id,id,user_id,active) VALUES(p_company,p_staff,p_target,true);
   changed:=true;
  END IF;
  SELECT a.active INTO active_flag FROM public.company_staff_store_assignments a
   WHERE a.company_id=p_company AND a.store_id=p_store AND a.staff_id=p_staff FOR UPDATE;
  IF FOUND THEN
   IF active_flag IS NOT TRUE THEN RAISE EXCEPTION 'Assignment revoked'; END IF;
  ELSE
   INSERT INTO public.company_staff_store_assignments(company_id,store_id,staff_id,active)
    VALUES(p_company,p_store,p_staff,true); changed:=true;
  END IF;
  IF changed THEN
   INSERT INTO public.company_staff_store_binding_audit
    (company_id,local_company_id,store_id,staff_id,target_user_id,actor_id,event_at)
    VALUES(p_company,p_local,p_store,p_staff,p_target,p_actor,at_time);
  END IF;
  RETURN jsonb_build_object('companyId',p_company,'localCompanyId',p_local,'storeId',p_store,
    'staffId',p_staff,'userId',p_target,'status','active');
 END IF;

 IF p_operation='revoke' THEN
  SELECT * INTO device_row FROM public.company_device_keys d WHERE d.company_id=p_company
   AND d.id=p_device AND d.store_id=p_store FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Device unavailable'; END IF;
  IF device_row.status='active' THEN
   UPDATE public.company_device_keys SET status='revoked' WHERE company_id=p_company AND id=p_device;
   INSERT INTO public.company_device_enrollment_audit
    (action,company_id,store_id,actor_id,target_user_id,event_at)
    VALUES('device.key.revoked',p_company,p_store,p_actor,device_row.user_id,at_time);
  END IF;
  RETURN jsonb_build_object('companyId',p_company,'deviceId',p_device,'revoked',true);
 END IF;
 IF p_token_hash IS NULL OR p_token_hash !~ '^[a-f0-9]{64}$'
 THEN RAISE EXCEPTION 'Invitation proof invalid'; END IF;
 target_id:=CASE WHEN p_operation='invite' THEN p_target ELSE p_actor END;
 PERFORM 1 FROM public.company_store_scopes s WHERE s.company_id=p_company AND s.id=p_store
  AND s.status='active' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Active store required'; END IF;
 PERFORM 1 FROM public.business_members m WHERE m.business_id=p_company AND m.user_id=target_id
  AND ((m.role='owner' AND target_id=v_owner) OR (m.role='attendant' AND target_id<>v_owner)) FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Target membership required'; END IF;
 PERFORM 1 FROM public.company_staff_identities s JOIN public.company_staff_store_assignments a
  ON a.company_id=s.company_id AND a.staff_id=s.id AND a.store_id=p_store AND a.active
  WHERE s.company_id=p_company AND s.user_id=target_id AND s.active
   AND (p_operation='invite' OR s.id=p_staff) FOR SHARE OF s,a;
 IF NOT FOUND THEN RAISE EXCEPTION 'Active staff assignment required'; END IF;
 IF p_operation='invite' THEN
  IF (SELECT count(*) FROM public.company_device_enrollment_invites i WHERE i.company_id=p_company
    AND i.target_user_id=p_target AND i.status='unused' AND i.expires_at>at_time)>=5
  THEN RAISE EXCEPTION 'Pending invitation limit reached'; END IF;
  invitation_id:=gen_random_uuid();
  INSERT INTO public.company_device_enrollment_invites
   (id,company_id,store_id,target_user_id,issued_by,token_digest,status,created_at,expires_at)
   VALUES(invitation_id,p_company,p_store,p_target,p_actor,p_token_hash,'unused',at_time,at_time+interval '10 minutes');
  INSERT INTO public.company_device_enrollment_audit
   (action,company_id,store_id,actor_id,target_user_id,invite_id,event_at)
   VALUES('device.invite.issued',p_company,p_store,p_actor,p_target,invitation_id,at_time);
  RETURN jsonb_build_object('companyId',p_company,'storeId',p_store,'targetUserId',p_target,
   'inviteId',invitation_id,'expiresAt',floor(extract(epoch from at_time+interval '10 minutes')*1000));
 END IF;
 -- Edge verifies Ed25519 possession before calling this service-only branch.
 IF p_device IS NULL OR p_device !~ '^[A-Za-z0-9:_-]{1,128}$' OR
    p_key IS NULL OR char_length(p_key) NOT BETWEEN 80 AND 500
 THEN RAISE EXCEPTION 'Device key invalid'; END IF;
 SELECT * INTO invitation FROM public.company_device_enrollment_invites i
  WHERE i.token_digest=p_token_hash FOR UPDATE;
 IF NOT FOUND OR invitation.company_id<>p_company OR invitation.store_id<>p_store OR
    invitation.target_user_id<>p_actor OR invitation.issued_by<>v_owner OR
    invitation.status NOT IN ('unused','used') OR invitation.expires_at<=at_time
 THEN RAISE EXCEPTION 'Invitation unavailable'; END IF;
 -- Recover a lost response only for the identical active key. Never renew the
 -- grant, consume a different invitation, or resurrect revoked authority.
 IF invitation.status='used' THEN
  IF invitation.redeemed_device_id IS DISTINCT FROM p_device THEN RAISE EXCEPTION 'Enrollment retry differs'; END IF;
  PERFORM 1 FROM public.company_device_keys d WHERE d.company_id=p_company AND d.id=p_device
   AND d.store_id=p_store AND d.user_id=p_actor AND d.staff_id=p_staff
   AND d.public_key_spki_pem=p_key AND d.status='active' AND d.approved_by=v_owner
   AND EXISTS(SELECT 1 FROM public.company_device_grants g WHERE g.company_id=p_company
    AND g.store_id=p_store AND g.user_id=p_actor AND g.status='active' AND g.expires_at>at_time)
   FOR SHARE OF d;
  IF NOT FOUND THEN RAISE EXCEPTION 'Enrollment retry differs or authority revoked'; END IF;
  RETURN jsonb_build_object('companyId',p_company,'storeId',p_store,'userId',p_actor,
   'staffId',p_staff,'deviceId',p_device,'publicKeyBound',true,'hardwareBound',false);
 END IF;
 INSERT INTO public.company_device_keys
  (company_id,id,store_id,user_id,staff_id,public_key_spki_pem,status,approved_by,approved_at)
  VALUES(p_company,p_device,p_store,p_actor,p_staff,p_key,'active',v_owner,at_time);
 grant_id:=gen_random_uuid();
 INSERT INTO public.company_device_grants(id,company_id,store_id,user_id,status,created_at,expires_at)
  VALUES(grant_id,p_company,p_store,p_actor,'active',at_time,at_time+interval '8 hours');
 UPDATE public.company_device_enrollment_invites SET status='used',redeemed_device_id=p_device WHERE id=invitation.id;
 INSERT INTO public.company_device_enrollment_audit
  (action,company_id,store_id,actor_id,target_user_id,grant_id,invite_id,event_at)
  VALUES('device.key.enrolled',p_company,p_store,p_actor,p_actor,NULL,invitation.id,at_time),
   ('device.grant.issued',p_company,p_store,p_actor,p_actor,grant_id,invitation.id,at_time);
 RETURN jsonb_build_object('companyId',p_company,'storeId',p_store,'userId',p_actor,
  'staffId',p_staff,'deviceId',p_device,'publicKeyBound',true,'hardwareBound',false);
END $body$;
REVOKE ALL ON FUNCTION public.run3_qa_device_rpc(text,uuid,uuid,uuid,text,text,uuid,text,text,text,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.run3_qa_device_rpc(text,uuid,uuid,uuid,text,text,uuid,text,text,text,text)
 TO service_role;
