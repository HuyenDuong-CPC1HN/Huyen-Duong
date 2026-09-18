# Advisory — Admin v2 Geist UI map

## Verdict
Proceed, but only as a planned visual migration: global Geist shell, HomeBrief hybrid, and an isolated Đơn C presentation branch. Cooking directly is wrong because the current implementation shares `SheetTab`, `.sheet-tab-*`, and `.report-*` with DTP, return tracking, and damaged-goods flows. The visual target is sufficiently complete; the behavior target is the existing app, not the static mock.

## Verified evidence
- `C:/Users/PhuTV/Downloads/Landing page design component/CPC1HN Admin v2 Geist.dc.html` contains the Admin v2 shell, `#home`, and a dedicated inline `#donc` mock.
- `CPC1HN Ops Home.dc.html` provides the Home information architecture, but uses the old warm/Inter visual system.
- `src/App.jsx` owns universal `.dashboard-*` shell chrome for every route.
- `src/components/SheetTab.jsx` is shared by Đơn C and DTP. Shared `.sheet-tab-*` and `.report-*` CSS is also consumed by return-tracking and damaged-goods surfaces.

## Confirmed requirements
1. Apply Admin v2 Geist shell chrome globally to all routes.
2. Map HomeBrief using Ops Home information architecture with Admin v2 Geist typography, surfaces, spacing, controls, and states.
3. Map Giao hàng Đơn C with a Don-C-only presentation branch/namespace while retaining existing data, actions, storage keys, and Supabase behavior.
4. Keep DTP, return tracking, damaged goods, Tổng đơn, TMĐT, Nhập hàng, and other tab content designs unchanged.
5. Add shadcn/21st primitives only when a mock requires one missing primitive.
6. Target 1440px fidelity; preserve existing mobile/tablet responsive behavior without redesigning it.

## Non-goals
- Change business logic, data contracts, Supabase calls, report/export behavior, routes, or storage keys.
- Redesign mobile/tablet or any tab outside Shell, HomeBrief, and Đơn C.
- Restyle generic `.sheet-tab-*` or `.report-*` selectors to achieve the Đơn C look.

## What to do
1. Run `ak:plan` before `ak:cook`. The plan must map the three exact prototype artifacts and the current App/Home/SheetTab/CSS owners.
2. Treat Admin v2 as the visual source of truth. Treat Ops Home as information architecture only; do not reintroduce warm `#f4f3ee` or Inter styling.
3. Change `.dashboard-*` intentionally as a global shell migration, then smoke every route for navigation/layout regression.
4. Add a Don-C-only root marker and put every new Đơn C selector beneath it. Branch/extract presentation only for `type === 'donC'`; retain the existing DTP path and shared report children.
5. Verify actual browser surfaces at 1440px: shell, HomeBrief, Đơn C, DTP, return tracking, and damaged goods.

## What not to do
- Do not cook directly from the mock: it does not describe dynamic behavior.
- Do not infer search, refresh, export, table, or state behavior from the static `#donc` HTML.
- Do not alter unscoped `.sheet-tab-*`, `.report-*`, `:root`, or body rules for Đơn C.
- Do not add shadcn/21st components speculatively or migrate shared components to them.

## Is `ak:frontend-design` needed?
Yes. Use it during the design-map step to translate the mock into existing React/CSS ownership without inventing UI. It should follow the prototype inspection and feed `ak:plan`; it is not a replacement for the plan or a reason to cook directly.

## Recommended execution route
`ak:frontend-design` (prototype-to-current-UI design map) → `ak:plan` (file ownership, scoped CSS/JSX contract, visual acceptance) → `ak:cook` (only accepted phases) → code review → security gate → Snyk test + Snyk Code → browser verification + `npm test && npm run build` → stop for Cursor audit.

## Benefits
- One coherent Geist shell while preserving all existing operational behavior.
- High-fidelity Đơn C without breaking DTP or other consumers of shared CSS.
- Home preserves established operations information architecture instead of adopting a static marketing-like mock blindly.

## Trade-offs
- A Don-C-specific presentation path is more code than CSS-only styling, but it is the smallest safe boundary for fidelity.
- Global shell migration necessarily changes chrome on out-of-scope routes; their content is protected, not their surrounding frame.
- Static mocks do not specify dynamic states; fidelity stops at visual composition, not invented workflow.

## Work checklist
- [ ] Inspect and annotate the Admin v2, Ops Home, and inline `#donc` prototype sections.
- [ ] Plan global shell boundaries and every affected route smoke check.
- [ ] Plan HomeBrief IA/visual split and preserve channel derivation/navigation semantics.
- [ ] Plan Don-C-only root marker, scoped CSS, and presentation branch while retaining existing data/actions.
- [ ] Implement only the planned Shell, HomeBrief, and Đơn C surfaces.
- [ ] Verify 1440px shell, HomeBrief, Đơn C, DTP, return tracking, and damaged goods in a real browser.
- [ ] Run review, security/Snyk gates, `npm test`, and production build; stop for Cursor audit.

## Success metrics
- The shell, HomeBrief, and Đơn C match the specified Admin v2 visual source at 1440px without changing observed business behavior.
- DTP, return tracking, and damaged goods preserve their content layout and controls under the new global shell.
- No source change touches Supabase calls, storage key strings, report/export behavior, or shared generic SheetTab/report CSS for a Don-C-only visual goal.
- Browser smoke checks complete for all six named surfaces.
- `npm test` and `npm run build` pass; Snyk Open Source and Snyk Code report no newly introduced issue.
