---
title: use optional chain in carrierWeekHasRows
date: 2026-09-18
summary: "Replaced w && w.rows && w.rows.length with w?.rows?.length."
---

# use optional chain in carrierWeekHasRows

## What happened

Sonar S6582: `w && w.rows && w.rows.length` instead of optional chain.

## Decision

`return !!w?.rows?.length` — same truthiness for missing week, missing rows, empty rows.

## Verification

ESLint clean. Truth table: undefined/{}/{rows:[] } → false; `{rows:[1]}` → true.

## Next steps

None. No commit (not authorized).

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
