---
title: remove-unused-order-badge-export
date: 2026-09-18
summary: Made the internally used OrderBadge component private to resolve its unused export.
---

# remove-unused-order-badge-export

## What happened

Knip reported `Unused export: OrderBadge` in `src/components/ReportCards.jsx`.

## Decision

Kept `OrderBadge` as a private component because `SectionCard` renders it locally. Removed only its named export; no external consumer imports it.

## Verification

`npx eslint src/components/ReportCards.jsx --quiet` passed. A source assertion confirmed OrderBadge is not exported. 15 affected presentation tests passed.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
