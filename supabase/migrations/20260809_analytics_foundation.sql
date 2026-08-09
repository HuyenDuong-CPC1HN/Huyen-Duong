-- Webapp-first analytics foundation. Apply after 20260809_init_ops_schema.sql.
-- Only an explicitly published, completed Tong don cycle can create a ready package.

create table if not exists public.reporting_cycles (
  cycle_key text primary key,
  status text not null default 'draft' check (status in ('draft', 'ready_for_analytics')),
  tongdon_report_id text references public.tongdon_reports(id) on delete set null,
  published_by uuid references auth.users(id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists reporting_cycles_status_updated_at_idx
  on public.reporting_cycles (status, updated_at desc);

create table if not exists public.analytics_week_packages (
  cycle_key text primary key references public.reporting_cycles(cycle_key) on delete cascade,
  status text not null default 'ready' check (status in ('ready', 'stale')),
  kpi_json jsonb not null,
  source_refs jsonb not null,
  built_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists analytics_week_packages_status_built_at_idx
  on public.analytics_week_packages (status, built_at desc);

drop trigger if exists reporting_cycles_set_updated_at on public.reporting_cycles;
create trigger reporting_cycles_set_updated_at before update on public.reporting_cycles
for each row execute function public.set_updated_at();
drop trigger if exists analytics_week_packages_set_updated_at on public.analytics_week_packages;
create trigger analytics_week_packages_set_updated_at before update on public.analytics_week_packages
for each row execute function public.set_updated_at();

alter table public.reporting_cycles enable row level security;
alter table public.analytics_week_packages enable row level security;

do $$
declare table_name text;
begin
  foreach table_name in array array['reporting_cycles', 'analytics_week_packages'] loop
    execute format('drop policy if exists shared_authenticated_access on public.%I', table_name);
    execute format('drop policy if exists shared_authenticated_read on public.%I', table_name);
    execute format(
      'create policy shared_authenticated_read on public.%I for select to authenticated using (true)',
      table_name
    );
  end loop;
end;
$$;

revoke all on table public.reporting_cycles, public.analytics_week_packages from anon, authenticated;
grant select on table public.reporting_cycles, public.analytics_week_packages to authenticated;
grant all on table public.reporting_cycles, public.analytics_week_packages to service_role;

create or replace function public.publish_analytics_cycle(
  p_cycle_key text,
  p_tongdon_report_id text,
  p_kpi_json jsonb,
  p_source_refs jsonb
)
returns public.analytics_week_packages
language plpgsql
security definer
set search_path = public
as $$
declare
  package public.analytics_week_packages;
begin
  if coalesce(trim(p_cycle_key), '') = '' then
    raise exception 'Thiếu khóa chu kỳ báo cáo.';
  end if;

  if not exists (
    select 1
    from public.tongdon_reports
    where id = p_tongdon_report_id
      and payload ->> 'weekKey' = p_cycle_key
  ) then
    raise exception 'Báo cáo Tổng đơn chưa được lưu hoặc không khớp chu kỳ.';
  end if;

  if not exists (
    select 1
    from public.sheet_reports don_c
    join public.sheet_reports don_dtp on true
    where don_c.channel = 'donC'
      and don_dtp.channel = 'donDTP'
      and don_c.week_id || '_' || don_dtp.week_id = p_cycle_key
  ) then
    raise exception 'Chưa có đủ báo cáo Đơn C và Đơn DTP đã lưu cho chu kỳ này.';
  end if;

  insert into public.reporting_cycles (
    cycle_key, status, tongdon_report_id, published_by, published_at
  ) values (
    p_cycle_key, 'ready_for_analytics', p_tongdon_report_id, auth.uid(), now()
  ) on conflict (cycle_key) do update set
    status = excluded.status,
    tongdon_report_id = excluded.tongdon_report_id,
    published_by = excluded.published_by,
    published_at = excluded.published_at;

  insert into public.analytics_week_packages (
    cycle_key, status, kpi_json, source_refs, built_at
  ) values (
    p_cycle_key, 'ready', p_kpi_json, p_source_refs, now()
  ) on conflict (cycle_key) do update set
    status = excluded.status,
    kpi_json = excluded.kpi_json,
    source_refs = excluded.source_refs,
    built_at = excluded.built_at
  returning * into package;

  return package;
end;
$$;

create or replace function public.unpublish_analytics_cycle(p_cycle_key text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.reporting_cycles
  set status = 'draft', published_at = null, published_by = null
  where cycle_key = p_cycle_key;

  update public.analytics_week_packages
  set status = 'stale'
  where cycle_key = p_cycle_key;
end;
$$;

revoke all on function public.publish_analytics_cycle(text, text, jsonb, jsonb) from public;
revoke all on function public.unpublish_analytics_cycle(text) from public;
grant execute on function public.publish_analytics_cycle(text, text, jsonb, jsonb) to authenticated, service_role;
grant execute on function public.unpublish_analytics_cycle(text) to authenticated, service_role;
