# advise-state
phase: advise
input: Assess Wave 2 DTP presentation proposal. Scope: mirror Wave 1 using `.dtp-v2` only for `type === 'donDTP'` in SheetTab; do not touch `.donc-v2`, Return, Damaged, unscoped `.sheet-tab-*`, or `.report-*`. Visual decision: Admin v2 Geist.dc.html has no `#dtp`; assess whether loaded DTP should reuse `#donc` composition or retain its content design and align only the shell. Flags: --yagni. Branch flow: `vinh-phu` → `master` after Cursor audit.
flags: --yagni

## scout-findings
- **SheetTab.jsx**: shared component for `type === 'donC'` and `type === 'donDTP'`. `isDonC` branches presentation. Root class pattern: `.sheet-tab` + conditional `.donc-v2` when `type === 'donC'`.
- **Wave 1 (`.donc-v2`)**: fully implemented in `src/index.css` (lines 1883–2004+). Includes: `width: min(1200px, 100%)`, border-radius 12px, neutral white surfaces, Geist blue actions, scoped overrides for `.sheet-tab-shell`, `.sheet-tab-context`, `.sheet-tab-action`, `.sheet-tab-accordion`, `.report-*` etc.
- **Wave 2 (`.dtp-v2`)**: **does not exist anywhere in the codebase**. No CSS, no planning doc.
- **Admin v2 Geist.dc.html**: confirmed no `#dtp` section. Contains only `#home` and `#donc`. DTP is visually unspecified in the prototype.
- **SheetReportPanel**: renders inside `.sheet-tab-report`, consumed by `.report-*` CSS (shared with DonC, return, damaged). Wave 1 scopes `.donc-v2 .report-*` overrides.
- **App.jsx**: `donDTP` BREADCRUMB and `type === 'donDTP'` routing already exist. Behavior side is complete.
- **Fixtures**: `sheetTabDonDTPFixture.js` and `sheetTabDonCFixture.js` frozen with representative KPIs. Tests cover both DonC and DonDTP layout/KPI invariants.
- **Test suite**: `SheetTab.characterization.test.jsx` exists; no browser smoke or e2e.

## qa-log
- Q1: Visual target → **(B) DTP reuses the exact `.donc-v2` composition as Đơn C.**
- Q2: Wave 1 status → **Shipped and stable.**
- Q3: Urgency → **Users notice DTP looks outdated next to Đơn C.** Cognitive inconsistency, high daily visibility.
- Q4: CSS architecture → Intending both types get both classes.
- Q5: Verification → **Tests + browser smoke at 1440px.**
- Q6: Corrections → **(1) Each type gets only its own class** (DonC: `.donc-v2` only; DTP: `.dtp-v2` only). **(2) CSS grouped selectors `.donc-v2, .dtp-v2 { }`** — share rules via comma-grouping.
- Q7: Reframing confirmed → **Yes.**

## reframing-draft
**Problem (reframed)**: Đơn DTP renders under the old warm/cpc-blue surfaces while Đơn C is live with Admin v2 Geist styling. Users see two product tabs with visibly mismatched visual quality.

**Exact requirements**:
1. `SheetTab.jsx`: Đơn C keeps `.donc-v2` only. Đơn DTP adds `.dtp-v2` only. Each type gets its own class.
2. `index.css`: refactor every `.donc-v2` rule into grouped selectors `.donc-v2, .dtp-v2 { ... }` so both types share the same declared values without duplicating declaration blocks. The grouped selectors replace the current `.donc-v2` blocks.
3. No changes to Return/Damaged, unscoped CSS, routes, Supabase, or business logic.
4. Verify: `SheetTab.characterization.test.jsx` + browser smoke at 1440px for Đơn C, Đơn DTP, Return, Damaged.

**Non-goals**: Redesign Return, Tổng đơn, Damaged, mobile, or unscoped CSS. No new components.

**Constraints**: Branch `vinh-phu` → `master` after Cursor audit; browser verification at 1440px.

## next
ADVICE_READY: docs/reports/dtp-wave-2-advise.md
