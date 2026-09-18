---
title: reduce CarrierPanel complexity and memoize baseRows
date: 2026-09-18
summary: Extracted week/lookup/row-class/empty-drop helpers from CarrierPanel and wrapped baseRows in useMemo.
---

# reduce CarrierPanel complexity and memoize baseRows

## What happened

S3776: CarrierPanel complexity 22 > 15. exhaustive-deps: `baseRows` ternary recreated each render, poisoning useMemo/useCallback deps.

## Decision

Module helpers: `buildHoldLookupSet`, `selectActiveWeek`, `carrierLookupMap`, `carrierRowClass`, `CarrierEmptyDropZone`. `baseRows` in `useMemo`.

## Verification

ESLint clean. SheetReportPanel + DeliveryReportPresentation 15/15.

## Next steps

None. No commit (not authorized).

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
