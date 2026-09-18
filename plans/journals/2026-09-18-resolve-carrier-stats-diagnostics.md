---
title: resolve-carrier-stats-diagnostics
date: 2026-09-18
summary: "Resolved the reported CarrierStats ESLint, Knip, and SonarLint diagnostics."
---

# resolve-carrier-stats-diagnostics

## What happened

CarrierStats diagnostics reported three unused locals, one unused default export, FileReader usage, direct filter callbacks, nested ternaries, index keys, an inaccessible upload target, and excessive CarrierPanel cognitive complexity.

## Decision

Deleted local code with no callers while preserving CarrierPanel and carrierUtils exports used elsewhere. Replaced FileReader paths with Blob#arrayBuffer(), moved shared row filtering out of CarrierPanel, made pagination state consistently string-based, used domain keys, and made the upload drop target a native button.

## Verification

Targeted ESLint passes. 15 affected presentation tests pass. Production build passes. Browser smoke could not start because the managed browser relay extension is not connected; the temporary Vite server was stopped.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
