---
title: "feat: scoped DTP Admin v2 presentation"
type: feat
status: ready
created: 2026-09-13
execution: omp
origin: docs/reports/dtp-wave-2-advise.md
---

# Wave 2 DTP scoped presentation

## Outcome
Give loaded and empty Đơn DTP surfaces the already-merged Admin v2 Geist presentation while keeping every DTP data, storage, report, export, table, and route behavior unchanged.

## Scope and boundaries

| File | Allowed change |
| --- | --- |
| `src/components/SheetTab.jsx` | Add a root presentation class based strictly on `type`: `donC` gets `.donc-v2`, `donDTP` gets `.dtp-v2`, all other types get neither. Apply the same rule to the empty and loaded branches. |
| `src/index.css` | Extend every existing `.donc-v2` selector to a grouped `.donc-v2`/`.dtp-v2` selector without duplicated declaration blocks. Preserve descendant selector paths. |
| `src/components/__tests__/SheetTab.characterization.test.jsx` | Add only behavior assertions that defend the new type-to-class contract for loaded and empty states. |

No changes to Return, Damaged, unscoped `.sheet-tab-*`/`.report-*`, business logic, data contracts, Supabase, routes, storage keys, Tổng đơn, mobile layout, components, dependencies, lockfiles, commits, or pushes.

## Implementation

1. In `SheetTab`, derive the DTP predicate directly from `type === 'donDTP'` beside the existing Don C predicate.
2. Apply an exclusive presentation-class expression in both roots:
   - `donC` → `.donc-v2` (and `.donc-v2--empty` on its empty-state root)
   - `donDTP` → `.dtp-v2` (and `.dtp-v2--empty` on its empty-state root)
   - other type → no v2 marker
   Never use `${isDonC ? 'donc-v2' : 'dtp-v2'}`.
3. Convert every `.donc-v2` rule in `index.css` once:
   - Root: `.donc-v2 {}` → `.donc-v2, .dtp-v2 {}`.
   - Empty-state modifier: `.donc-v2--empty {}` → `.donc-v2--empty, .dtp-v2--empty {}`.
   - Descendant: `.donc-v2 .child {}` → `.donc-v2 .child, .dtp-v2 .child {}`.
   - Multi-selector rule: preserve every original child selector and add its `.dtp-v2` equivalent before the declaration block.
4. Add concise characterization coverage proving loaded Don C and DTP have their exclusive root classes, and empty Don C/DTP retain their correct roots. Do not test CSS implementation text.

## Risks and controls

- **Type fall-through**: a simple false branch styles any future/non-Don-C type as DTP. Control: exact `type === 'donDTP'` predicate and an assertion for the absence of a v2 class on an unrelated type when the component supports it.
- **Selector widening**: appending bare `, .dtp-v2` to a descendant rule styles the DTP root instead of its child. Control: preserve the full descendant path in every grouped selector.
- **Visual regression**: `.donc-v2` is shared with the already-merged Wave 1 surface. Control: characterization test plus 1440px browser smoke for Đơn C, Đơn DTP, Return, and Damaged.

## Verification

1. Run the focused SheetTab characterization test through Vitest.
2. Run `npm test && npm run test:ui && npm run build`.
3. At 1440px, browser-smoke Đơn C, Đơn DTP, Return, and Damaged. Confirm DTP matches the v2 surface; all other checked surfaces retain their current presentation and behavior.
4. Run a pending-diff code review, then a scoped security review. Do not run Snyk or Sonar; Cursor owns those audits after OMP stops.

## Acceptance

- Don C has `.donc-v2` (and only its Don C empty modifier when empty); DTP has `.dtp-v2` (and only its DTP empty modifier when empty); other types receive neither v2 root marker nor modifier.
- Every `.donc-v2` rule, including its empty-state modifier, is grouped correctly with its full `.dtp-v2` equivalent and no declaration block is copied.
- No out-of-scope app behavior or unscoped styling changes.
- Required review and all verification commands pass.
- No commit or push.
