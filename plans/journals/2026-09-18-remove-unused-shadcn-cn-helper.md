---
title: remove unused shadcn cn helper
date: 2026-09-18
summary: Deleted src/lib/utils.js because knip reported it unused and nothing imported cn.
---

# remove unused shadcn cn helper

## What happened

Knip flagged `src/lib/utils.js` as an unused file. `cn` had zero importers.

## Decision

Deleted the file. `components.json` still aliases `@/lib/utils`; `npx shadcn add` will recreate it when a component needs it.

## Verification

Knip unused-files list no longer includes `src/lib/utils.js` (8 remaining, out of scope).

## Next steps

None. No commit (not authorized).

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
