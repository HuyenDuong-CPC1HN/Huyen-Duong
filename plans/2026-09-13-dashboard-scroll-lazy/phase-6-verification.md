# Phase 6 — Post-Change Verification Order

Execute in this order. Stop and document on any failure.

---

## Step 1 — Code Review

Review the **exact diff** — only two files may be changed:

- `src/App.jsx`
- `src/index.css`

Checklist:

- [ ] No `ReturnTrackingTab` or `DamagedGoodsTrackingTab` imports or render sites touched.
- [ ] No nested scrollers (`.sheet-tab-report`, `.tongdon-period-grid`, etc.) have `scroll-behavior` or `overflow` changes.
- [ ] `lazy` is imported from `react` (not from a third-party library).
- [ ] `Suspense` is imported from `react` alongside `lazy` on the same import line.
- [ ] Each lazy component has its own `<Suspense>` — not one wrapper for both.
- [ ] `fallback={null}` is deliberate; document why in the PR description.
- [ ] No `console.log`, `debugger`, or temporary instrumentation left in source.

---

## Step 2 — Limited Security Scan of Diff

Scan only the changed lines for:

- Hardcoded secrets, credentials, tokens
- `eval()`, `new Function()`, `innerHTML`, `dangerouslySetInnerHTML`
- Unvalidated user input passed to DOM APIs

These patterns are not expected in CSS declarations or lazy import statements; scan is a formality.

No Snyk, Sonar, or dependency vulnerability scan (out of scope per user constraint).

---

## Step 3 — Build and Tests

```bash
npm test
npm run test:ui
npm run build
```

All must pass. A pre-existing test failure in an unrelated test file is out of scope — document and proceed.

---

## Step 4 — Browser Smoke (Desktop)

Run on the available desktop browser(s). Record which browser(s) were tested.

### Smooth scroll

- [ ] Open dashboard; scroll the main content area — smooth animation applies.
- [ ] DevTools → Rendering → Emulate `prefers-reduced-motion: reduce` — scrolling is instant.

### Saved-report overflow (TongDon)

- [ ] Open TongDon tab.
- [ ] Open a saved report.
- [ ] Scroll to the bottom of the report.
- [ ] Switch to Home tab.
- [ ] Return to TongDon — saved report is still open and scroll position is preserved.
- [ ] `.tongdon-tab.is-saved-report` and `.tongdon-report` elements render identically to before.

### Saved-report overflow (SheetTab)

- [ ] Open donC tab.
- [ ] Open a saved report (click one from the week list).
- [ ] Scroll to the bottom of the report table.
- [ ] Switch to another tab.
- [ ] Return to donC — saved report is still open and scroll position is preserved.
- [ ] `.sheet-tab-report` element renders identically to before.

### Tab state

- [ ] TongDon: with no saved report open, switch away and back — selected week survives.
- [ ] SheetTab: switch away and back — active week and VC edits survive.

### Console errors

- [ ] No `Error:`-level console messages on any tab switch.

---

## Step 5 — Verify Generated Chunks

1. Open DevTools → Network tab.
2. Filter by `JS`.
3. Navigate to TongDon tab — confirm a new `TongDonTab-<hash>.js` request appears (only on first visit).
4. Navigate to donC tab — confirm a new `SheetTab-<hash>.js` request appears (only on first visit).
5. Return to TongDon — no second `TongDonTab` request (chunk is cached).
6. `npm run build && cat dist/assets/*.js | wc -l` — verify new chunk files exist in `dist/assets/`.

---

## Rollback Contingency

If any verification step fails:

Document the failure in `plans/2026-09-13-dashboard-scroll-lazy/reports/`. The rollback path is a pure file restore: reverting `src/App.jsx` and `src/index.css` to their pre-change state undoes every edit in this plan. No data migration, storage cleanup, or Supabase changes are needed.

After documenting, re-run the Phase 1 smoke baseline to confirm the app is in its original state, then escalate.
