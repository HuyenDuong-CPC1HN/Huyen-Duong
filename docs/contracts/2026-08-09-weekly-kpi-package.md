# Weekly KPI package contract

This is the Webapp-first analytics boundary for CPC1HN. It contains a KPI JSON
package only; it does not create a `don_hang` warehouse, an n8n workflow, an
LLM call, PNG rendering, or chat delivery.

## Publication lifecycle

1. Ops saves the frozen Đơn C and Đơn DTP reports.
2. Ops saves the frozen Tổng đơn report for the matching `weekKey`.
3. In Tổng đơn, Ops explicitly selects **Công bố cho phân tích**.
4. Supabase RPC `publish_analytics_cycle` validates those saved artifacts,
   sets `reporting_cycles.status = 'ready_for_analytics'`, and upserts the
   package with `analytics_week_packages.status = 'ready'`.

TMĐT is not a v1 hard gate. Deleting a published Tổng đơn report calls
`unpublish_analytics_cycle`, which changes the cycle to `draft` and package to
`stale` before the report is removed.

## Tables

`reporting_cycles`

- `cycle_key`: the saved Tổng đơn `payload.weekKey` (`{donCId}_{donDTPId}`).
- `status`: `draft` or `ready_for_analytics`.
- `tongdon_report_id`, `published_by`, `published_at`: publication audit refs.

`analytics_week_packages`

- One row per `cycle_key`.
- `status`: `ready` or `stale`.
- `kpi_json`: frozen, analytics-only values.
- `source_refs`: source snapshot IDs used to build it.

Both tables use the existing shared-org RLS pattern: authenticated operators
share read/write access; anonymous users have no RLS policy.

## `kpi_json` v1

```json
{
  "schema_version": "1.0",
  "cycle_key": "donC_32_donDTP_32",
  "period": {
    "label": "Báo cáo tuần 32",
    "saved_at": "2026-08-09T09:00:00.000Z"
  },
  "totals": {
    "total_orders": 1500,
    "don_c": 700,
    "don_dtp": 600,
    "tmdt": 200
  },
  "delivery": {
    "direct_total": 430,
    "within_24h": 300,
    "within_48h": 80,
    "within_72h": 20,
    "pending": 30,
    "sla_24h_pct": 69.8,
    "return_rate_pct": 1.6
  }
}
```

Optional values, including `return_rate_pct`, are omitted when the frozen
snapshot does not provide them. This contract does not create or reinterpret a
business formula; it reuses the values already calculated and frozen by the
Web App.

## Future consumer rule

The future Saturday 08:00 n8n/AI epic must select packages only when **both**
statuses are ready:

```sql
select package.*
from public.analytics_week_packages as package
join public.reporting_cycles as cycle using (cycle_key)
where cycle.status = 'ready_for_analytics'
  and package.status = 'ready'
order by package.built_at desc;
```

That future integration needs its own authenticated/server-side credential
decision. It must not read `tongdon_reports` directly and must not use draft or
stale packages.
