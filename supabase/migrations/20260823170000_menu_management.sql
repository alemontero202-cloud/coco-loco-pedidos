-- Administración del menú: precios, altas/bajas y categorías.
-- Solo admin/manager pueden ejecutar estas funciones.

create table if not exists public.product_price_history (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  old_price numeric,
  new_price numeric not null,
  changed_by uuid references public.profiles(id),
  changed_at timestamptz not null default now()
);

create index if not exists product_price_history_product_idx
  on public.product_price_history(product_id, changed_at desc);

alter table public.product_price_history enable row level security;

drop policy if exists admin_read_price_history on public.product_price_history;
create policy admin_read_price_history
  on public.product_price_history for select to authenticated
  using ((select private.has_role(array['admin','manager'])));

grant select on public.product_price_history to authenticated;

create or replace function public.admin_list_products()
returns table (
  id uuid,
  name text,
  price numeric,
  description text,
  category text,
  category_id uuid,
  category_name text,
  active boolean,
  sort_order integer,
  updated_at timestamptz
)
language sql
security definer
set search_path = ''
as $$
  select p.id, p.name, p.price, p.description, p.category, p.category_id,
         c.name, p.active, p.sort_order, p.updated_at
  from public.products p
  left join public.categories c on c.id = p.category_id
  where private.has_role(array['admin','manager'])
  order by p.active desc, p.sort_order, p.name;
$$;

create or replace function public.admin_upsert_product(
  p_id uuid default null,
  p_name text default null,
  p_price numeric default null,
  p_description text default null,
  p_category_id uuid default null,
  p_active boolean default true,
  p_sort_order integer default 0
)
returns public.products
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product public.products;
  v_old_price numeric;
  v_category text;
begin
  if not private.has_role(array['admin','manager']) then
    raise exception 'Not authorized to manage products';
  end if;

  if nullif(trim(p_name), '') is null then
    raise exception 'El nombre del producto es obligatorio';
  end if;

  if p_price is null or p_price < 0 then
    raise exception 'El precio debe ser mayor o igual a cero';
  end if;

  if p_id is null then
    select name into v_category from public.categories where id = p_category_id;

    insert into public.products (name, price, description, category, category_id, active, sort_order)
    values (trim(p_name), p_price, nullif(trim(p_description), ''), v_category, p_category_id, p_active, coalesce(p_sort_order, 0))
    returning * into v_product;

    insert into public.product_price_history(product_id, old_price, new_price, changed_by)
    values (v_product.id, null, v_product.price, auth.uid());
  else
    select price into v_old_price from public.products where id = p_id for update;
    if not found then raise exception 'Producto no encontrado'; end if;

    select name into v_category from public.categories where id = p_category_id;

    update public.products
    set name = trim(p_name),
        price = p_price,
        description = nullif(trim(p_description), ''),
        category = v_category,
        category_id = p_category_id,
        active = p_active,
        sort_order = coalesce(p_sort_order, 0)
    where id = p_id
    returning * into v_product;

    if v_old_price is distinct from v_product.price then
      insert into public.product_price_history(product_id, old_price, new_price, changed_by)
      values (v_product.id, v_old_price, v_product.price, auth.uid());
    end if;
  end if;

  return v_product;
end;
$$;

create or replace function public.admin_set_product_active(p_id uuid, p_active boolean)
returns public.products
language plpgsql
security definer
set search_path = ''
as $$
declare v_product public.products;
begin
  if not private.has_role(array['admin','manager']) then
    raise exception 'Not authorized to manage products';
  end if;
  update public.products set active = p_active where id = p_id returning * into v_product;
  if not found then raise exception 'Producto no encontrado'; end if;
  return v_product;
end;
$$;

create or replace function public.admin_list_categories()
returns setof public.categories
language sql
security definer
set search_path = ''
as $$
  select * from public.categories
  where private.has_role(array['admin','manager'])
  order by sort_order, name;
$$;

create or replace function public.admin_upsert_category(
  p_id uuid default null,
  p_name text default null,
  p_code text default null,
  p_description text default null,
  p_active boolean default true,
  p_sort_order integer default 0
)
returns public.categories
language plpgsql
security definer
set search_path = ''
as $$
declare v_category public.categories;
begin
  if not private.has_role(array['admin','manager']) then
    raise exception 'Not authorized to manage categories';
  end if;
  if nullif(trim(p_name), '') is null then raise exception 'El nombre de la categoría es obligatorio'; end if;
  if nullif(trim(p_code), '') is null or p_code !~ '^[a-z0-9_-]+$' then raise exception 'Código de categoría inválido'; end if;

  if p_id is null then
    insert into public.categories(name, code, description, active, sort_order)
    values(trim(p_name), lower(trim(p_code)), nullif(trim(p_description), ''), p_active, coalesce(p_sort_order,0))
    returning * into v_category;
  else
    update public.categories
    set name=trim(p_name), code=lower(trim(p_code)), description=nullif(trim(p_description), ''), active=p_active, sort_order=coalesce(p_sort_order,0)
    where id=p_id
    returning * into v_category;
    if not found then raise exception 'Categoría no encontrada'; end if;
  end if;
  return v_category;
end;
$$;

create or replace function public.admin_price_history(p_product_id uuid default null)
returns table (
  id uuid,
  product_id uuid,
  product_name text,
  old_price numeric,
  new_price numeric,
  changed_by uuid,
  changed_at timestamptz
)
language sql
security definer
set search_path = ''
as $$
  select h.id, h.product_id, p.name, h.old_price, h.new_price, h.changed_by, h.changed_at
  from public.product_price_history h
  join public.products p on p.id = h.product_id
  where private.has_role(array['admin','manager'])
    and (p_product_id is null or h.product_id = p_product_id)
  order by h.changed_at desc;
$$;

revoke all on function public.admin_list_products() from public, anon;
revoke all on function public.admin_upsert_product(uuid,text,numeric,text,uuid,boolean,integer) from public, anon;
revoke all on function public.admin_set_product_active(uuid,boolean) from public, anon;
revoke all on function public.admin_list_categories() from public, anon;
revoke all on function public.admin_upsert_category(uuid,text,text,text,boolean,integer) from public, anon;
revoke all on function public.admin_price_history(uuid) from public, anon;
grant execute on function public.admin_list_products() to authenticated;
grant execute on function public.admin_upsert_product(uuid,text,numeric,text,uuid,boolean,integer) to authenticated;
grant execute on function public.admin_set_product_active(uuid,boolean) to authenticated;
grant execute on function public.admin_list_categories() to authenticated;
grant execute on function public.admin_upsert_category(uuid,text,text,text,boolean,integer) to authenticated;
grant execute on function public.admin_price_history(uuid) to authenticated;
