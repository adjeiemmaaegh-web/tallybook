-- Fails closed once any payment intent or event exists (financial evidence). Use a forward repair instead.
BEGIN;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.payment_intents) OR EXISTS(SELECT 1 FROM public.payment_events) THEN
  RAISE EXCEPTION 'Payment ledger evidence exists; use a forward repair, not a rollback'; END IF;
END $$;
DROP FUNCTION public.tallybook_payment_status(jsonb);
DROP FUNCTION public.tallybook_payment_ledger(text,jsonb);
DROP FUNCTION private.payment_action(text,jsonb);
DROP FUNCTION private.payment_next(text,bigint,bigint,bigint,bigint,text,bigint);
DROP TABLE public.payment_events,public.payment_intents;
DROP FUNCTION private.payment_intent_guard();
DROP FUNCTION private.payment_append_only();
COMMIT;
