# Advisory — Wave 2 DTP Presentation

## Verdict

Proceed, but only as an addition to the current `vinh-phu` Admin v2 change set. The scope is genuinely small — a one-file CSS refactor plus a one-line JSX change — and it removes a visible daily inconsistency. The Wave 1 Đơn C composition is present and stable enough to reuse on `vinh-phu`, but it is not yet merged to `master`; DTP must therefore remain in the same Cursor audit and merge cycle. The meaningful risk is accidental regression of Đơn C, Return, or Damaged, contained by preserving unscoped selectors and running the characterization suite plus browser smoke.

## Confirmed reframing

**Problem**: On `vinh-phu`, Đơn DTP renders under the old warm/cpc-blue surfaces while Đơn C uses the Admin v2 Geist styling. Users reviewing the current Admin v2 change set see two product tabs with visibly mismatched visual quality — a cognitive inconsistency with high daily visibility.

**Requirements**:
1. `src/components/SheetTab.jsx`: Đơn C keeps `.donc-v2` only. Đơn DTP adds `.dtp-v2` only. No other type gets either class.
2. `src/index.css`: refactor every existing `.donc-v2` rule into grouped selectors `.donc-v2, .dtp-v2 { ... }` (for root-level rules) or `.donc-v2 .child, .dtp-v2 .child { ... }` (for descendant rules) so both types share the same declared values without duplicating declaration blocks. The grouped selectors replace the current `.donc-v2` blocks.
3. No changes to Return, Damaged, unscoped `.sheet-tab-*`, or `.report-*` CSS.
4. No changes to business logic, data contracts, Supabase calls, routes, or storage keys.
5. Verify: run `SheetTab.characterization.test.jsx` plus browser smoke at 1440px for Đơn C, Đơn DTP, Return, Damaged.

**Non-goals**: Redesign Return, Tổng đơn, Damaged, mobile, or unscoped CSS. No new components, shadcn primitives, or behavior changes.

**Constraints**: The Admin v2 Geist Wave 1 work exists on `vinh-phu` / `feat/admin-v2-geist-ui-map` and is not merged to `master`. Keep Wave 2 DTP on `vinh-phu`; Cursor must audit the combined scope before its single merge to `master`.

## What to do

1. **Inspect `index.css` `.donc-v2` block** (lines ~1883–2004+). List every unique `.donc-v2` selector — both root-level (`.donc-v2 { ... }`) and descendant (`.donc-v2 .sheet-tab-shell`, `.donc-v2 .sheet-tab-context`, etc.). Confirm all are purely presentational (color, border, radius, padding, shadow) — no layout rules that might affect Return or Damaged.
2. **Fix `SheetTab.jsx`** in the root `<div>` class expression. The original is `${isDonC ? 'donc-v2' : ''}`. Change it to add `.dtp-v2` only when `type === 'donDTP'`, and nothing for any other type:
   ```
   `${type === 'donC' ? 'donc-v2' : type === 'donDTP' ? 'dtp-v2' : ''}`
   ```
   Or equivalently using the existing `isDonC` boolean:
   ```
   `${isDonC ? 'donc-v2' : type === 'donDTP' ? 'dtp-v2' : ''}`
   ```
   This ensures TMĐT, Tổng đơn, Nhập hàng, and any future type receive no class.
3. **Refactor CSS — root-level rules**: for each `.donc-v2 { ... }` rule, convert to a grouped selector:
   `.donc-v2 { ... }` → `.donc-v2, .dtp-v2 { ... }`
4. **Refactor CSS — descendant rules**: for each `.donc-v2 .child { ... }` rule, convert to a sibling grouped selector:
   `.donc-v2 .sheet-tab-shell { ... }` → `.donc-v2 .sheet-tab-shell, .dtp-v2 .sheet-tab-shell { ... }`
   `.donc-v2 .report-kpi { ... }` → `.donc-v2 .report-kpi, .dtp-v2 .report-kpi { ... }`
   Do not append `, .dtp-v2` directly to a descendant selector's parent — that produces `.donc-v2 .sheet-tab-shell, .dtp-v2`, which is invalid.
   No new blocks. Delete no existing rules — replace `.donc-v2` with the grouped form.
5. **Smoke test**: run `npm test` (or the specific test file) and launch the app at 1440px. Verify Đơn C still looks correct, Đơn DTP now matches it, Return and Damaged are unchanged.
6. **Hand off the combined Admin v2 scope to Cursor** for review and Snyk audit before the single merge from `vinh-phu` to `master`.

## What not to do

- Do not use `${isDonC ? 'donc-v2' : 'dtp-v2'}` — that applies `.dtp-v2` to every non-DonC type, including TMĐT, Tổng đơn, and Nhập hàng.
- Do not append `, .dtp-v2` as a bare sibling selector to descendant rules. `.donc-v2 .sheet-tab-shell, .dtp-v2` is invalid CSS and matches nothing. Always form the sibling as `.dtp-v2 .child-selector`.
- Do not copy `.donc-v2` blocks into new `.dtp-v2` blocks. That doubles maintenance surface for no benefit.
- Do not add `.dtp-v2` classes to any element inside `SheetTab` beyond the root. The descendant rules already exist and inherit from the root class via the grouped selector.
- Do not change any `ThongKeGiaoHang`, `ThongKeDoiTac`, `DataTable`, `SheetReportPanel`, or `useSheetReportActions` — they are outside the confirmed presentation-only scope.
- Do not refactor or clean up adjacent unscoped `.sheet-tab-*` rules "while you're in there."

## What could be better

- **CSS custom properties** (`--v2-surface-bg`, `--v2-border-color`, etc.) would let both classes reference the same tokens without even touching selectors. That is a larger refactor and is out of scope for this wave — note it as a follow-up if the pattern spreads to more tabs.
- **A shared `.admin-v2` utility class** at a higher level of the component tree could replace both `.donc-v2` and `.dtp-v2` entirely, but that requires checking every consumer of those classes and is premature until a third tab adopts the same look.
- **Grouping by layout vs. color** in the CSS (first the structural rules, then the visual overrides) would make future additions faster — but that is a refactor, not a requirement.

## Benefits

- Users see one consistent Admin v2 Geist look across both Đơn C and Đơn DTP immediately.
- The CSS change is a single pass: for each existing `.donc-v2` rule, convert it to the grouped form — mechanically straightforward, fully auditable by diff.
- Zero risk to Return, Damaged, or any other surface because unscoped selectors are untouched.
- The existing `.donc-v2` composition is already implemented and locally verifiable on the current Admin v2 branch; DTP can reuse the declared values unchanged.
- The characterization test suite already covers both types — it serves as a regression guard without modification.

## Trade-offs

- **Identical CSS under two names** is mild duplication of intent. If a third tab adopts the same look, a shared class becomes worthwhile. The cost of the current approach is low but non-zero.
- **Unmerged dependency**: Đơn C and DTP remain coupled until the current Admin v2 work reaches `master`. Any Wave 1 change before Cursor audit must be reviewed against DTP too; that is why the two changes must share one audit and merge cycle.
- **No browser smoke in CI**: the characterization tests run in Node, not a real browser. The 1440px check is manual. If future CI adds visual regression, this gap closes.
- **Recommendation conditional**: proceed with grouped selectors only while DTP remains in the same `vinh-phu` change set. If it must move to a different branch or Wave 1 changes materially, re-check the composition and merge plan first.

## Work checklist

- [ ] List every `.donc-v2` selector in `index.css` (~lines 1883–2004+); distinguish root-level from descendant rules; confirm all are presentational.
- [ ] In `SheetTab.jsx`: change `${isDonC ? 'donc-v2' : ''}` to `${isDonC ? 'donc-v2' : type === 'donDTP' ? 'dtp-v2' : ''}` in the root `<div>` class expression. Verify no other type (TMDT, Tổng đơn, etc.) receives either class.
- [ ] In `index.css`: for each root-level `.donc-v2 { ... }` rule, replace with `.donc-v2, .dtp-v2 { ... }`. For each descendant `.donc-v2 .child { ... }` rule, replace with `.donc-v2 .child, .dtp-v2 .child { ... }`. No new blocks, no deletions.
- [ ] Run `SheetTab.characterization.test.jsx` — must pass for both DonC and DonDTP suites.
- [ ] Browser smoke at 1440px: verify Đơn C, Đơn DTP, Return, Damaged. No visual regression. Confirm TMĐT and Tổng đơn surfaces are unchanged and classless.
- [ ] `npm run build` — must produce a clean build.
- [ ] Hand off the combined Admin v2 scope to Cursor for review and Snyk scan before the single `vinh-phu` → `master` merge.

## Success metrics

- `npm test` passes including `SheetTab.characterization.test.jsx` for both `donC` and `donDTP` types.
- `npm run build` exits with code 0.
- Browser at 1440px: Đơn DTP surface matches Đơn C pixel-for-pixel in layout, color, and spacing.
- Browser at 1440px: Return tracking and Damaged goods surfaces are visually unchanged from before the CSS edit.
- Browser at 1440px: TMĐT, Tổng đơn, and other non-DonC/non-DTP surfaces receive no class and are visually unchanged.
- No new class names introduced beyond `.dtp-v2` on the SheetTab root for `type === 'donDTP'`.
- No change to any route, storage key, Supabase call, or business logic file.
- Cursor audit completes for the combined Admin v2 Wave 1 plus DTP scope before `vinh-phu` merges to `master`.
