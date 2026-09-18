---
title: fix useSheetReportActions unused export and duplicate import
date: 2026-09-18
summary: Un-exported computeBuckets and merged duplicate carrierUtils imports.
---

# fix useSheetReportActions unused export and duplicate import

## What happened

Knip flagged unused export `computeBuckets`. SonarLint S3863 flagged `carrierUtils.js` imported twice in `useSheetReportActions.js`.

## Decision

`computeBuckets` stays file-private (`handleSave` still calls it). Merged `useCarrierRowsPendingClear` into the existing `carrierUtils` import. Dropped the unused `computeBuckets` mock from SheetTab characterization.

## Verification

ESLint clean. Knip no longer lists this file. SheetTab characterization 12/12.

## Next steps

None. No commit (not authorized).

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
