-- Removes the Connected Commerce platform foundation ONLY while it holds no evidence.
-- Consent events, audit events, operation keys and outbox rows are legal/audit evidence: once any exist,
-- dropping them is unsafe, so this script fails closed. Use a reviewed forward corrective migration instead
-- (disable every track via the kill switch, then repair), never a destructive rollback.
BEGIN;
DO $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.cc_consent_events)
    OR EXISTS(SELECT 1 FROM public.cc_audit_events)
    OR EXISTS(SELECT 1 FROM public.cc_outbox)
    OR EXISTS(SELECT 1 FROM public.cc_operation_keys)
    OR EXISTS(SELECT 1 FROM public.cc_merchant_verification) THEN
  RAISE EXCEPTION 'Connected Commerce evidence exists; use a forward repair, not a rollback';
 END IF;
END $$;
DROP FUNCTION public.tallybook_cc_platform(text,jsonb);
DROP FUNCTION private.cc_platform_action(text,uuid,uuid,jsonb);
DROP FUNCTION private.cc_status(uuid);
DROP FUNCTION private.cc_track_enabled(uuid,text);
DROP FUNCTION private.cc_track_state(uuid,text);
DROP FUNCTION private.cc_emit(uuid,text,jsonb);
DROP FUNCTION private.cc_verification_label(text);
DROP TABLE public.cc_audit_events,public.cc_outbox,public.cc_operation_keys,public.cc_merchant_verification,
 public.cc_consent_events,public.cc_merchant_flags,public.cc_platform_kill_switch,public.cc_consent_versions;
DROP FUNCTION private.cc_payload_safe(jsonb);
DROP FUNCTION private.cc_append_only();
COMMIT;
