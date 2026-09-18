---
title: fix NhapHangTab SonarLint includes and complexity
date: 2026-09-18
summary: Replaced indexOf existence checks with includes and extracted NhapHangTab branches so cognitive complexity drops under 15.
---

# fix NhapHangTab SonarLint includes and complexity

## What happened

SonarLint on `src/components/NhapHangTab.jsx` reported:
- javascript:S7765 at lines 31–32: `indexOf(...) !== -1` for substring existence
- javascript:S3776 at `NhapHangTab`: Cognitive Complexity 18 (allowed 15)

## Decision

`matchesHistoryRow` now uses `.includes()`. History matching, empty-state UI, kien-check banner, and stored-active-id lookup moved to module-level helpers so those branches no longer count on `NhapHangTab`. Match behavior is unchanged (`includes` ≡ `indexOf !== -1`).

## Verification

`npx eslint src/components/NhapHangTab.jsx` clean. App characterization 15/15. Throwaway history-match smoke passed. GitNexus MCP was not mounted; manual blast radius is this file plus `App.jsx` mount. IDE SonarLint needs a re-scan.

## Next steps

None. No commit (not authorized).

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
