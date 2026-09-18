---
title: fix ExcelUpload SonarLint findings
date: 2026-09-18
summary: "Sets for date columns, Number.isNaN(getTime), Blob.arrayBuffer, native label drop zone."
---

# fix ExcelUpload SonarLint findings

## What happened

Six SonarLint findings in ExcelUpload.jsx: array membership via includes, global isNaN, FileReader, non-native clickable drop zone.

## Decision

`DATETIME_COLUMNS`/`DATE_ONLY_COLUMNS` are Sets with `.has()`. Invalid Date checked via `Number.isNaN(date.getTime())` — not `Number.isNaN(date)` (never true). Parse uses `file.arrayBuffer()`. Drop zone is `<label>` wrapping the file input.

## Verification

ESLint clean. SheetTab characterization 12/12.

## Next steps

None. No commit (not authorized).

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
