---
title: fix DataTable lint and SonarLint findings
date: 2026-09-18
summary: "Removed unused useReducer, reset filter query without setState-in-effect, native resize button, string pageSize, stable row keys, extracted cell renderer."
---

# fix DataTable lint and SonarLint findings

## What happened

ESLint unused `useReducer` + setState-in-effect. Sonar: non-native click/drag, unbraced keydown, `pageSize === 'all'` typed as always-false, index keys, nested ternaries.

## Decision

Reset filter query on close (click-outside + toggle), not in an effect. ResizeHandle is a `<button>`. `pageSize` stays string (`'50'`/`'all'`). Row key = `Mã kiện hàng`. `renderCell` replaces nested ternaries.

## Verification

ESLint clean. SheetTab 12 + ExpiryStockTab 3.

## Next steps

None. No commit (not authorized).

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
