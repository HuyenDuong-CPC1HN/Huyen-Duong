---
title: fix TongDonTab complexity and replaceAll
date: 2026-09-18
summary: "Extracted TongDonTab toolbar and publish copy so cognitive complexity drops, and switched PNG filename slashes to replaceAll."
---

# fix TongDonTab complexity and replaceAll

## What happened

SonarLint S3776: `TongDonTab` cognitive complexity 22 (allowed 15). S7781: `.replace(/\//g, '_')` on the PNG download name.

## Decision

Moved loading, publish copy, and toolbar JSX to module helpers. Filename uses `replaceAll('/', '_')`. Behavior unchanged.

## Verification

ESLint clean. TongDonTab characterization 2/2.

## Next steps

None. No commit (not authorized).

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
