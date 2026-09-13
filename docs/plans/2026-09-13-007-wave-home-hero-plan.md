---
title: "feat: Wave Home state-first hero"
type: feat
status: ready
origin: docs/reports/2026-09-13-advise-wave-home-hero.md
supersedes: null
date: 2026-09-13
execution: omp
---

# Wave Home Hero

## Outcome

Replace only the HomeBrief intro with a state-first hero following the Admin v2 `#home` hierarchy. It explains the existing next required action, routes through the existing `onNavigate` callback, and never creates a dashboard aggregate or new data contract.

## Authority and constraints

- Visual authority: `C:/Users/PhuTV/Downloads/Landing page design component/CPC1HN Admin v2 Geist.dc.html`, restricted to `#home` hero composition: centered 1200px frame, eyebrow, narrow H1, subcopy, one 44px pill CTA, neutral hairline surface.
- Behavior authority: `docs/reports/2026-09-13-advise-wave-home-hero.md` and existing `HomeBrief` derivation.
- Preserve card ordering, exceptions, next-action section, existing n8n gate/behavior, storage/API/Supabase reads, malformed-data handling, and navigation destinations.
- Do not use mock counts/KPIs, calculate aggregates, expose a hero n8n CTA, touch DTP/Return/Damaged, or modify `.sheet-tab-*`/`.report-*`.
- Keep ownership local and readable: no new component, dependency, abstraction, or repo-wide refactor.

## File ownership

| File | Allowed change |
| --- | --- |
| `src/components/HomeBrief.jsx` | Add a narrow presentation mapping from existing `channels`, `nextAction`, and `onNavigate`; replace intro markup only. Preserve all derivation and lower sections. |
| `src/index.css` | Replace/refine only `.home-brief-intro` rules and add narrowly named `.home-hero-*` styles plus responsive overrides. |
| `src/components/__tests__/App.characterization.test.jsx` | Add consumer-observable hero assertions for empty, incomplete, all-ready, valid-zero/invalid metric omission, and CTA navigation without weakening existing checks. |

## Implementation steps

1. **Impact before source edits.** Run GitNexus upstream impact analysis for `HomeBrief` and the helper/view-model symbols changed by the implementation. Review direct dependents and the Home render flow. Stop and report if risk is HIGH or CRITICAL.
2. **Keep selection singular.** After existing `channels`, `exceptions`, and `nextAction` calculation, derive a small hero view model from that already-resolved data:
   - If `nextAction` exists, eyebrow identifies current state, H1/subcopy name the selected action/channel, and CTA uses `getActionCopy(nextAction)` with `onNavigate(nextAction.id)`.
   - If no `nextAction` exists, use a clear completion H1/subcopy and optional metric only from an existing ready channel with a non-null `headline`. Do not fall back to `0`, calculate totals, or surface a metric if no valid headline exists.
3. **Replace intro markup.** Render semantic hero markup in place of `.home-brief-intro`: eyebrow, `h2`, supporting paragraph, exactly one primary button with the existing callback. Use existing icons only where they clarify the action. Leave the status-card, exception, and next-action markup/control paths unchanged.
4. **Scope styles.** Map the Admin v2 composition through `.home-hero-*`: 1200px alignment, white surface/hairline, 96/24/64 desktop rhythm, 48px heading, constrained copy measure, 44px pill CTA. Retain current app colors/fonts and isolate mobile adjustments in existing media-query sections. No generic selector changes.
5. **Update behavior tests.** Test hero copy/CTA for empty/missing data, a needs-save priority, all-ready completion with a valid metric, invalid/absent metric omission, and navigation through the primary CTA. Keep existing lower-section assertions as regression coverage.

## Acceptance criteria

- Hero replaces the old intro and contains one eyebrow, one H1/H2-level hero heading, subcopy, and exactly one primary CTA.
- In incomplete states, its copy and CTA agree with the same `nextAction` target used by the unchanged lower Next Action section.
- In all-ready states, it communicates completion and shows no invented aggregate. A metric appears only if an existing channel `headline` is valid; numeric `0` remains displayable.
- Channel cards, Exceptions, lower Next Action, and existing n8n CTA retain their existing order, labels, conditions, and destinations.
- Malformed/empty storage still renders the missing state without an exception or fabricated numeric value.
- New CSS is HomeBrief/hero-only; DTP, Return, Damaged, `.sheet-tab-*`, and `.report-*` source remains unchanged.
- At 1440px, visual hierarchy matches the prototype hero composition without copying prototype mock content. At mobile width, no horizontal overflow and CTA remains a 44px target.

## Verification

1. Run the focused HomeBrief Vitest file while iterating.
2. Start the actual app on a deterministic local port and inspect Home at 1440px in a browser with empty, needs-save, and all-ready seeded states. Confirm primary hero CTA routes to the same existing target and cards/exceptions/lower action remain visible.
3. Run `npm test && npm run test:ui && npm run build`.
4. Run code review, security analysis, `snyk test`, `snyk code test D:/OneDrive/Data Automation/Projects/Huyen-Duong`, and Sonar only when a project configuration exists. Do not commit or push.

## Risks and rollback

- **Duplicate action policy:** deriving hero from anything other than `nextAction` can diverge from the lower action. Mitigation: derive once from the existing selection; rollback is to restore the previous intro markup/styles.
- **False aggregate:** reusing prototype metrics would overstate data fidelity. Mitigation: optional display only from a valid existing `headline`; omit otherwise.
- **Shared CSS regression:** broad selectors can alter report tabs. Mitigation: only `.home-hero-*`/existing `.home-brief-intro` selectors; rollback is the scoped CSS block.
- **Responsive regression:** desktop hero spacing may overflow narrow screens. Mitigation: add only the needed existing breakpoint override and browser-check both widths.
