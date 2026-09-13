# Wave Home Hero trên HomeBrief — Advisory

**Status:** confirmed scope; advisory only  
**Date:** 2026-09-13

## Verdict

Làm hero là hợp lý nếu nó **thay intro hiện tại** và chỉ làm rõ hành động đã được `HomeBrief` chọn sẵn. Không nên biến nó thành management dashboard: prototype dùng SLA, return rate, carrier, chart, history và 1.500 đơn mock, trong khi HomeBrief chỉ có state/report theo từng kênh. Bản nhỏ, state-first sẽ tạo hierarchy tốt hơn mà không phát minh KPI hay thay đổi luồng dữ liệu.

## Verified facts

- `HomeBrief` hiện derive bốn kênh trực tiếp từ `opsStore`: Tongdon, Đơn C, Đơn DTP và TMĐT. Trạng thái hợp lệ là `ready`, `needsSave`, `missing`.
- `nextAction` đã ưu tiên kênh chưa sẵn sàng đầu tiên ngoài Tongdon; CTA hiện tại gọi `onNavigate`.
- `formatOrders` chỉ format số hữu hạn; `0` là dữ liệu hợp lệ, còn metric thiếu/không hợp lệ không được thay bằng `0`.
- n8n CTA hiện được gate bằng trạng thái Tongdon, không phải cả bốn kênh. Nó không phải bằng chứng về báo cáo hoàn chỉnh.
- Prototype `#home` chỉ là visual authority cho hierarchy: eyebrow, H1, subcopy, CTA pill, spacing và container. Số liệu/dashboard trong prototype là mock.
- `.home-*` là CSS HomeBrief chuyên biệt. `.sheet-tab-*` và `.report-*` đang được DTP, Return và Damaged dùng chung.

## Confirmed outcome contract

### Problem

Khi mở Home, người dùng cần biết ngay kênh nào trong dữ liệu hiện có cần xử lý và phải đến đâu để xử lý. Intro hiện tại phải được thay bằng hero có hierarchy Admin v2, không phải thêm một lớp dashboard hay action model mới.

### Requirements

1. Thay current HomeBrief intro bằng hero scoped gồm eyebrow, H1, subcopy và một CTA chính.
2. Khi có kênh chưa sẵn sàng, derive H1/subcopy/CTA từ `nextAction` hiện hữu; CTA dùng `onNavigate` hiện hữu.
3. Khi mọi kênh sẵn sàng, diễn đạt completion rõ ràng và chỉ dùng tối đa một metric đã tồn tại, hợp lệ, làm thông tin phụ.
4. Giữ nguyên channel cards, Exceptions, Next Action, thứ tự, `onNavigate` behavior và n8n action/gate hiện hữu bên ngoài hero.
5. Chỉ map composition/typography của prototype; không copy số mock, KPI, chart, SLA, return rate, carrier hoặc history.
6. Không có API, storage, Supabase, state model hoặc calculation mới. Empty/malformed giữ semantics hiện tại.
7. CSS mới phải HomeBrief-scoped; không redesign hay đổi shared `.sheet-tab-*`/`.report-*`, DTP, Return hoặc Damaged.
8. Code trong scope phải OCD-clean: ownership rõ, dễ đọc, maintain, debug; không refactor cả repo.

### Goals and success criteria

- Ở viewport 1440px, hero có hierarchy/surface/spacing theo `#home` prototype và nêu rõ next step hiện tại.
- Primary CTA luôn dẫn đúng target đã có của `nextAction`.
- Empty/malformed/needsSave/ready và navigation behavior vẫn đúng.
- Channel cards, exceptions và next-action hiện hữu không bị regress.

### Non-goals

- Không thêm dashboard tổng hợp, số liệu giả, fallback `0`, global week picker, report redesign, backend, API, Supabase hoặc storage.
- Không sửa shared CSS hoặc component của DTP, Return, Damaged.

## What to do

1. Treat `deriveChannels`, `exceptions` and `nextAction` as the single source of hero state; add only the smallest presentation mapping required for hero copy.
2. Replace—not prepend to—the existing intro. Keep the channel cards, Exceptions and Next Action below it.
3. Use state-first copy:
   - Incomplete: name the required data/report action and the selected channel; CTA routes to that same channel.
   - All-ready: state that no current data exception exists; only surface an existing valid metric if it adds concrete context.
4. Recreate the prototype’s centered 1200px visual hierarchy, neutral surface, eyebrow, narrow heading measure, subcopy measure, and 44px pill CTA. Preserve existing responsive breakpoints and no-overflow behavior.
5. Keep visual rules narrowly under the HomeBrief namespace and preserve current shared CSS untouched.
6. Validate the rendered 1440px Home surface, then the existing state/navigation contracts and build.

## What not to do

- Do not expose mock values from `#home`, calculate cross-channel totals, or infer service quality from missing source data.
- Do not show a secondary n8n CTA in the hero. Its existing Tongdon-only gate would imply readiness the app does not establish.
- Do not create a second action-prioritization algorithm. It will drift from `nextAction` and duplicate decisions.
- Do not move or remove the existing Exceptions/Next Action sections; the confirmed scope requires regression preservation.
- Do not broaden selector changes into `.sheet-tab-*` or `.report-*`.

## Alternatives considered

| Approach | Result | Decision |
| --- | --- | --- |
| State-first hero driven by existing `nextAction` | Clear next step with no new data contract | Recommended |
| Metric-first management summary | Needs reliable cross-channel KPI semantics that do not exist | Reject |
| Composition-only restyle of current intro | Lowest risk, but misses the stated action-priority outcome | Reject |
| Hero plus original intro/actions | Duplicates decisions and pushes channel scan below the fold | Reject |

## Trade-offs

- The hero will sometimes be intentionally sparse. That is correct: absence of a valid aggregate must remain absent, not become a plausible-looking metric.
- Reusing `nextAction` preserves behavior but inherits its policy: non-Tongdon incomplete channels take priority, then Tongdon.
- Retaining the existing lower Exceptions and Next Action areas creates a little semantic repetition, but it avoids an unaccepted UX/behavior cutover and preserves current contracts.
- This recommendation stops fitting when product requires verified aggregate SLA, return, carrier, or historical metrics. At that point define a real report schema and data-refresh contract first; do not derive it in the view.

## Required future implementation workflow

1. `/skill:ak:plan` is appropriate and sufficient before EXECUTE because a scoped presentation plan already exists but needs a final implementation contract.
2. `/skill:ak:frontend-design` is **not required** before plan: the visual authority is specific and the component/data constraints are already clear. Use it only if the 1440px hero needs visual exploration beyond `#home`.
3. Then `/skill:ak:cook` for implementation. Follow the repository’s impact-analysis requirement before modifying symbols.
4. After implementation, run the requested review/security chain under Cursor control. Do not ship, commit, merge, deploy, or change model roles in this advisory scope.

## Work checklist

- [ ] In the plan, lock the hero as a replacement for the current HomeBrief intro—not a new dashboard section.
- [ ] Identify the existing `nextAction`/`onNavigate` branch that supplies incomplete-state H1, subcopy and CTA.
- [ ] Specify all-ready hero copy and one optional, valid existing metric; specify omission when no metric is valid.
- [ ] Map only prototype hierarchy, spacing, typography and one pill CTA into scoped HomeBrief CSS.
- [ ] Preserve channel cards, Exceptions, Next Action and existing n8n behavior verbatim.
- [ ] Add or update only behavior tests that prove consumer-observable hero state/CTA semantics; keep malformed/empty behavior covered.
- [ ] Browser-check Home at 1440px, including one incomplete state and all-ready state when available.
- [ ] Run `npm test && npm run test:ui && npm run build`.
- [ ] Run code review, security review, `snyk test`, `snyk code test D:/OneDrive/Data Automation/Projects/Huyen-Duong`, Sonar and final verification under Cursor; then stop for Cursor shipping.

## Success metrics

- Hero contains exactly one primary action and it routes through the existing `onNavigate` target selected by `nextAction`.
- Hero displays no mock/invented aggregate, SLA, return, carrier or history metric.
- Invalid/missing metrics render as absent; a valid numeric `0` remains distinguishable as `0`.
- Existing HomeBrief UI characterization tests pass, including empty/malformed, ready, needs-save, analytics, n8n and navigation cases.
- Manual 1440px browser inspection confirms visual hierarchy and no regression in channel cards, exceptions or next action.
- `npm test`, `npm run test:ui` and `npm run build` exit successfully.
