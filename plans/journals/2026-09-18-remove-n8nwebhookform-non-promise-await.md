---
title: remove N8nWebhookForm non-Promise await
date: 2026-09-18
summary: Replaced await sendToN8n with .then so Sonar S4123 no longer fires on the submit handler.
---

# remove N8nWebhookForm non-Promise await

## What happened

S4123 still flagged `await sendToN8n(...)` after the JSDoc Promise fix. Nested `{Promise<{...}>}` is easy for Sonar to mis-parse.

## Decision

Submit handler uses `.then()` — no `await`. JSDoc simplified to `@returns {Promise<Object>}`.

## Verification

No `await` in N8nWebhookForm.jsx. ESLint clean.

## Next steps

None. No commit (not authorized).

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
