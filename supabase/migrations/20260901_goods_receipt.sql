-- Biên bản nhập hàng — lưu lịch sử mỗi lần xử lý + dòng chi tiết để tra cứu theo Mã hàng.
-- Áp dụng qua Supabase SQL Editor sau khi đã chạy 20260809_init_ops_schema.sql. An toàn để chạy lại.

create table if not exists public.goods_receipt_batches (
  id text primary key,
  processed_at timestamptz not null default now(),
  pdf_file_name text,
  excel_c_file_name text,
  excel_lgt_file_name text,
  storage_path text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists goods_receipt_batches_processed_at_idx
  on public.goods_receipt_batches (processed_at desc);

create table if not exists public.goods_receipt_lines (
  id bigint generated always as identity primary key,
  batch_id text not null references public.goods_receipt_batches (id) on delete cascade,
  warehouse text not null check (warehouse in ('C', 'LGT')),
  ma_hang text not null,
  ten_hang text,
  dvt text,
  so_lo text not null default '',
  han_dung date,
  kien_nguyen numeric,
  kien_le numeric,
  sl_hoa_don numeric not null default 0,
  sl_thuc_te numeric,
  ghi_chu text,
  created_at timestamptz not null default now()
);

create index if not exists goods_receipt_lines_ma_hang_idx
  on public.goods_receipt_lines (ma_hang);
create index if not exists goods_receipt_lines_batch_id_idx
  on public.goods_receipt_lines (batch_id);

drop trigger if exists goods_receipt_batches_set_updated_at on public.goods_receipt_batches;
create trigger goods_receipt_batches_set_updated_at before update on public.goods_receipt_batches
for each row execute function public.set_updated_at();

alter table public.goods_receipt_batches enable row level security;
alter table public.goods_receipt_lines enable row level security;

drop policy if exists shared_authenticated_access on public.goods_receipt_batches;
create policy shared_authenticated_access on public.goods_receipt_batches
for all to authenticated using (true) with check (true);

drop policy if exists shared_authenticated_access on public.goods_receipt_lines;
create policy shared_authenticated_access on public.goods_receipt_lines
for all to authenticated using (true) with check (true);

grant usage on schema public to anon, authenticated, service_role;
grant all on table public.goods_receipt_batches to anon, authenticated, service_role;
grant all on table public.goods_receipt_lines to anon, authenticated, service_role;
grant usage, select on sequence public.goods_receipt_lines_id_seq to anon, authenticated, service_role;
