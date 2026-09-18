# advise-state
phase: complete
input: CSS smooth scrolling + tab-level React.lazy/Suspense for TongDon, SheetTab, Return, Damaged; preserve prefers-reduced-motion; preserve SheetTab/TongDon saved-report scroll contracts
flags: --yagni --md --agent

## scout-findings
- `.dashboard-main` has `overflow-y: auto` (line 429, index.css) but no `scroll-behavior: smooth`
- No React.lazy anywhere — all 13+ tab components are static imports, all eagerly bundled
- `prefers-reduced-motion: reduce` media query exists (index.css:2395) but targets only login-field transitions, not dashboard scroll
- SheetTab `.sheet-tab.is-saved-report` has complex CSS overflow contracts: `overflow: hidden` on shell, `overflow-y: auto` on `.sheet-tab-report`, `overflow-y: auto` on `.sheet-tab-col--right` — these interact with `.dashboard-main:has(.sheet-tab.is-saved-report) { overflow: hidden }`
- TongDonTab `.tongdon-tab.is-saved-report` has a matching pattern with its own `.tongdon-period-grid` and `.tongdon-week-details` overflow layers
- Neither TongDonTab, SheetTab, Return, nor Damaged tabs appear in any characterization test file, making regression risk harder to detect
- All other tabs (home, nhaphang, doisoatthucte, tonkhocandate, etc.) are simpler/lighter

## qa-log
- Q1: Scroll scope (page-level only vs all panels vs investigate first) -> A1: Dashboard only — apply smooth scrolling only to .dashboard-main and leave all internal panel/report scrollers unchanged.
- Q2: Lazy-load state preservation risk — if SheetTab/TongDon are React.lazy and a user has draft/saved-report state, does the Suspense boundary preserve component state on re-mount, or does it re-initialize from scratch? -> A2: Existing tab state behavior is the contract. Before implementation, inspect/smoke-test current leave-and-return behavior and preserve it; do not assume reset or retention.
- Q3: Which lazy-split scope (all 4, TongDon+SheetTab only, or skip entirely) -> A3: YAGNI deferred — contract constraint narrows scope to TongDon + SheetTab only. Return and Damaged are out under YAGNI; complexity rationale not provided, so do not include them.

## reframing-draft
problem: Dashboard lacks smooth-scrolling; Tab-level lazy-loading proposed for TongDon, SheetTab, Return, Damaged
requirements:
  - Smooth scroll on `.dashboard-main` only
  - Respect `prefers-reduced-motion`
  - Preserve SheetTab/TongDon saved-report scroll/overflow contracts
  - Preserve existing tab leave-and-return state behavior
  - Lazy-split TongDon and SheetTab with React.lazy/Suspense (Return and Damaged out under YAGNI)
non-goals:
  - No mobile redesign
  - No data/storage changes
  - No changes to internal panel/report scrollers
  - Return and Damaged tabs excluded — no stated complexity justification
constraints:
  - No test coverage for TongDonTab or SheetTab
  - React.lazy introduces Suspense boundary — must verify state preservation on re-mount before shipping
  - Return and Damaged are out; do not add them without explicit complexity evidence

## output
report: docs/reports/2026-09-13-advise-dashboard-scroll-lazy.md
