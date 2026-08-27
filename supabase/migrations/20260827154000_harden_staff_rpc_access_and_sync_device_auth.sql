-- Coco Loco: sincroniza en Git la capa RPC de autenticación/operación
-- y evita que funciones SECURITY DEFINER hereden EXECUTE de PUBLIC.
-- Los usuarios anónimos de Supabase reciben el rol PostgreSQL authenticated,
-- por lo que el flujo de Caja/Cocina continúa funcionando.

revoke execute on function public.staff_get_identity() from public, anon;
revoke execute on function public.staff_load_catalog() from public, anon;
revoke execute on function public.claim_device_role(text, text) from public, anon;
revoke execute on function public.update_order_status(uuid, text) from public, anon;
revoke execute on function public.update_order_status(uuid, text, text) from public, anon;
revoke execute on function public.close_cash_register(date, text) from public, anon;

grant execute on function public.staff_get_identity() to authenticated;
grant execute on function public.staff_load_catalog() to authenticated;
grant execute on function public.claim_device_role(text, text) to authenticated;
grant execute on function public.update_order_status(uuid, text) to authenticated;
grant execute on function public.update_order_status(uuid, text, text) to authenticated;

-- El cliente móvil llama a esta firma corta para registrar efectivo y vuelto.
-- Se mantiene la función completa existente para futuras modalidades de pedido.
drop function if exists public.create_order(jsonb, text, text, numeric);
create function public.create_order(
  p_items jsonb,
  p_payment_method_code text,
  p_notes text,
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
  if not private.has_role(array['admin', 'manager', 'cashier']) then
    raise exception 'Not authorized to create orders';
  end if;

  if p_payment_method_code = 'cash' and (p_cash_received is null or p_cash_received < 0) then
    raise exception 'Cash received is required for cash payments';
  end if;

  v_order := public.create_order(
    p_items,
    p_payment_method_code,
    p_notes,
    null,
    null,
    'counter',
    null,
    null
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

revoke all on function public.create_order(jsonb, text, text, numeric) from public, anon;
grant execute on function public.create_order(jsonb, text, text, numeric) to authenticated;

-- Las firmas largas también quedan protegidas contra EXECUTE heredado de PUBLIC.
revoke execute on function public.create_order(jsonb, text, text, text, text, text, text, text) from public, anon;
revoke execute on function public.create_order(jsonb, text, text, text, text, text, text, text, numeric) from public, anon;
grant execute on function public.create_order(jsonb, text, text, text, text, text, text, text) to authenticated;
grant execute on function public.create_order(jsonb, text, text, text, text, text, text, text, numeric) to authenticated;
