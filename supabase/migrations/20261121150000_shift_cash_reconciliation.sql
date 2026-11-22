-- Issue #68 / ST25-05: server-computed shift cash reconciliation (READ ONLY). DEVELOPMENT ONLY: NOT applied to any hosted database.
-- Expected drawer cash = opening cash + cash tenders of this cashier's sales in this store during the shift
--                       + cash customer repayments taken by this cashier in this store during the shift
--                       - cash refunds issued by this cashier on sales of this store during the shift.
-- The server-recorded time is used (device clocks are not trusted). A declared closing figure is only a declaration;
-- the variance is declared - expected and is evidence for the owner, never an automatic ledger entry.
BEGIN;
CREATE FUNCTION private.shop_shift_reconciliation(p_action text,p_actor uuid,p_session uuid,p_input jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE
 v_company uuid; v_role text; v_shift public.shop_staff_shifts; v_end timestamptz;
 v_sales bigint; v_repay bigint; v_refunds bigint; v_expected bigint; v_late integer; v_late_minor bigint;
BEGIN
 IF jsonb_typeof(p_input) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Valid request required' USING ERRCODE='22023'; END IF;
 v_company:=private.shop_uuid(p_input,'companyId');
 v_role:=private.shop_member_role(p_actor,p_session,v_company);
 IF p_action NOT IN ('reconcileShift','abandonedShifts') THEN RAISE EXCEPTION 'Unknown shift action' USING ERRCODE='22023'; END IF;

 IF p_action='abandonedShifts' THEN
  IF v_role<>'owner' THEN RAISE EXCEPTION 'Only the business owner can list abandoned shifts' USING ERRCODE='42501'; END IF;
  RETURN jsonb_build_object('shifts',COALESCE((SELECT jsonb_agg(jsonb_build_object('shiftId',s.id,'storeId',s.store_id,'staffId',s.staff_id,
     'openedAt',s.opened_at,'openHours',round(extract(epoch FROM (clock_timestamp()-s.opened_at))/3600.0,1)) ORDER BY s.opened_at,s.id)
    FROM public.shop_staff_shifts s WHERE s.business_id=v_company AND s.closed_at IS NULL AND s.opened_at<clock_timestamp()-interval '16 hours'),'[]'::jsonb),
   'thresholdHours',16);
 END IF;

 SELECT * INTO v_shift FROM public.shop_staff_shifts WHERE business_id=v_company AND id=private.shop_uuid(p_input,'shiftId');
 IF NOT FOUND OR (v_role<>'owner' AND v_shift.staff_id<>p_actor) THEN RAISE EXCEPTION 'Shift does not exist' USING ERRCODE='42501'; END IF;
 v_end:=COALESCE(v_shift.closed_at,clock_timestamp());

 SELECT COALESCE(sum(t.amount_minor),0) INTO v_sales FROM public.shop_sales s JOIN public.shop_sale_tenders t ON t.sale_id=s.id AND t.business_id=s.business_id
  WHERE s.business_id=v_company AND s.cashier_id=v_shift.staff_id AND s.store_id=v_shift.store_id AND t.method='cash'
    AND s.recorded_at>=v_shift.opened_at AND s.recorded_at<=v_end;
 SELECT COALESCE(sum(-e.amount_minor),0) INTO v_repay FROM public.shop_customer_entries e
  WHERE e.business_id=v_company AND e.kind='repayment' AND e.method='cash' AND e.actor_id=v_shift.staff_id AND e.store_id=v_shift.store_id
    AND e.recorded_at>=v_shift.opened_at AND e.recorded_at<=v_end;
 SELECT COALESCE(sum(r.amount_minor),0) INTO v_refunds FROM public.shop_refunds r JOIN public.shop_sales s ON s.id=r.sale_id AND s.business_id=r.business_id
  WHERE r.business_id=v_company AND r.method='cash' AND r.actor_id=v_shift.staff_id AND s.store_id=v_shift.store_id
    AND r.recorded_at>=v_shift.opened_at AND r.recorded_at<=v_end;
 v_expected:=v_shift.opening_cash_minor+v_sales+v_repay-v_refunds;

 -- Offline replay: a cash sale the device says happened inside the shift but the server received only after it closed.
 SELECT count(*)::int,COALESCE(sum(t.amount_minor),0) INTO v_late,v_late_minor
  FROM public.shop_sales s JOIN public.shop_sale_tenders t ON t.sale_id=s.id AND t.business_id=s.business_id
  WHERE v_shift.closed_at IS NOT NULL AND s.business_id=v_company AND s.cashier_id=v_shift.staff_id AND s.store_id=v_shift.store_id AND t.method='cash'
    AND s.recorded_at>v_shift.closed_at AND s.client_recorded_at>=v_shift.opened_at AND s.client_recorded_at<=v_shift.closed_at;

 RETURN jsonb_build_object('shiftId',v_shift.id,'state',CASE WHEN v_shift.closed_at IS NULL THEN 'open' ELSE 'closed' END,
  'openingCashMinor',v_shift.opening_cash_minor::text,'cashSalesMinor',v_sales::text,'cashRepaymentsMinor',v_repay::text,
  'cashRefundsMinor',v_refunds::text,'expectedCashMinor',v_expected::text,
  'declaredClosingCashMinor',v_shift.closing_cash_minor::text,
  'varianceMinor',CASE WHEN v_shift.closed_at IS NULL THEN NULL ELSE (v_shift.closing_cash_minor-v_expected)::text END,
  'lateReplayedCashSales',v_late,'lateReplayedCashSalesMinor',v_late_minor::text,
  'needsAttention',v_shift.closed_at IS NOT NULL AND (v_shift.closing_cash_minor<>v_expected OR v_late>0),
  'excludes',jsonb_build_array('supplier payments in cash','paid-outs and petty cash','cash movements not recorded in the shared ledger','mobile-money or card takings'));
END $fn$;
REVOKE ALL ON FUNCTION private.shop_shift_reconciliation(text,uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.tallybook_shop_shift_reconciliation(p_action text,p_input jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE actor uuid:=auth.uid();sid uuid;
BEGIN
 BEGIN sid:=(auth.jwt()->>'session_id')::uuid; EXCEPTION WHEN others THEN sid:=null; END;
 RETURN private.shop_shift_reconciliation(p_action,actor,sid,p_input);
END $fn$;
REVOKE ALL ON FUNCTION public.tallybook_shop_shift_reconciliation(text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.tallybook_shop_shift_reconciliation(text,jsonb) TO authenticated;
COMMIT;
