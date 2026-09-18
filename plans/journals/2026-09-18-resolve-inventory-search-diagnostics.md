---
title: resolve-inventory-search-diagnostics
date: 2026-09-18
summary: Resolved reported NhapHangTab Snyk and Sonar diagnostics with bounded literal history search.
---

# resolve-inventory-search-diagnostics

## What happened

NhapHangTab diagnostics reported an unbounded history-search value reaching local match loops, a nested sort-icon ternary, excessive component cognitive complexity, and a possible empty error message when processing supplemental files.

## Decision

Bounded normalized history queries to 100 characters and used literal indexOf matching. Extracted sort-state transition logic, rendered sort icons with independent conditions, and guaranteed a non-empty supplemental-file error. Search remains case-insensitive for normal-length queries.

## Verification

Snyk Code scan found zero issues in src/components/NhapHangTab.jsx. Targeted ESLint passed. App characterization tests passed 15/15. Production build passed. Browser smoke remains unavailable because the managed browser relay extension is not connected.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
