-- Coco Loco: reparación definitiva del acceso inicial de dispositivos.
-- El flujo de Caja/Cocina usa signInAnonymously(), cuyo JWT opera con rol
-- authenticated en Supabase. Se mantienen los RPC disponibles para ese rol
-- y se habilitan también para anon para evitar fallos según el modo de sesión.

grant execute on function public.claim_device_role(text,text) to anon, authenticated;
grant execute on function public.staff_get_identity() to anon, authenticated;
grant execute on function public.staff_load_catalog() to anon, authenticated;
grant execute on function public.update_order_status(uuid,text) to authenticated;
grant execute on function public.create_order(jsonb,text,text,numeric) to authenticated;

-- Garantiza que la identidad recién asignada pueda ser consultada inmediatamente.
create or replace function public.claim_device_role(
  p_role text,
  p_display_name text default null
)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_profile public.profiles;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_role not in ('cashier','kitchen') then raise exception 'Invalid device role'; end if;

  insert into public.profiles(id, display_name, active)
  values (
    v_user,
    coalesce(nullif(trim(p_display_name), ''), case when p_role='cashier' then 'Caja' else 'Cocina' end),
    true
  )
  on conflict (id) do update
    set display_name = coalesce(nullif(trim(excluded.display_name),''), public.profiles.display_name),
        active = true,
        updated_at = now();

  delete from public.user_roles
   where user_id = v_user
     and role in ('cashier','kitchen')
     and role <> p_role;

  insert into public.user_roles(user_id, role, active)
  values (v_user, p_role, true)
  on conflict (user_id, role) do update
    set active = true, assigned_at = now();

  select * into v_profile from public.profiles where id = v_user;
  return v_profile;
end;
$$;

grant execute on function public.claim_device_role(text,text) to anon, authenticated;
