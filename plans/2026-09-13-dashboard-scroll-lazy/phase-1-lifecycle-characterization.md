# Phase 1 — Pre-Change Tab Lifecycle Characterization

**Goal:** Establish the baseline mount/unmount behaviour of `TongDonTab` and `SheetTab` in `AppContent` before Suspense is introduced.

**Note:** GitNexus MCP and LSP were unavailable at plan time. Evidence is derived from direct source inspection of `src/App.jsx`.

---

## Static Source Inspection

The tab components are rendered via conditional expressions inside `<main className="dashboard-main">` in `AppContent` (`src/App.jsx:429–431`):

```jsx
{active === 'tongdon'  && <TongDonTab onNavigate={setActive} />}
{active === 'donC'    && <SheetTab type="donC" />}
{active === 'donDTP'  && <SheetTab type="donDTP" />}
```

- `active` is a plain `useState` (`App.jsx:256`) with no persistence layer outside the session.
- The `&&` short-circuit evaluates to `false` when `active !== 'tongdon'` (or the relevant value), causing React to unmount the subtree.
- No `memo`, no context-wrapped keepalive, no portal, and no state hoisting between tab switches exists in the source.
- One internal caller: `AppContent` (lines 429–431). Source inspection confirms no other component imports or renders `TongDonTab` or `SheetTab`.

**Conclusion from source inspection:** Both `TongDonTab` and `SheetTab` are guaranteed to unmount on every tab switch. No temporary instrumentation is needed; the code structure is the proof.

---

## Pre-Change Desktop Smoke Baseline (manual, no code changes)

Run this sequence on the primary desktop browser before any edits. Record all observations as the **pre-change baseline** for comparison in Phases 3 and 4.

### TongDonTab baseline

| Step | Action | Record |
|---|---|---|
| 1 | Navigate to TongDon tab (fresh load) | Tab renders; scroll position at top |
| 2 | Open a saved report; scroll to the bottom | Scroll position noted |
| 3 | Switch to Home tab | TongDon unmounts (source-inspection proof) |
| 4 | Return to TongDon tab | Tab re-mounts; check whether saved report is still open and scroll position preserved |
| 5 | With a saved report open, switch away and back | Check scroll position survival |

### SheetTab (donC) baseline

| Step | Action | Record |
|---|---|---|
| 1 | Navigate to donC tab (fresh load) | Tab renders |
| 2 | Open a saved report; note selected week and scroll position | Scroll position and week noted |
| 3 | Switch to another tab | SheetTab unmounts (source-inspection proof) |
| 4 | Return to donC tab | Check scroll position and VC edits survive |

## Interpretation

- **State (scroll, saved report, VC edits) is preserved on return** → the current architecture preserves state. Proceed to Phase 3.
- **State is lost on return** → the current architecture already loses state. Suspense does not make this worse. Proceed to Phase 3.
- **No temporary instrumentation in source is needed** — the `&&` conditional unconditionally unmounts inactive tabs; this is proven by static source inspection, not runtime logging.

## Acceptance Gate

Document the observed pattern and the smoke baseline results. If mount-once behavior were observed (contradicting source inspection), reassess before Phase 3 — but source inspection makes this impossible given the `&&` pattern.
