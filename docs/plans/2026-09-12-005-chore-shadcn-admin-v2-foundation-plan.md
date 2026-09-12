---
title: "chore: shadcn Admin v2 visual foundation"
type: chore
status: ready-for-audit
date: 2026-09-12
execution: omp
---

# Shadcn Admin v2 Foundation — Phase 0–1

## Outcome
Prepare the existing Vite + React + Tailwind 4 app for future 21st/shadcn use and replace only the global visual primitives with a Geist/Vercel-neutral Admin v2 foundation. Do not redesign Home, Giao hàng Đơn C, or any other tab in this phase.

## Constraints
- Preserve all component markup, business logic, storage keys, routes, and report/export behavior.
- Do not install any shadcn/21st components; initialize configuration only.
- New global palette must not retain legacy `#f4f3ee` canvas tokens.
- Keep JavaScript/JSX; do not introduce TypeScript.
- Stop after verification; no commit, push, deploy, or full-surface migration.

## File map

| File | Change |
| --- | --- |
| `components.json` | Shadcn Vite configuration using `@/` aliases and CSS variables. |
| `jsconfig.json` | JavaScript editor/module path mapping for `@/* → src/*`. |
| `vite.config.js` | Matching runtime `@` alias; preserve base-path and existing plugins. |
| `src/index.css` | Retain the Tailwind import and existing class selectors; map global semantic variables to neutral Geist/Admin v2 values and add shadcn-compatible base variables. |
| `package.json`, `package-lock.json` | Only initializer-required foundation dependencies, if the CLI adds them. |

## Token map

| Semantic role | Legacy | Admin v2 / Geist target |
| --- | --- | --- |
| canvas | `#f4f3ee` | `#fafafa` |
| raised surface | `#ffffff` | `#ffffff` |
| subtle surface | `#f8f8f5` | `#f7f7f8` |
| primary text | `#1a1d23` | `#111111` |
| muted text | `#6b7280` | `#6b7280` |
| border | `#e6e4dc` | `#eaeaea` |
| focus | CPC blue alpha | neutral foreground alpha |
| typeface | Inter/SF fallback | Geist Sans with existing system fallbacks |

## Execution

1. Run `npx shadcn@latest init --template vite --base radix --yes` and accept only configuration/dependencies necessary to initialize shadcn. Inspect the generated diff before retaining it.
2. Add the `@` runtime alias only if the initializer has not done so; do not convert `.jsx` files or add a TypeScript config.
3. Replace global visual tokens in `src/index.css`; retain legacy variable names as the compatibility layer for untouched tabs, while providing the shadcn variables used by future components.
4. Verify lint, existing tests, production build, security scan, and focused review. Visual migration begins later and is limited to Home + Giao hàng Đơn C when their mock implementation starts.

## Risks and checks

- **JS versus TSX:** shadcn supports JavaScript Vite projects, but snippets may default to TSX. Keep `components.json` aliases pointed at `.js/.jsx` paths; adopt only `.jsx` component variants later.
- **Tailwind 4:** keep `@import "tailwindcss"`; do not introduce a Tailwind 3 config or `@tailwind` directives.
- **Global CSS:** changing root values changes all existing screens. No selectors, layout rules, or component behavior move in Phase 0–1; screenshot the existing shell after build before later surface work.
- **21st:** initialization is sufficient preparation. Add individual 21st/shadcn components only when a mapped mock needs one.

## Acceptance

- `components.json`, `jsconfig.json`, and Vite agree on `@/`.
- `src/index.css` exposes the neutral CSS variables without `#f4f3ee` as a global canvas token.
- No React business/component source changes.
- `npm test`, `npm run build`, `npm audit`, and `snyk code test` pass; Sonar is N/A because no project configuration exists. Existing lint failures must not gain a new error in a touched file.

## Verification

- `npm test`: 5 passed, 0 failed.
- `npm run build`: passed; its existing dynamic-import and chunk-size warnings remain.
- `npm audit --json`: 0 vulnerabilities.
- `snyk code test`: 0 issues.
- Shell screenshot confirms `rgb(250, 250, 250)`, Geist Variable, and `rgb(17, 17, 17)` on the login surface.
- `npm run lint`: red only on pre-existing files; `vite.config.js` reports its pre-existing global `process` reference. No new lint error was introduced by this phase.
- `.env` and `.env.local` are ignored and no production environment file is tracked.
- No `dangerouslySetInnerHTML`, `innerHTML =`, `eval`, or `new Function` sink was found in `src` or `scripts`.
