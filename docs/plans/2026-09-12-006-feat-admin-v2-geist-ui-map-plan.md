---
title: "feat: Admin v2 Geist shell, HomeBrief, and Đơn C map"
type: feat
status: ready-for-audit
date: 2026-09-12
execution: omp
origin: docs/reports/2026-09-12-advise-admin-v2-geist-ui.md
---

# Admin v2 Geist UI Map

## Outcome
Map the existing application to the confirmed Admin v2 Geist prototype: a global shell, a HomeBrief hybrid, and a Don-C-only presentation branch. Retain all current business/data/Supabase behavior and every tab's existing content workflow outside the named scope.

## Visual authority
- `C:/Users/PhuTV/Downloads/Landing page design component/CPC1HN Admin v2 Geist.dc.html`: all visual tokens, shell geometry, type, controls, surfaces, and Don C presentation primitives.
- `C:/Users/PhuTV/Downloads/Landing page design component/CPC1HN Ops Home.dc.html`: HomeBrief information architecture only.
- Existing React application: all interactions, data, routes, storage keys, report/export behavior, and dynamic states.

## File ownership

| File | Allowed responsibility |
| --- | --- |
| `src/App.jsx` | `AppContent` shell markup/classes only; retain NAV, breadcrumbs, active route, expansion, logout, focus, and responsive-sidebar behavior. |
| `src/components/HomeBrief.jsx` | Presentation class structure only; retain every derivation, storage read, conditional action, copy condition, and `onNavigate` behavior. |
| `src/components/SheetTab.jsx` | Emit a Don-C-only root marker and presentation branch when `type === 'donC'`; retain common state/data/action orchestration and leave DTP composition untouched. |
| `src/index.css` | Global `.dashboard-*` Admin v2 shell styling, scoped `.home-brief-*` hybrid styling, and a new `.donc-v2 …` block only. |

No new component unless the Don C JSX branch becomes less clear than a narrow presentation component receiving only existing values/callbacks.

## Phase 1 — Global shell
1. Restyle the global `.dashboard-*` shell to the Admin v2 contract: 248px #fafafa rail, 64px logo rail, #ebebeb hairlines, compact 36px/6px-radius Geist navigation, blue active state, and retained account/logout controls.
2. Retain the functional menu, breadcrumbs, title, focus target, and mobile drawer; make the retained header a compact white 64px toolbar rather than removing it for the static mock.
3. Make `.dashboard-main` the neutral #fafafa content canvas with 24px desktop gutter; retain its existing scroll/saved-report behavior.

## Phase 2 — HomeBrief hybrid
1. Preserve the existing Intro → four channel cards → Exceptions → Next Action information architecture and all dynamic values.
2. Map visual treatment to Admin v2: Geist type, neutral surfaces, #ebebeb borders, #171717/#4d4d4d text, #0070f3 action/active color, 12px cards, and 44px pill treatment only for real next-action controls.
3. Do not add Ops Home charts, static KPIs, carrier panels, report history, static counts, or workflows that the current data model does not provide.

## Phase 3 — Don C isolated presentation
1. Keep `SheetTab` data/state/action orchestration. For `type === 'donC'`, wrap both empty and loaded states in `.donc-v2` and render a presentation branch that reuses existing WeekSelector, upload, save, pending-clear/undo, report actions, statistics, accordion, and DataTable.
2. Use only `.donc-v2 …` selectors for all Don C visual treatment: a 1200px desktop frame, neutral surface cards, source-like lead only when actual snapshot values exist, four existing Don C KPI semantics, and a full-width existing detail/table disclosure.
3. Leave DTP markup and its current class tree untouched. Do not alter unscoped `.sheet-tab*`, `.report-*`, `.report-kpi-*`, `.report-section*`, `.report-stat*`, `ReportCards`, shared saved-report locks, print rules, or responsive rules.
4. Do not infer static mock controls or values. Preserve current DataTable search/filter/page-size/refresh/resizing/pagination, upload errors, export/print/relink, and storage keys.

## Explicit exclusions
- No changes to Supabase calls, routes, NAV/BREADCRUMB semantics, storage keys, data formulas, reports, exports, table behavior, or labels.
- No redesign of DTP, Return Tracking, Damaged Goods, TMĐT, Tổng đơn, Nhập hàng, or mobile/tablet feature content.
- No shadcn/21st component installation unless an approved implementation step identifies a concrete missing primitive.

## Acceptance
- At 1440px, global shell, HomeBrief, and Don C visually match the Admin v2 hierarchy without invented data or actions.
- At 1440px, DTP, Return Tracking, and Damaged Goods retain their content layouts and controls inside the new shell.
- Browser checks complete for shell, HomeBrief, Don C, DTP, Return Tracking, and Damaged Goods.
- `npm test && npm run build` pass.
- Code review, security scan, Snyk Open Source, and Snyk Code find no blocking regression/new issue; Sonar is N/A unless a project configuration appears.

## Verification record
- `npm test && npm run build`: passed (5 tests; Vite emitted only its existing dynamic-import/chunk-size warnings).
- `npm audit --json`: 0 vulnerabilities; `snyk test`: no vulnerable dependency paths; `snyk code test`: 0 issues; Sonar: N/A (no project configuration).
- Browser verification used a fresh browser-only in-memory auth/workspace seam with the existing `donCFixture` seeded under `weeks_donC`; it did not save source, alter Supabase, or modify persistent storage.
- At logical `1440 × 900` with DPR 1, shell and HomeBrief rendered with a 248px `rgb(250, 250, 250)` sidebar, a 65px header including its border, and an `rgb(250, 250, 250)` main canvas. HomeBrief preserved the existing channel-card, exception, and next-action flow.
- Loaded Don C rendered `.donc-v2 .sheet-tab-shell` (not `.donc-v2--empty`) with the existing 15-row fixture: its context controls, four KPI blocks, report sections, and closed detail accordion rendered. DTP rendered its existing upload state without `.donc-v2`; Return Tracking (Đơn C) and Damaged Goods (Kho C) rendered their existing navigation, action, month tree, counts, and empty states without `.donc-v2`.
- `npm run test:ui -- src/components/__tests__/SheetTab.characterization.test.jsx`: passed (11 tests), including the representative loaded Don C branch. `npm run build` passed after the mobile-drawer alignment correction.
