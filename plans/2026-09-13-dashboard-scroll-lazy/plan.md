---
title: "Dashboard smooth-scroll + Tab-level React.lazy"
description: "Add scroll-behavior: smooth to .dashboard-main with reduced-motion guard; split TongDonTab and SheetTab into lazy-loaded chunks via React.lazy at their tab-mount points in AppContent."
status: completed
priority: P2
effort: 2h
branch: vinh-phu
tags: [css, performance, lazy-loading, react]
created: 2026-09-13
---

## Outcomes

1. `.dashboard-main` scrolls smoothly; `prefers-reduced-motion` users get instant scroll.
2. `TongDonTab` and `SheetTab` each load on demand as separate chunks; Return/Damaged stay static.
3. No regressions in tab leave-and-return state, saved-report overflow, or any other component.

---

## Non-Goals (strict — no changes)

| Symbol / File | Reason |
|---|---|
| `ReturnTrackingTab` (lines 13, 437–438 `App.jsx`) | Explicitly out of scope |
| `DamagedGoodsTrackingTab` (lines 14, 439–441 `App.jsx`) | Explicitly out of scope |
| `.sheet-tab-report`, `.sheet-tab-col--right`, `.tongdon-period-grid`, `.tongdon-week-details`, any nested scroller | Saved-report overflow contracts must not change |
| Any data, Supabase, storage, or test file | Out of scope |
| Any internal scroller `overflow` or `scroll-behavior` | Breaks saved-report UX |
| Bundle-splitting for Return/Damaged | YAGNI |

---

## Allowed Source Edits

### Edit 1 — `src/index.css`

Append to the `.dashboard-main` rule (line 427):

```css
.dashboard-main {
  flex: 1;
  overflow-y: auto;
  background: #fafafa;
  padding: 24px;
  outline: none;
  scroll-behavior: smooth; /* ← add */
}

@media (prefers-reduced-motion: reduce) {
  .dashboard-main {
    scroll-behavior: auto;
  }
}
```

No other selector, no other file.

### Edit 2 — `src/App.jsx`

In `AppContent` (lines 255–447), convert two static imports to lazy references and wrap each render site with its own `<Suspense fallback={null}>`.

**Import lines to change (lines 1, 6, 8):**

```diff
- import { useEffect, useRef, useState } from 'react'
+ import { lazy, Suspense, useEffect, useRef, useState } from 'react'
- import SheetTab from './components/SheetTab'
- import TongDonTab from './components/TongDonTab'
+ const SheetTab   = lazy(() => import('./components/SheetTab'))
+ const TongDonTab = lazy(() => import('./components/TongDonTab'))
```

**Render sites in `AppContent` (lines 429–431):**

```diff
- {active === 'tongdon'  && <TongDonTab onNavigate={setActive} />}
- {active === 'donC'    && <SheetTab type="donC" />}
- {active === 'donDTP'  && <SheetTab type="donDTP" />}
+ {active === 'tongdon'  && <Suspense fallback={null}><TongDonTab onNavigate={setActive} /></Suspense>}
+ {active === 'donC'    && <Suspense fallback={null}><SheetTab type="donC" /></Suspense>}
+ {active === 'donDTP'  && <Suspense fallback={null}><SheetTab type="donDTP" /></Suspense>}
```

Return/Damaged (`ReturnTrackingTab`, `DamagedGoodsTrackingTab`) remain static imports and unconditional renders — no Suspense, no lazy.

---

## Phase 1 — Pre-Change Lifecycle Characterization via Source Inspection

**Note:** GitNexus MCP and LSP were unavailable at plan time. Evidence is derived from direct source inspection of `src/App.jsx`.

### Static Proof of Unmount

The conditional rendering pattern in `AppContent` (`src/App.jsx:429–431`) is:

```jsx
{active === 'tongdon'  && <TongDonTab onNavigate={setActive} />}
{active === 'donC'    && <SheetTab type="donC" />}
{active === 'donDTP'  && <SheetTab type="donDTP" />}
```

The `active` state (`App.jsx:256`) is a plain `useState` with no persistence layer outside the session. When the user navigates to a different tab, `active` changes to a different value — the `&&` expression evaluates to `false` — and React unmounts the subtree. There is no `memo`, no context-wrapped keepalive, no portal, and no state hoisting between tab switches.

**Conclusion from source inspection:** Both `TongDonTab` and `SheetTab` are guaranteed to unmount on every tab switch. No temporary instrumentation is needed to confirm this; the code structure is the proof.

### Pre-Change Desktop Smoke Baseline (manual, no code changes)

Before any edits, run this sequence on the primary desktop browser and record results:

| Step | Action | Record |
|---|---|---|
| 1 | Navigate to TongDon tab (fresh load) | Tab renders; scroll position at top |
| 2 | Open a saved report; scroll to the bottom | Scroll position recorded |
| 3 | Switch to Home tab | TongDon unmounts (confirmed by source inspection) |
| 4 | Return to TongDon tab | Tab re-mounts; check whether saved report is still open and scroll position preserved |
| 5 | Open a saved report in SheetTab (donC); scroll to bottom | Scroll position recorded |
| 6 | Switch away and back | Check scroll position and VC edits survive |

Record all observations as the **pre-change baseline**. This baseline is the reference for Phases 3 and 4 comparison — if state loss occurs post-Suspense that did not occur in baseline, the fallback gate triggers.

### Acceptance Gate

- **Pass:** Source-inspection proof documented and smoke baseline recorded.
- **Block / Reassess:** If saved-report state survives baseline but is lost post-Suspense, the fallback gate in Phase 3/4 triggers and this plan is escalated before shipping.

---

## Phase 2 — CSS Edit: Smooth Scroll

1. Edit `src/index.css` — append `scroll-behavior: smooth` to `.dashboard-main` (line 427).
2. Append `@media (prefers-reduced-motion: reduce)` block that resets `.dashboard-main { scroll-behavior: auto }`.
3. Verify: open `.dashboard-main` in DevTools → Elements → Styles; confirm `scroll-behavior: smooth` is applied.
4. Verify: in DevTools → Rendering → Emulate `prefers-reduced-motion: reduce`; confirm computed style shows `auto`.

---

## Phase 3 — React.lazy Conversion: TongDonTab

1. Add `lazy` and `Suspense` to the `react` import in `src/App.jsx` line 1.
2. Replace static `TongDonTab` import (line 8) with `const TongDonTab = lazy(() => import('./components/TongDonTab'))`.
3. Wrap the `tongdon` render site (line 429) with `<Suspense fallback={null}>`.
4. Verify bundle: `npm run build` — confirm a new `TongDonTab-<hash>.js` chunk appears in `dist/assets/`.
5. Run the Phase 1 leave-and-return smoke-test for TongDon — compare state/saved-report survival against baseline.
6. **Fallback gate:** if state is lost post-Suspense when it was not lost in baseline, revert this phase and escalate. Do not proceed to Phase 4.

---

## Phase 4 — React.lazy Conversion: SheetTab

1. Replace static `SheetTab` import (line 6) with `const SheetTab = lazy(() => import('./components/SheetTab'))`.
2. Wrap `donC` and `donDTP` render sites (lines 430–431) with separate `<Suspense fallback={null}>` instances.
3. Verify bundle: confirm a new `SheetTab-<hash>.js` chunk in `dist/assets/`.
4. Run Phase 1 leave-and-return smoke-test for SheetTab — compare against baseline.
5. **Fallback gate:** same as Phase 3.

---

## Phase 5 — Throttle Test for `fallback={null}`

1. Open DevTools → Performance → CPU throttle to 4×.
2. Open a fresh browser session (clear site data or use Incognito).
3. Navigate directly to TongDon (first visit in session).
4. Observe blank duration before content renders.
5. **Decision gate:** if blank duration is unacceptable and no directly reusable existing per-tab pending pattern is found in `TongDonTab.jsx:949` or `DataTable.jsx:375`, stop and report rather than implementing extra UI. The `fallback={null}` decision remains approved; escalation documents the finding.
6. Repeat for SheetTab first visit.

---

## Phase 6 — Post-Change Verification Order

Execute in this order; stop and revert on any failure.

1. **Code review** of the exact diff (only `src/App.jsx` and `src/index.css` changed).
2. **Limited security scan** of the exact diff: check for hardcoded secrets, eval, innerHTML, or unsanitized user input — none expected in CSS + lazy imports.
3. `npm test && npm run test:ui && npm run build`
4. **Browser smoke (desktop):**
   - [ ] `.dashboard-main` scrolls smoothly.
   - [ ] `prefers-reduced-motion: reduce` uses instant scroll.
   - [ ] TongDon saved-report overflow behaves identically to before.
   - [ ] SheetTab saved-report overflow behaves identically to before.
   - [ ] Tab leave-and-return state preserved (scroll, drafts, panel open/closed).
   - [ ] No console errors on any tab switch.
5. **Verify generated chunks:** DevTools → Network tab confirms `TongDonTab-<hash>.js` and `SheetTab-<hash>.js` load on demand.

---

## Rollback Contingency

If any verification step fails:

Document the failure in `plans/2026-09-13-dashboard-scroll-lazy/reports/`. The rollback path is a pure file restore: reverting `src/App.jsx` and `src/index.css` to their pre-change state undoes every edit in this plan. No migration of data, storage, or Supabase state is needed.

---

## AppContent Tab Conditional Rendering Reference

```
AppContent (App.jsx:255)
  └─ renders <main className="dashboard-main">
       ├─ active==='home'     → <HomeBrief />           (static)
       ├─ active==='tongdon' → <Suspense><TongDonTab /></Suspense>   ← lazy (this plan)
       ├─ active==='donC'    → <Suspense><SheetTab type="donC" /></Suspense>  ← lazy (this plan)
       ├─ active==='donDTP'  → <Suspense><SheetTab type="donDTP" /></Suspense> ← lazy (this plan)
       ├─ active==='tmdt'    → <TmdtTab />              (static)
       ├─ active==='tonkhocandate'       → <ExpiryStockTab />           (static)
       ├─ active==='hangchamluanchuyen'  → <SlowMovingStockTab />       (static)
       ├─ active==='nhaphang' → <NhapHangTab />          (static)
       ├─ active==='doisoatthucte' → <DoiSoatThucTeTab /> (static)
       ├─ active==='traHangC'   → <ReturnTrackingTab />  (static — out of scope)
       ├─ active==='traHangDTP' → <ReturnTrackingTab />  (static — out of scope)
       ├─ active==='hangHuyC'   → <DamagedGoodsTrackingTab />  (static — out of scope)
       ├─ active==='hangHuyDTP' → <DamagedGoodsTrackingTab />  (static — out of scope)
       ├─ active==='hangHuyA'   → <DamagedGoodsTrackingTab />  (static — out of scope)
       └─ active==='guilen8n' → <N8nWebhookForm />      (static)
```

**One internal caller:** `AppContent` (via the conditional render sites at lines 429–431). No other component imports or renders `TongDonTab` or `SheetTab` — source inspection confirms this.

**Conditional lifecycle proof:** `{active === 'tongdon' && <TongDonTab />}` at `App.jsx:429` — the `&&` short-circuit evaluates to `false` when `active !== 'tongdon'`, unmounting the subtree. Same pattern for both `SheetTab` render sites at lines 430–431. No keepalive, no memo, no context bridging between tab switches.

Saved-report selectors relevant to scope (must not change):
- `.tongdon-tab.is-saved-report` → TongDonTab outer wrapper (`TongDonTab.jsx:973`)
- `.tongdon-report` → TongDon saved-report content wrapper (`TongDonTab.jsx:1024`)
- `.sheet-tab-report` → SheetTab saved-report wrapper (`SheetTab.jsx:274+`)

---

## Exact File/Symbol Targets

| File | Line(s) | Symbol / Selector |
|---|---|---|
| `src/index.css` | 427 | `.dashboard-main` — add `scroll-behavior: smooth` |
| `src/index.css` | ~433 | append `@media (prefers-reduced-motion: reduce)` block |
| `src/App.jsx` | 1 | `import { ... }` — add `lazy, Suspense` |
| `src/App.jsx` | 6 | `import SheetTab from './components/SheetTab'` — replace with lazy ref |
| `src/App.jsx` | 8 | `import TongDonTab from './components/TongDonTab'` — replace with lazy ref |
| `src/App.jsx` | 429 | `{active === 'tongdon' && <TongDonTab ...>}` — wrap in Suspense |
| `src/App.jsx` | 430–431 | `{active === 'donC' && <SheetTab ...>}` and `{active === 'donDTP' && <SheetTab ...>}` — wrap each in Suspense |

---

## Open Questions

1. **Tab mount baseline:** confirmed by source inspection — `active === ... && <Tab>` unconditionally unmounts inactive tabs. No temporary instrumentation required. Pre-change smoke baseline must be recorded manually before Phase 2.
2. **Throttle blank duration:** `fallback={null}` is approved contingent on the Phase 5 throttle test. If blank is unacceptable and no existing per-tab pending pattern is directly reusable, stop and report rather than implementing new UI. The fallback component sketch is intentionally omitted from this plan.

---

## Execution result

- `fallback={null}` exceeded the Phase 5 blank-time gate; after the user-approved escalation, both lazy tab boundaries use the existing App-level `.app-loading-state` instead.
- Browser Relay verified the fallback on the authenticated dashboard, normal and reduced-motion computed scroll behavior, tab lifecycle, and saved-report overflow; the QA tab was restored to Home with normal network settings.
- Scoped code review and scoped static security review passed. `npm test` (5), `npm run test:ui` (153), and `npm run build` passed; production output contains separate `TongDonTab` and `SheetTab` chunks.

*Plan generated 2026-09-13. Advisory baseline: `docs/reports/2026-09-13-advise-dashboard-scroll-lazy.md`.*
*GitNexus MCP and LSP were unavailable at plan time; evidence is derived from direct source inspection.*
