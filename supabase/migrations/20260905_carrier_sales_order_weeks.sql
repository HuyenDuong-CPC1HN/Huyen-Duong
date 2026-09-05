-- File "Danh sách thống kê" (đội kinh doanh lên đơn, cột Mã đơn/Tạo lúc) upload cho tính năng đối soát
-- "đơn ngoại sàn" SPX COD (SLA 24h lấy hàng / 48h giao hàng) — cùng cấu trúc với carrier_hold_weeks.
create table if not exists public.carrier_sales_order_weeks (
  id text primary key,
  carrier_key text not null,
  file_name text,
  uploaded_at timestamptz not null default now(),
  storage_path text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists carrier_sales_order_weeks_key_uploaded_at_idx
  on public.carrier_sales_order_weeks (carrier_key, uploaded_at desc);

drop trigger if exists carrier_sales_order_weeks_set_updated_at on public.carrier_sales_order_weeks;
create trigger carrier_sales_order_weeks_set_updated_at before update on public.carrier_sales_order_weeks
for each row execute function public.set_updated_at();

alter table public.carrier_sales_order_weeks enable row level security;

drop policy if exists shared_authenticated_access on public.carrier_sales_order_weeks;
create policy shared_authenticated_access on public.carrier_sales_order_weeks
for all to authenticated using (true) with check (true);

grant select, insert, update, delete on public.carrier_sales_order_weeks to anon, authenticated, service_role;
