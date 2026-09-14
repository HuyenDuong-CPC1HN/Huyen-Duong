# Phase 5 — Throttle Test and Fallback Resolution

**Goal:** Verify cold lazy-tab loading under throttle and resolve an unacceptable blank state without adding a new visual pattern.

## Result

- With cache disabled and network throttled to 200 KiB/s with 100 ms latency, `fallback={null}` left `.dashboard-main` blank for 3,949 ms for `TongDonTab`.
- The existing `TongDonTab` and `DataTable` loading indicators cannot render before their own lazy chunk finishes. The App-level `.app-loading-state` is the reusable loading surface.
- User approved reusing that existing App-level status as the shared fallback for `TongDonTab` and both `SheetTab` mounts. No CSS, component, dependency, data, or lifecycle change was added.

## Verification

| Cold lazy module | Fallback visible | Module request | Time to tab render |
|---|---:|---|---:|
| `TongDonTab` | 4,008 ms | `/src/components/TongDonTab.jsx` | 32,048 ms |
| `SheetTab` | 4,173 ms | `/src/components/SheetTab.jsx` | 11,603 ms |

Browser Relay captured the actual authenticated dashboard displaying the existing CPC1HN loading surface under a deliberately slower 5 KiB/s network. The QA tab was restored to Home with normal cache and network settings after the check.
