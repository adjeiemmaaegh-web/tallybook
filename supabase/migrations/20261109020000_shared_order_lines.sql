begin;

create function public.tallybook_shop_order_lines(p_action text, p_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  company uuid := private.shop_uuid(p_input, 'companyId');
  order_id_input uuid := private.shop_uuid(p_input, 'orderId');
  session_id uuid := (auth.jwt()->>'session_id')::uuid;
begin
  if p_action is distinct from 'orderLines' or
     private.shop_member_role(auth.uid(), session_id, company) is distinct from 'owner' then
    raise exception 'Only the owner may review online order items' using errcode='42501';
  end if;
  if not exists (select 1 from public.shop_online_orders o where o.business_id=company and o.id=order_id_input) then
    raise exception 'Order unavailable for this business' using errcode='42501';
  end if;
  return jsonb_build_object('lines', (
    select jsonb_agg(jsonb_build_object(
      'productId', l.product_id, 'name', l.product_name, 'quantity', l.quantity,
      'unitPriceMinor', l.quoted_unit_price_minor) order by l.line_no)
    from public.shop_online_order_lines l where l.business_id=company and l.order_id=order_id_input
  ));
end;
$$;
revoke all on function public.tallybook_shop_order_lines(text,jsonb) from public, anon;
grant execute on function public.tallybook_shop_order_lines(text,jsonb) to authenticated;

commit;
