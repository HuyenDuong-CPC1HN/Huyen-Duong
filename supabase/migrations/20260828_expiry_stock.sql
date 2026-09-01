-- Tồn kho cận date — mỗi lần upload file Excel là 1 THÁNG dữ liệu độc lập, không ghi đè tháng cũ.
-- Áp dụng qua Supabase SQL Editor sau khi đã chạy 20260809_init_ops_schema.sql. An toàn để chạy lại.

create table if not exists public.expiry_stock_months (
  id text primary key,
  file_name text,
  uploaded_at timestamptz not null default now(),
  storage_path text not null,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Chỉ cho phép tối đa 1 tháng đang active tại 1 thời điểm.
create unique index if not exists expiry_stock_months_one_active
  on public.expiry_stock_months ((true)) where is_active;
create index if not exists expiry_stock_months_uploaded_at_idx
  on public.expiry_stock_months (uploaded_at desc);

drop trigger if exists expiry_stock_months_set_updated_at on public.expiry_stock_months;
create trigger expiry_stock_months_set_updated_at before update on public.expiry_stock_months
for each row execute function public.set_updated_at();

alter table public.expiry_stock_months enable row level security;

drop policy if exists shared_authenticated_access on public.expiry_stock_months;
create policy shared_authenticated_access on public.expiry_stock_months
for all to authenticated using (true) with check (true);

grant usage on schema public to anon, authenticated, service_role;
grant all on table public.expiry_stock_months to anon, authenticated, service_role;
