-- Keep device/order RPCs available to anonymous-authenticated users,
-- but not to the unauthenticated anon role.
-- signInAnonymously() receives the authenticated Postgres role.
revoke execute on function public.claim_device_role(text,text) from anon;
revoke execute on function public.staff_get_identity() from anon;
revoke execute on function public.staff_load_catalog() from anon;
revoke execute on function public.create_order(jsonb,text,text,numeric) from anon;
revoke execute on function public.create_order(jsonb,text,text,text,text,text,text,text) from anon;
revoke execute on function public.create_order(jsonb,text,text,text,text,text,text,text,numeric) from anon;
revoke execute on function public.update_order_status(uuid,text) from anon;
revoke execute on function public.update_order_status(uuid,text,text) from anon;
revoke execute on function public.close_cash_register(date,text) from anon;

grant execute on function public.claim_device_role(text,text) to authenticated;
grant execute on function public.staff_get_identity() to authenticated;
grant execute on function public.staff_load_catalog() to authenticated;
grant execute on function public.create_order(jsonb,text,text,numeric) to authenticated;
grant execute on function public.create_order(jsonb,text,text,text,text,text,text,text) to authenticated;
grant execute on function public.create_order(jsonb,text,text,text,text,text,text,text,numeric) to authenticated;
grant execute on function public.update_order_status(uuid,text) to authenticated;
grant execute on function public.update_order_status(uuid,text,text) to authenticated;
grant execute on function public.close_cash_register(date,text) to authenticated;
