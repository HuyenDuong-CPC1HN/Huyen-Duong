---
title: fix tongDonNarrative knip and sonarlint
date: 2026-09-18
summary: "Dropped unused narrative exports and split builders so SonarLint nested-ternary, nested-template, and complexity findings clear."
---

# fix tongDonNarrative knip and sonarlint

## What happened

`src/components/tongDonNarrative.js` had Knip unused exports (`fmtPctSigned`, `deltaPctOf`, `trendWord`, `carrierInsight`, `slaRate24h`) and SonarLint S3776/S3358/S4624/S3923 on the two narrative builders.

## Decision

Kept those helpers file-private. Split nested ternaries/templates into named sentence builders. Removed the no-op `slaC_prev !== undefined ? '' : ''`. Public contract unchanged: `pct`, `buildDonSanNarrative`, `buildDonTruyenThongNarrative`.

## Verification

Old vs new builder output equal on 5 fixtures. ESLint clean. Knip no longer lists this file. TongDonTab characterization 2/2.

## Next steps

None. No commit (not authorized). IDE SonarLint/Knip need a re-scan.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
