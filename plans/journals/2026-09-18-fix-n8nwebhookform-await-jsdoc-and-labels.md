---
title: fix N8nWebhookForm await JSDoc and labels
date: 2026-09-18
summary: Corrected sendToN8n Promise JSDoc and associated form labels with htmlFor.
---

# fix N8nWebhookForm await JSDoc and labels

## What happened

SonarLint S4123: `await sendToN8n(...)` because JSDoc claimed a non-Promise return. S6853: three labels without associated controls.

## Decision

JSDoc now `@returns {Promise<...>}`. Labels use `htmlFor` + matching `id`. Submit path unchanged.

## Verification

ESLint clean. App characterization 15/15.

## Next steps

None. No commit (not authorized).

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
