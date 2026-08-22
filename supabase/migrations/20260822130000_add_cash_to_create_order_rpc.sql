-- Sobrecarga compatible: conserva la RPC existente y permite registrar efectivo/vuelto.
create function public.create_order(
  p_items jsonb,
  p_payment_method_code text,
  p_notes text,
  p_customer_name text,
  p_customer_phone text,
  p_order_type text,
  p_table_number text,
  p_delivery_address text,
  p_cash_received numeric
)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
begin
  if p_payment_method_code = 'cash' and (p_cash_received is null or p_cash_received < 0) then
    raise exception 'Cash received is required for cash payments';
  end if;

  v_order := public.create_order(
    p_items, p_payment_method_code, p_notes, p_customer_name, p_customer_phone,
    p_order_type, p_table_number, p_delivery_address
  );

  if p_payment_method_code = 'cash' and p_cash_received < v_order.total then
    raise exception 'Cash received is less than the order total';
  end if;

  update public.orders
  set cash_received = case when p_payment_method_code = 'cash' then p_cash_received else 0 end,
      change_due = case when p_payment_method_code = 'cash' then p_cash_received - v_order.total else 0 end
  where id = v_order.id
  returning * into v_order;

  return v_order;
end;
$$;

revoke all on function public.create_order(jsonb, text, text, text, text, text, text, text, numeric) from public;
revoke execute on function public.create_order(jsonb, text, text, text, text, text, text, text, numeric) from anon;
grant execute on function public.create_order(jsonb, text, text, text, text, text, text, text, numeric) to authenticated;
