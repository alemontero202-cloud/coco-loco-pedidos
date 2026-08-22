-- Cierra la ejecución anónima de RPC y resuelve índices/planes detectados por el asesor.

revoke execute on function public.create_order(jsonb, text, text, text, text, text, text, text) from anon;
revoke execute on function public.update_order_status(uuid, text, text) from anon;

drop policy if exists users_read_own_profile on public.profiles;
create policy users_read_own_profile on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select private.has_role(array['admin', 'manager'])));

drop policy if exists users_read_own_roles on public.user_roles;
create policy users_read_own_roles on public.user_roles for select to authenticated
  using (user_id = (select auth.uid()) or (select private.has_role(array['admin', 'manager'])));

create index if not exists orders_payment_method_id_idx on public.orders(payment_method_id);
create index if not exists orders_created_by_idx on public.orders(created_by);
create index if not exists order_status_history_from_status_id_idx on public.order_status_history(from_status_id);
create index if not exists order_status_history_to_status_id_idx on public.order_status_history(to_status_id);
create index if not exists order_status_history_changed_by_idx on public.order_status_history(changed_by);
