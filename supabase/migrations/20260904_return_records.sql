-- Theo dõi hàng nhập trả lại (Đơn C / Đơn DTP) — 1 bản ghi = 1 lần trả hàng, có thể gồm nhiều hóa đơn
-- và nhiều dòng hàng hóa xác minh. Dùng để xuất Biên bản trả hàng nội bộ + Biên bản xác minh tình trạng
-- hàng hoá theo đúng mẫu Word có sẵn.
-- Áp dụng qua Supabase SQL Editor sau khi đã chạy 20260809_init_ops_schema.sql. An toàn để chạy lại.

create table if not exists public.return_records (
  id text primary key,
  entity text not null check (entity in ('donC', 'donDTP')),
  year int not null,
  month int not null,
  customer_name text not null,
  customer_address text,
  customer_phone text,
  customer_mst text,
  return_reason text,
  gia_tri_bang_chu text,
  verify_datetime timestamptz,
  verify_location text,
  verify_result text,
  rep_accounting text,
  rep_sales text,
  status text not null default 'draft' check (status in ('draft', 'exported')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists return_records_entity_year_month_idx
  on public.return_records (entity, year, month desc);

create table if not exists public.return_record_invoices (
  id bigint generated always as identity primary key,
  record_id text not null references public.return_records (id) on delete cascade,
  mau_so text,
  ky_hieu text,
  so_hoa_don text,
  ngay_lap_hd text,
  ten_hang_hoa text,
  so_luong text,
  gia_tri text,
  sort_order int not null default 0
);

create index if not exists return_record_invoices_record_idx
  on public.return_record_invoices (record_id);

create table if not exists public.return_record_products (
  id bigint generated always as identity primary key,
  record_id text not null references public.return_records (id) on delete cascade,
  ten_hang text,
  so_lo text,
  han_dung text,
  don_vi_tinh text,
  so_luong text,
  quy_cach text,
  tinh_trang text default 'Hàng nguyên vẹn',
  sort_order int not null default 0
);

create index if not exists return_record_products_record_idx
  on public.return_record_products (record_id);

drop trigger if exists return_records_set_updated_at on public.return_records;
create trigger return_records_set_updated_at before update on public.return_records
for each row execute function public.set_updated_at();

alter table public.return_records enable row level security;
alter table public.return_record_invoices enable row level security;
alter table public.return_record_products enable row level security;

drop policy if exists shared_authenticated_access on public.return_records;
create policy shared_authenticated_access on public.return_records
for all to authenticated using (true) with check (true);

drop policy if exists shared_authenticated_access on public.return_record_invoices;
create policy shared_authenticated_access on public.return_record_invoices
for all to authenticated using (true) with check (true);

drop policy if exists shared_authenticated_access on public.return_record_products;
create policy shared_authenticated_access on public.return_record_products
for all to authenticated using (true) with check (true);

grant usage on schema public to anon, authenticated, service_role;
grant all on table public.return_records to anon, authenticated, service_role;
grant all on table public.return_record_invoices to anon, authenticated, service_role;
grant all on table public.return_record_products to anon, authenticated, service_role;
grant usage, select on sequence public.return_record_invoices_id_seq to anon, authenticated, service_role;
grant usage, select on sequence public.return_record_products_id_seq to anon, authenticated, service_role;
