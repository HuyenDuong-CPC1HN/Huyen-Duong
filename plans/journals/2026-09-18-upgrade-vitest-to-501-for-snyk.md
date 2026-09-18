---
title: upgrade vitest to 5.0.1 for Snyk
date: 2026-09-18
summary: Upgraded vitest from 4.1.11 to 5.0.1 so Snyk no longer flags the test import.
---

# upgrade vitest to 5.0.1 for Snyk

## What happened

Snyk IDE flagged `import { ... } from 'vitest'` in SheetTab characterization: `vitest@4.1.11 has 1 vulns`. Latest non-vulnerable version is 5.0.1.

## Decision

Bumped `vitest` to `^5.0.1`. Known 4.x CVEs were already patched in 4.1.8–4.1.10; Snyk still treats 4.1.11 as not the clean line. Test file unchanged.

## Verification

`npm ls vitest` → 5.0.1. `npx vitest run` 19 files / 157 tests passed.

## Next steps

None. No commit (not authorized). IDE Snyk needs a re-scan of the import.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
