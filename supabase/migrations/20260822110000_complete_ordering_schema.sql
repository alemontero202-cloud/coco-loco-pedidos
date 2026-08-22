-- Coco Loco Pedidos: esquema aditivo de operación y seguridad.
-- No elimina datos ni objetos existentes.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  description text,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint categories_name_not_blank check (length(trim(name)) > 0),
  constraint categories_code_format check (code ~ '^[a-z0-9_-]+$')
);

create table if not exists public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint payment_methods_code_format check (code ~ '^[a-z0-9_-]+$'),
  constraint payment_methods_name_not_blank check (length(trim(name)) > 0)
);

create table if not exists public.order_statuses (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  sort_order integer not null unique,
  is_terminal boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint order_statuses_code_format check (code ~ '^[a-z0-9_-]+$'),
  constraint order_statuses_name_not_blank check (length(trim(name)) > 0)
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_roles (
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('admin', 'manager', 'cashier', 'kitchen')),
  active boolean not null default true,
  assigned_at timestamptz not null default now(),
  primary key (user_id, role)
);

insert into public.payment_methods (code, name, sort_order)
values ('cash', 'Efectivo', 1), ('yape', 'Yape', 2)
on conflict (code) do nothing;

insert into public.order_statuses (code, name, sort_order, is_terminal)
values
  ('new', 'Nuevo', 1, false),
  ('preparing', 'En preparación', 2, false),
  ('ready', 'Listo', 3, false),
  ('delivered', 'Entregado', 4, true),
  ('cancelled', 'Cancelado', 5, true)
on conflict (code) do nothing;

insert into public.categories (name, code, sort_order)
select distinct trim(p.category), lower(regexp_replace(trim(p.category), '[^a-zA-Z0-9]+', '-', 'g')), 0
from public.products p
where nullif(trim(p.category), '') is not null
on conflict (code) do nothing;

alter table public.products
  add column if not exists category_id uuid references public.categories(id),
  add column if not exists description text,
  add column if not exists updated_at timestamptz not null default now();

update public.products p
set category_id = c.id
from public.categories c
where p.category_id is null
  and lower(regexp_replace(trim(p.category), '[^a-zA-Z0-9]+', '-', 'g')) = c.code;

alter table public.orders
  add column if not exists status_id uuid references public.order_statuses(id),
  add column if not exists payment_method_id uuid references public.payment_methods(id),
  add column if not exists customer_name text,
  add column if not exists customer_phone text,
  add column if not exists order_type text not null default 'counter'
    check (order_type in ('counter', 'table', 'delivery', 'pickup')),
  add column if not exists table_number text,
  add column if not exists delivery_address text,
  add column if not exists created_by uuid references public.profiles(id);

update public.orders o
set status_id = s.id
from public.order_statuses s
where o.status_id is null and s.code = o.status;

update public.orders o
set payment_method_id = pm.id
from public.payment_methods pm
where o.payment_method_id is null and pm.code = o.payment_type;

create table if not exists public.order_status_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  from_status_id uuid references public.order_statuses(id),
  to_status_id uuid not null references public.order_statuses(id),
  changed_by uuid references public.profiles(id),
  note text,
  created_at timestamptz not null default now()
);

insert into public.profiles (id, display_name)
select u.id, coalesce(nullif(u.raw_user_meta_data ->> 'full_name', ''), u.email)
from auth.users u
on conflict (id) do nothing;

create or replace function private.has_role(p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and exists (
      select 1
      from public.user_roles ur
      where ur.user_id = auth.uid()
        and ur.active
        and ur.role = any(p_roles)
    );
$$;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), new.email))
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on all functions in schema private from public;
grant execute on function private.has_role(text[]) to authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure private.handle_new_user();

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists products_updated_at on public.products;
create trigger products_updated_at before update on public.products
  for each row execute procedure public.set_updated_at();

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles
  for each row execute procedure public.set_updated_at();

alter table public.categories enable row level security;
alter table public.payment_methods enable row level security;
alter table public.order_statuses enable row level security;
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.order_status_history enable row level security;

drop policy if exists order_items_public_insert on public.order_items;
drop policy if exists order_items_public_read on public.order_items;
drop policy if exists orders_public_insert on public.orders;
drop policy if exists orders_public_read on public.orders;
drop policy if exists orders_public_update on public.orders;
drop policy if exists products_public_read on public.products;

create policy staff_read_categories on public.categories for select to authenticated
  using ((select private.has_role(array['admin', 'manager', 'cashier', 'kitchen'])));
create policy staff_read_products on public.products for select to authenticated
  using ((select private.has_role(array['admin', 'manager', 'cashier', 'kitchen'])));
create policy staff_read_payment_methods on public.payment_methods for select to authenticated
  using ((select private.has_role(array['admin', 'manager', 'cashier', 'kitchen'])));
create policy staff_read_order_statuses on public.order_statuses for select to authenticated
  using ((select private.has_role(array['admin', 'manager', 'cashier', 'kitchen'])));
create policy staff_read_orders on public.orders for select to authenticated
  using ((select private.has_role(array['admin', 'manager', 'cashier', 'kitchen'])));
create policy staff_read_order_items on public.order_items for select to authenticated
  using ((select private.has_role(array['admin', 'manager', 'cashier', 'kitchen'])));
create policy staff_read_order_history on public.order_status_history for select to authenticated
  using ((select private.has_role(array['admin', 'manager', 'cashier', 'kitchen'])));
create policy users_read_own_profile on public.profiles for select to authenticated
  using (id = auth.uid() or (select private.has_role(array['admin', 'manager'])));
create policy users_read_own_roles on public.user_roles for select to authenticated
  using (user_id = auth.uid() or (select private.has_role(array['admin', 'manager'])));

revoke insert, update, delete on public.orders, public.order_items, public.order_status_history,
  public.products, public.categories, public.payment_methods, public.order_statuses,
  public.profiles, public.user_roles from anon, authenticated;
grant select on public.orders, public.order_items, public.order_status_history,
  public.products, public.categories, public.payment_methods, public.order_statuses,
  public.profiles, public.user_roles to authenticated;

create or replace function public.create_order(
  p_items jsonb,
  p_payment_method_code text default 'cash',
  p_notes text default null,
  p_customer_name text default null,
  p_customer_phone text default null,
  p_order_type text default 'counter',
  p_table_number text default null,
  p_delivery_address text default null
)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_payment_id uuid;
  v_status_id uuid;
  v_total numeric;
begin
  if not private.has_role(array['admin', 'manager', 'cashier']) then
    raise exception 'Not authorized to create orders';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'An order must include at least one item';
  end if;
  if p_order_type not in ('counter', 'table', 'delivery', 'pickup') then
    raise exception 'Invalid order type';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_items) as i(product_id uuid, quantity integer)
    where quantity is null or quantity <= 0
  ) then
    raise exception 'Each item must have a positive quantity';
  end if;
  select id into v_payment_id from public.payment_methods
  where code = p_payment_method_code and active;
  if v_payment_id is null then raise exception 'Invalid payment method'; end if;
  select id into v_status_id from public.order_statuses where code = 'new' and active;
  if v_status_id is null then raise exception 'New order status is unavailable'; end if;
  if (select count(*) from (
        select product_id
        from jsonb_to_recordset(p_items) as i(product_id uuid, quantity integer)
        group by product_id
      ) requested) <> (
        select count(*) from public.products p
        where p.active and p.id in (
          select product_id from jsonb_to_recordset(p_items) as i(product_id uuid, quantity integer)
        )
      ) then
    raise exception 'Order contains unavailable products';
  end if;
  with requested as (
    select product_id, sum(quantity)::integer as quantity
    from jsonb_to_recordset(p_items) as i(product_id uuid, quantity integer)
    group by product_id
  )
  select coalesce(sum(p.price * r.quantity), 0) into v_total
  from requested r join public.products p on p.id = r.product_id and p.active;
  if v_total <= 0 then raise exception 'Order total must be positive'; end if;
  insert into public.orders (status, status_id, total, notes, payment_type, payment_method_id,
    customer_name, customer_phone, order_type, table_number, delivery_address, created_by)
  values ('new', v_status_id, v_total, p_notes, p_payment_method_code, v_payment_id,
    p_customer_name, p_customer_phone, p_order_type, p_table_number, p_delivery_address, auth.uid())
  returning * into v_order;
  insert into public.order_items (order_id, product_id, product_name, unit_price, quantity)
  select v_order.id, p.id, p.name, p.price, r.quantity
  from (select product_id, sum(quantity)::integer as quantity
        from jsonb_to_recordset(p_items) as i(product_id uuid, quantity integer)
        group by product_id) r
  join public.products p on p.id = r.product_id and p.active;
  insert into public.order_status_history (order_id, to_status_id, changed_by, note)
  values (v_order.id, v_status_id, auth.uid(), 'Pedido creado');
  return v_order;
end;
$$;

create or replace function public.update_order_status(p_order_id uuid, p_status_code text, p_note text default null)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_status_id uuid;
  v_is_manager boolean;
  v_is_kitchen boolean;
  v_is_cashier boolean;
  v_from_status_id uuid;
begin
  v_is_manager := private.has_role(array['admin', 'manager']);
  v_is_kitchen := private.has_role(array['kitchen']);
  v_is_cashier := private.has_role(array['cashier']);
  if not (v_is_manager or v_is_kitchen or v_is_cashier) then raise exception 'Not authorized to update orders'; end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  v_from_status_id := v_order.status_id;
  select id into v_status_id from public.order_statuses where code = p_status_code and active;
  if v_status_id is null then raise exception 'Invalid order status'; end if;
  if not v_is_manager then
    if v_is_kitchen and not ((v_order.status = 'new' and p_status_code = 'preparing') or (v_order.status = 'preparing' and p_status_code = 'ready')) then
      raise exception 'Kitchen transition not allowed';
    end if;
    if v_is_cashier and not ((v_order.status = 'new' and p_status_code = 'cancelled') or (v_order.status = 'ready' and p_status_code = 'delivered')) then
      raise exception 'Cashier transition not allowed';
    end if;
  end if;
  update public.orders set status = p_status_code, status_id = v_status_id where id = p_order_id returning * into v_order;
  insert into public.order_status_history (order_id, from_status_id, to_status_id, changed_by, note)
  values (p_order_id, v_from_status_id, v_status_id, auth.uid(), p_note);
  return v_order;
end;
$$;

revoke all on function public.create_order(jsonb, text, text, text, text, text, text, text) from public;
revoke all on function public.update_order_status(uuid, text, text) from public;
grant execute on function public.create_order(jsonb, text, text, text, text, text, text, text) to authenticated;
grant execute on function public.update_order_status(uuid, text, text) to authenticated;

create index if not exists products_category_id_idx on public.products(category_id);
create index if not exists order_items_product_id_idx on public.order_items(product_id);
create index if not exists orders_status_id_created_at_idx on public.orders(status_id, created_at desc);
create index if not exists order_status_history_order_id_created_at_idx on public.order_status_history(order_id, created_at desc);

alter table public.orders replica identity full;
alter table public.order_items replica identity full;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'orders') then
    alter publication supabase_realtime add table public.orders;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'order_items') then
    alter publication supabase_realtime add table public.order_items;
  end if;
end;
$$;
