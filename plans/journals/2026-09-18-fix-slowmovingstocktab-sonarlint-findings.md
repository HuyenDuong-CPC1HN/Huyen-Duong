---
title: fix SlowMovingStockTab sonarlint findings
date: 2026-09-18
summary: "Replaced find-as-boolean, FileReader, untyped sort, and non-native dropzone in SlowMovingStockTab."
---

# fix SlowMovingStockTab sonarlint findings

## What happened

SonarLint on SlowMovingStockTab: S7754 find-as-boolean, S7756 FileReader, S2871 untyped sort, S6848/S1082 clickable div.

## Decision

`some()` for existence. `file.arrayBuffer()`. `localeCompare('vi')` for kho codes. Empty dropzone is a `<label>` wrapping the file input.

## Verification

ESLint clean. App characterization 15/15.

## Next steps

None. No commit (not authorized).

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
