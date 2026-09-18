---
title: remove-unused-carrier-stats-default-export
date: 2026-09-18
summary: Removed unreferenced default CarrierStats export and verified the production build.
---

# remove-unused-carrier-stats-default-export

## What happened

A static unused-export check reported `Unused export: default` for `src/components/CarrierStats.jsx`.

## Decision

Removed the unreferenced default `CarrierStats` component. Retained named `CarrierPanel`, which is imported by `SheetReportPanel.jsx` and `ThongKeGiaoHang.jsx`.

## Verification

`npm run build` completed successfully. A source assertion confirmed the file contains no `export default`. Targeted ESLint still reports the three pre-existing unused local symbols in this file; it does not report unused exports.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
