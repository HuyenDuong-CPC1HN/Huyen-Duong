-- One-shot fix if tables already exist without GRANTs.
-- Run in Supabase → SQL Editor, then re-run the migrate script.

grant usage on schema public to anon, authenticated, service_role;
grant all on table
  public.report_weeks,
  public.sheet_reports,
  public.tongdon_reports,
  public.tmdt_reports,
  public.carrier_weeks,
  public.carrier_hold_weeks,
  public.ops_settings
to anon, authenticated, service_role;
