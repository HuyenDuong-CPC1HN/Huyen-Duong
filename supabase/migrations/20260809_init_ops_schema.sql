-- CPC1HN shared operations store. Apply through the Supabase SQL editor or CLI.
-- All application data is shared by authenticated operators; anon is denied.

create table if not exists public.report_weeks (
  id text primary key,
  channel text not null check (channel in ('donC', 'donDTP')),
  label text not null,
  file_name text,
  uploaded_at timestamptz not null default now(),
  storage_path text not null,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists report_weeks_one_active_per_channel
  on public.report_weeks (channel) where is_active;
create index if not exists report_weeks_channel_uploaded_at_idx
  on public.report_weeks (channel, uploaded_at desc);

create table if not exists public.sheet_reports (
  id text primary key,
  channel text not null check (channel in ('donC', 'donDTP')),
  week_id text not null,
  label text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (channel, week_id)
);
create index if not exists sheet_reports_channel_updated_at_idx
  on public.sheet_reports (channel, updated_at desc);

create table if not exists public.tongdon_reports (
  id text primary key,
  label text,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists tongdon_reports_updated_at_idx
  on public.tongdon_reports (updated_at desc);

create table if not exists public.tmdt_reports (
  id text primary key,
  report_key text not null unique,
  label text not null,
  date_from date not null,
  date_to date not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists tmdt_reports_date_from_idx
  on public.tmdt_reports (date_from desc);

create table if not exists public.carrier_weeks (
  id text primary key,
  carrier_key text not null,
  carrier_type text not null check (carrier_type in ('viettel', 'spx')),
  file_name text,
  uploaded_at timestamptz not null default now(),
  storage_path text not null,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists carrier_weeks_one_active_per_carrier
  on public.carrier_weeks (carrier_key) where is_active;
create index if not exists carrier_weeks_key_uploaded_at_idx
  on public.carrier_weeks (carrier_key, uploaded_at desc);

create table if not exists public.carrier_hold_weeks (
  id text primary key,
  carrier_key text not null,
  file_name text,
  uploaded_at timestamptz not null default now(),
  storage_path text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists carrier_hold_weeks_key_uploaded_at_idx
  on public.carrier_hold_weeks (carrier_key, uploaded_at desc);

create table if not exists public.ops_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists report_weeks_set_updated_at on public.report_weeks;
create trigger report_weeks_set_updated_at before update on public.report_weeks
for each row execute function public.set_updated_at();
drop trigger if exists sheet_reports_set_updated_at on public.sheet_reports;
create trigger sheet_reports_set_updated_at before update on public.sheet_reports
for each row execute function public.set_updated_at();
drop trigger if exists tongdon_reports_set_updated_at on public.tongdon_reports;
create trigger tongdon_reports_set_updated_at before update on public.tongdon_reports
for each row execute function public.set_updated_at();
drop trigger if exists tmdt_reports_set_updated_at on public.tmdt_reports;
create trigger tmdt_reports_set_updated_at before update on public.tmdt_reports
for each row execute function public.set_updated_at();
drop trigger if exists carrier_weeks_set_updated_at on public.carrier_weeks;
create trigger carrier_weeks_set_updated_at before update on public.carrier_weeks
for each row execute function public.set_updated_at();
drop trigger if exists carrier_hold_weeks_set_updated_at on public.carrier_hold_weeks;
create trigger carrier_hold_weeks_set_updated_at before update on public.carrier_hold_weeks
for each row execute function public.set_updated_at();
drop trigger if exists ops_settings_set_updated_at on public.ops_settings;
create trigger ops_settings_set_updated_at before update on public.ops_settings
for each row execute function public.set_updated_at();

alter table public.report_weeks enable row level security;
alter table public.sheet_reports enable row level security;
alter table public.tongdon_reports enable row level security;
alter table public.tmdt_reports enable row level security;
alter table public.carrier_weeks enable row level security;
alter table public.carrier_hold_weeks enable row level security;
alter table public.ops_settings enable row level security;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'report_weeks', 'sheet_reports', 'tongdon_reports', 'tmdt_reports',
    'carrier_weeks', 'carrier_hold_weeks', 'ops_settings'
  ] loop
    execute format('drop policy if exists shared_authenticated_access on public.%I', table_name);
    execute format(
      'create policy shared_authenticated_access on public.%I for all to authenticated using (true) with check (true)',
      table_name
    );
  end loop;
end;
$$;

insert into storage.buckets (id, name, public)
values ('ops-files', 'ops-files', false)
on conflict (id) do update set public = false;

drop policy if exists ops_files_authenticated_select on storage.objects;
create policy ops_files_authenticated_select on storage.objects
for select to authenticated using (bucket_id = 'ops-files');
drop policy if exists ops_files_authenticated_insert on storage.objects;
create policy ops_files_authenticated_insert on storage.objects
for insert to authenticated with check (bucket_id = 'ops-files');
drop policy if exists ops_files_authenticated_update on storage.objects;
create policy ops_files_authenticated_update on storage.objects
for update to authenticated using (bucket_id = 'ops-files') with check (bucket_id = 'ops-files');
drop policy if exists ops_files_authenticated_delete on storage.objects;
create policy ops_files_authenticated_delete on storage.objects
for delete to authenticated using (bucket_id = 'ops-files');
