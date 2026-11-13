-- Online-account release proof: current authenticated JWT must still map to an
-- active Supabase auth.sessions row. This reads no business or customer records.
CREATE FUNCTION public.tallybook_active_session_proof()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $body$
DECLARE
  actor uuid := auth.uid();
  claims jsonb := auth.jwt();
  session_text text := claims->>'session_id';
  expiration_text text := claims->>'exp';
  session_id uuid;
  expiration_seconds bigint;
  checked_at timestamptz := clock_timestamp();
BEGIN
  IF actor IS NULL OR session_text IS NULL
     OR session_text !~ '^[0-9a-fA-F-]{36}$'
     OR expiration_text IS NULL OR expiration_text !~ '^[0-9]{10,12}$'
  THEN
    RAISE EXCEPTION 'Active account required' USING ERRCODE='42501';
  END IF;
  session_id := session_text::uuid;
  expiration_seconds := expiration_text::bigint;
  IF expiration_seconds <= floor(extract(epoch FROM checked_at))::bigint
     OR expiration_seconds > 253402300799
  THEN
    RAISE EXCEPTION 'Account token expired' USING ERRCODE='42501';
  END IF;
  PERFORM 1 FROM auth.sessions s
    WHERE s.id = session_id AND s.user_id = actor
      AND (s.not_after IS NULL OR s.not_after > checked_at)
    FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Account session inactive' USING ERRCODE='42501';
  END IF;
  RETURN jsonb_build_object(
    'active', true,
    'userId', actor::text,
    'expiresAtEpochMs', expiration_seconds * 1000
  );
END;
$body$;
REVOKE ALL ON FUNCTION public.tallybook_active_session_proof() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tallybook_active_session_proof() TO authenticated;