-- Ejecutar en un proyecto Supabase nuevo. Requiere usuarios autenticados para caja y cocina.
create table public.orders (
  id uuid primary key default gen_random_uuid(), order_number bigint generated always as identity unique,
  status text not null default 'NUEVO' check (status in ('NUEVO','PREPARANDO','LISTO','ENTREGADO')),
  payment_method text not null check (payment_method in ('EFECTIVO','YAPE')),
  cash_received numeric(10,2), change_due numeric(10,2) not null default 0, note text,
  subtotal numeric(10,2) not null, total numeric(10,2) not null, created_at timestamptz not null default now()
);
create table public.order_items (
  id bigint generated always as identity primary key, order_id uuid not null references public.orders(id) on delete cascade,
  product_id text not null, name text not null, detail text, unit_price numeric(10,2) not null,
  quantity integer not null check (quantity > 0), line_total numeric(10,2) not null
);
alter table public.orders enable row level security; alter table public.order_items enable row level security;
create policy "Staff reads orders" on public.orders for select to authenticated using (true);
create policy "Staff creates orders" on public.orders for insert to authenticated with check (true);
create policy "Staff updates orders" on public.orders for update to authenticated using (true) with check (true);
create policy "Staff reads items" on public.order_items for select to authenticated using (true);
create policy "Staff creates items" on public.order_items for insert to authenticated with check (true);
grant select, insert, update on public.orders to authenticated; grant select, insert on public.order_items to authenticated;
alter publication supabase_realtime add table public.orders, public.order_items;
