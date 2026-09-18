---
title: fix ExpiryStockTab SonarLint findings
date: 2026-09-18
summary: "Unified monthsLeft return type, some/arrayBuffer/localeCompare, native label drop zone, extracted remaining-days ternaries."
---

# fix ExpiryStockTab SonarLint findings

## What happened

Eight SonarLint findings in ExpiryStockTab.jsx: mixed return types, `.find` for existence, FileReader, unsorted `.sort()`, non-native clickable drop zone, nested ternaries.

## Decision

Matched SlowMovingStockTab: `monthsLeft` always number (`?? 0`), `.some()`, `file.arrayBuffer()`, `localeCompare('vi')`, `<label>` drop zone, `remainingDaysLabel`/`remainingClass`.

## Verification

ESLint clean. ExpiryStockTab tests 3/3.

## Next steps

None. No commit (not authorized).

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
