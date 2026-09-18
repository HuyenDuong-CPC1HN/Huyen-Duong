# Advisory: Dashboard Smooth-Scroll + Tab-Level Lazy Loading

**Date:** 2026-09-13
**Flags:** `--yagni --md --agent`
**Status:** ADVISORY ONLY — do not execute until reviewed and approved by user or Cursor agent.

---

## Verdict

**Proceed** with the scoped implementation — but only after the smoke-test step that validates existing tab leave-and-return behavior. Two changes, two small CSS rules, one lazy boundary pair. The remaining risk lives entirely in whether switching away from and back to TongDon or SheetTab destroys saved-report scroll state; that must be answered before shipping.

---

## What You Should Do

### 1. Smooth scroll on `.dashboard-main` only

- Add `scroll-behavior: smooth` to `.dashboard-main` in `index.css` (near line 429 where `overflow-y: auto` lives)
- Wrap it in a `@media (prefers-reduced-motion: reduce)` guard so users with `reduce` get instant scroll (no animation)
- Touch **no other** scroller: `.sheet-tab-report`, `.sheet-tab-col--right`, `.tongdon-period-grid`, `.tongdon-week-details`, or any internal panel

### 2. Lazy-split TongDon and SheetTab only

- Replace the two static imports with `React.lazy(() => import(...))`
- Wrap each in its own `<Suspense fallback={null}>` at the **tab-mount point** (not at a higher level)
- `fallback={null}` shows no explicit loading indicator while the chunk loads; the tab stays blank briefly — this is a deliberate UX trade-off. Under throttling (e.g., 4× CPU or slow network), confirm the blank duration is acceptable. If not, choose an existing minimal pending pattern (e.g., a skeleton, inline spinner, or a single `<Spinner>` component already in the design system) before shipping.

### 3. Before shipping: smoke-test tab state preservation

- Manually exercise every tab-leave-and-return path for TongDon and SheetTab (both with and without a saved-report open)
- Verify that scroll position, draft content, and panel-open state survive switching away and back
- Characterize the mount/unmount behavior of the tab architecture **before** adding Suspense, then compare **after** — Suspense placement does not inherently destroy state; what matters is whether the changed mount tree (Suspense wrapper at the tab-mount point) alters the existing mounted/unmounted lifecycle
- If the mount tree characterization shows the tab was already unmounted when inactive, Suspense adds no new state-loss risk; if the tab was previously kept mounted, adding a Suspense boundary at the tab-mount point must be reviewed to ensure it does not newly introduce an unmount/remount cycle
- If state is lost on return, it means the tab-mount architecture unmounts the component when inactive; in that case either defer the lazy-split or add a higher-level wrapper that keeps the component tree alive (so the Suspense boundary never re-mounts a component that has state)

---

## What You Should Not Do

| Do not | Reason |
|--------|--------|
| Add smooth scroll to internal panels or report scrollers | These have existing overflow contracts; smooth scroll there breaks saved-report UX |
| Touch `Return` or `Damaged` tabs | Explicitly out of scope under YAGNI; no complexity justification provided |
| Add lazy loading to `Return` or `Damaged` | Same — scope is TongDon + SheetTab only |
| Add a visual loading spinner for Suspense | Would be a new UI surface unless you first verify the blank-tab duration under throttling is unacceptable and no existing pattern fits |
| Assume tab state is preserved without testing | No test coverage exists for TongDon or SheetTab; assumption is the risk |
| Change any data, storage, or Supabase layer | Out of scope |
| Redesign mobile layout | Out of scope |
| Add DataTable virtualization | Out of scope |
| Ship without `prefers-reduced-motion` guard | Accessibility regression |

---

## Better / More Efficient Alternatives

| Alternative | Why not (yet) |
|-------------|---------------|
| Lazy-split all four tabs (TongDon + SheetTab + Return + Damaged) | YAGNI: Return and Damaged have no stated complexity; complexity argument must come from user before expanding scope |
| A single shared `<Suspense>` wrapper above all tabs | Too coarse; one failing/loading tab would hide all others |
| Intersection Observer for per-tab lazy loading | Overkill for 2 tabs; React.lazy is the idiomatic, zero-overhead solution here |
| `scroll-behavior: smooth` via JavaScript | More fragile than one CSS declaration; CSS is the right tool |
| Adding a skeleton loader | New UI surface; not requested unless throttling shows `fallback={null}` blank duration is unacceptable |

---

## Recommended Route

```
CSS (index.css)
  .dashboard-main { scroll-behavior: smooth }
  @media (prefers-reduced-motion: reduce) {
    .dashboard-main { scroll-behavior: auto }
  }

React (dashboard component)
  const TongDonTab = React.lazy(() => import('./TongDonTab'))
  const SheetTab   = React.lazy(() => import('./SheetTab'))

  <Suspense fallback={null}><TongDonTab ... /></Suspense>
  <Suspense fallback={null}><SheetTab   ... /></Suspense>

Before shipping:
  1. Characterize current tab mount/unmount behavior (is the tab kept mounted or
     unmounted when inactive?) — this is the baseline.
  2. Apply Suspense; compare the mount tree after the change.
  3. Smoke-test every tab return path with saved-report state.
  4. Throttle first-tab visit (4× CPU or slow network); confirm blank duration
     under fallback={null} is acceptable, or select an existing pending pattern.
```

---

## Benefits

- **Smooth scroll** improves dashboard navigation feel with minimal diff (2–3 lines of CSS)
- **Reduced-motion guard** keeps the site accessible and avoids vestibular triggers
- **React.lazy** defers TongDon and SheetTab to separate chunks, reducing the initial bundle; the scout found these tabs have complex saved-report contracts (scroll, draft, panel state), which is the stated reason for splitting them — not verified resource weight or user dwell time
- **Scope discipline** (TongDon + SheetTab only) avoids YAGNI risk from Return and Damaged
- **No internal scroller changes** preserves all existing saved-report overflow contracts

---

## Trade-offs

| Trade-off | Severity |
|-----------|----------|
| `fallback={null}` produces a blank tab while the chunk loads on first visit. Under throttling (4× CPU or slow network), the blank duration must be verified acceptable — if not, an existing minimal pending pattern (skeleton, inline spinner, or existing Spinner component) is required before shipping. This is a deliberate scope/UX trade-off, not a claim that it matches eager render behavior. | Medium — must validate under throttling |
| If the changed mount tree (Suspense at the tab-mount point) newly introduces or alters an unmount/remount cycle compared to the current architecture, component state (scroll, drafts) will be lost on return. Characterize the current tab mount behavior before and compare after — Suspense placement does not inherently reset state; the specific mount tree change does. Smoke-test required before shipping. | Medium — showstopper if state is lost |
| No test coverage for TongDon or SheetTab; regressions are undetected until manual QA | Medium — document manual test steps |
| Return and Damaged remain eagerly bundled | Low — YAGNI, not a problem until proven otherwise |
| CSS `scroll-behavior: smooth` has limited browser support in very old Edge; graceful degradation is `auto` | Negligible |

---

## Work Checklist

- [ ] **1. Add `scroll-behavior: smooth` to `.dashboard-main` in `index.css`**
  - Locate `overflow-y: auto` rule (≈ line 429)
  - Add `scroll-behavior: smooth` on the same selector
  - Add `@media (prefers-reduced-motion: reduce)` override to `auto`

- [ ] **2. Characterize current tab mount/unmount behavior (baseline)**
  - Determine whether TongDon/SheetTab are kept mounted or unmounted when inactive under the current architecture
  - This is the baseline for comparing post-Suspense behavior

- [ ] **3. Smoke-test existing tab leave-and-return behavior**
  - Open TongDon tab → open a saved report (any) → switch to another tab → switch back
  - Repeat for SheetTab
  - Confirm scroll position, panel state, and draft content survive the round-trip
  - Document findings before proceeding

- [ ] **4. Convert TongDon import to `React.lazy`**
  - Change `import TongDonTab from './TongDonTab'` → `const TongDonTab = React.lazy(() => import('./TongDonTab'))`
  - Wrap `<TongDonTab ...>` in `<Suspense fallback={null}>`
  - Verify mount tree behavior matches baseline; verify smoke-test still passes

- [ ] **5. Convert SheetTab import to `React.lazy`**
  - Same pattern as step 4
  - Verify smoke-test still passes

- [ ] **6. Throttle-test `fallback={null}` on first tab visit**
  - Use Chrome DevTools CPU 4× or Network throttling
  - Visit TongDon or SheetTab for the first time in the session
  - Confirm the blank duration is acceptable
  - If not acceptable, add an existing minimal pending pattern before shipping

- [ ] **7. Do NOT touch Return or Damaged**
  - Leave their static imports as-is
  - If asked to add them later, request complexity evidence first

- [ ] **8. Final manual verification**
  - Dashboard loads and scrolls smoothly (Chrome, Firefox, Edge)
  - `prefers-reduced-motion: reduce` falls back to instant scroll
  - TongDon saved-report overflow behaves identically to before
  - SheetTab saved-report overflow behaves identically to before
  - No console errors on tab switch

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Smooth scroll applies to `.dashboard-main` only | Verified by CSS inspection + browser manual test |
| `prefers-reduced-motion: reduce` disables animation | Browser DevTools emulation test passes |
| TongDon and SheetTab bundle chunks are separate | Network tab shows `<chunk>.js` for each |
| No regressions in saved-report overflow behavior | Manual smoke-test, steps 3+8 |
| Tab leave-and-return state preserved (post-change mount tree matches baseline) | Manual smoke-test, steps 3+8, with before/after comparison |
| `fallback={null}` blank duration acceptable under throttling, or existing minimal pending pattern added | Throttle test, step 6 |
| Return and Damaged remain unchanged | Static imports intact, no new files touched |

---

*Report generated by `ak:advise` workflow. This is advisory only — implementation should be handed to a Cursor agent with this report attached and explicit user approval of the checklist.*
