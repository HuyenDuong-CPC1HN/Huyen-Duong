---
title: "feat: Đơn C / Đơn DTP no-scroll calm pharma-ops redesign"
type: feat
status: active
date: 2026-08-12
origin: docs/brainstorms/2026-08-12-donC-donDTP-no-scroll-redesign-requirements.md
execution: claude-code
sot: "%USERPROFILE%\\.agent-workflow\\TIERED_ADAPTIVE_WORKFLOW.md"
lead: Claude
tier: 3
pass: "2a shell (Tasks 1–4) → stop → 2b surfaces (Tasks 5–9) → OCR → self-review → DỪNG"
ocr: delegate
harness: "SoT day pipeline (không bootstrap — project đã có)"
---

# Đơn C / Đơn DTP No-Scroll Redesign — Implementation Plan

> **For agentic workers:** Implement task-by-task. Check off steps as you go. **Do not change business logic or storage keys.**
> **Kit SoT:** `%USERPROFILE%\.agent-workflow\TIERED_ADAPTIVE_WORKFLOW.md` (2026-08-11) — thắng L8 harness khi conflict.

## Kit dispatch (khóa)

| Field | Value |
|-------|-------|
| **Lead** | **Claude** (UI redesign / UX composition — SoT §1.1) |
| **Tier** | **3 — Enterprise** (redesign multi-file report surface) |
| **Pass** | **A+B UI:** Design đã chốt ở brainstorming (Pass 1). Chat này = **Pass 2 Code**. Cắt **2a** (Tasks 1–4) → DỪNG → chat mới **2b** (Tasks 5–9) nếu ctx lớn |
| **Harness** | Task ngày → **SoT kit**. Không `harness-bootstrap` (project đã có). Chỉ `harness-mistake-log` nếu Claude sai lặp sau audit |
| **Design mandate** | `taste-skill` → `ui-ux-pro-max` → `frontend-design` → emil-local (nếu có) — **trước** `/using-superpowers`; bám tokens Home/TongDon |
| **Code** | `/using-superpowers` (bắt) — TDD characterization + verify |
| **Simplify** | `code-simplifier:code-simplifier` |
| **Review** | Skill **`open-code-review-delegate`** (`ocr delegate`) — **report-only** — **thay** `feature-dev:code-reviewer` |
| **Self-review** | vs R1–R28 LOCKED / FORBIDDEN |
| **Git** | **Cấm** commit/push trừ anh lệnh. Done = **Done for audit** |
| **Cấm** | `/codex:review`; slash `/code-review` (PR-only); stack OCR + code-reviewer; đổi công thức nghiệp vụ |
| **Pass 2 sau Claude** | Cursor audit → Codex chỉ khi FAIL / Sonar / lệch DoD |

**Goal:** Redesign Giao hàng Đơn C and Đơn DTP into a calm pharma-ops, desktop no-scroll workspace with split columns, progressive disclosure, and preserved calculations.

**Architecture:** Add `sheet-tab-*` CSS namespace mirroring `tongdon-*`. Refactor `SheetTab.jsx` composition (context bar → KPI strip → 2-column split → detail accordion). Lift save/export actions from `SheetReportPanel` to context bar via extracted hook. Restyle `ThongKeDoiTac` / `ThongKeGiaoHang` presentation only — keep all counting/matching logic.

**Tech Stack:** React 19, Vite 8, Tailwind 4 + `src/index.css`, Vitest + Testing Library, html-to-image, existing `opsStore` / `useWeeklyData` / `sheetReports`.

## LOCKED / FORBIDDEN / Acceptance (OCR + self-review)

**LOCKED**
- R1–R28 trong origin brainstorm
- Layout: context bar → KPI → split 45/55 → accordion đóng mặc định
- DTP hold dưới Viettel Post
- Tokens: `--surface-canvas`, CPC blue `#0e59bf`, namespace `sheet-tab-*`
- Characterization: số liệu fixture không đổi

**FORBIDDEN**
- Đổi `deliveryBucket`, `partnerType`, carrier matching, Tân Thịnh 24h, hold chỉ DTP, `opsStore` keys, sheetReports contracts
- Commit / push
- `/codex:review`, slash `/code-review`, `ocr review` (managed LLM)
- Stack OCR + `feature-dev:code-reviewer`
- Rainbow pastel full-section cards
- KPI formula mới

**Acceptance**
- `npm test` xanh (gồm SheetTab characterization + DeliveryReportPresentation)
- Desktop 1440 accordion đóng: KPI + 2 cột không scroll trang
- Saved mode canvas tint; export/print OK
- Mục Review trong báo cáo: OCR delegate coverage + findings (report-only)

## Global Constraints

- R1–R6: Desktop no-scroll (≥1366×768); mobile (<1024px) may scroll page; empty = upload only.
- R7–R11: Single context bar; overflow for export/print/delete/relink; remove old view toggle.
- R12–R13: Four KPIs from existing data — **no new formulas**.
- R14–R16: Left column VC stats; DTP hold block under Viettel Post; frozen carrier tag.
- R17–R18: Right column delivery stats; no large rainbow pastel boxes.
- R19–R20: Live white surface; saved canvas tint + ready border + eyebrow.
- R21–R23: Use `--surface-canvas`, CPC blue `#0e59bf`, `sheet-tab-*` CSS; mirror `tongdon-tab` overflow lock.
- R24–R25: Export surface wraps full report; auto-expand accordion on PNG capture; print hides shell.
- R26–R28: **Immutable:** `deliveryBucket`, `partnerType`, carrier matching, Tân Thịnh 24h, hold DTP-only, `displayWeeks`, pending clear/undo, all `opsStore` keys. Vietnamese copy. Desktop-first.
- **No commit/push** unless user explicitly asks.
- **Reference implementations:** `TongDonTab.jsx`, `.tongdon-*` in `index.css`, `TongDonTab.characterization.test.jsx`.

---

## File Map

| File | Responsibility |
|------|----------------|
| `src/index.css` | New `sheet-tab-*` tokens, layout, no-scroll lock, print rules |
| `src/components/SheetTab.jsx` | Root composition, KPI strip, split grid, accordion, context bar wiring |
| `src/components/SheetReportPanel.jsx` | Pending banner, snapshot view, export ref; expose action handlers (not inline toolbar) |
| `src/components/WeekSelector.jsx` | Restyled trigger + popover; keyboard Escape |
| `src/components/ExcelUpload.jsx` | Compact variant for context bar (if not already) |
| `src/components/ThongKeDoiTac.jsx` | Compact rows + per-group "Chi tiết" disclosure |
| `src/components/ThongKeGiaoHang.jsx` | Neutral stat grid; remove full-width pastel cards |
| `src/components/DataTable.jsx` | Optional `compact` prop for accordion panel |
| `src/components/__tests__/fixtures/sheetTabDonCFixture.js` | Representative donC rows + expected KPI labels/counts |
| `src/components/__tests__/fixtures/sheetTabDonDTPFixture.js` | DTP rows incl. hold scenario |
| `src/components/__tests__/SheetTab.characterization.test.jsx` | Layout + count invariants before/after |
| `src/components/__tests__/DeliveryReportPresentation.test.jsx` | ThongKe* rendered totals unchanged |

---

### Task 1: Characterization fixtures and failing tests

**Files:**
- Create: `src/components/__tests__/fixtures/sheetTabDonCFixture.js`
- Create: `src/components/__tests__/fixtures/sheetTabDonDTPFixture.js`
- Create: `src/components/__tests__/SheetTab.characterization.test.jsx`
- Create: `src/components/__tests__/DeliveryReportPresentation.test.jsx`

**Interfaces:**
- Produces: fixture objects `{ rows, weekId, weekLabel, type, expectedKpi: { total, delivered, rate, pending } }` and `expectedGroupLabels: string[]`

- [ ] **Step 1:** Create donC fixture (~15–30 rows) covering trực tiếp 24/48/72, chành, viettel, spx, đã giao / chưa giao. Compute expected KPI counts manually once and freeze in fixture.

```javascript
// sheetTabDonCFixture.js — example shape
export const donCFixture = {
  type: 'donC',
  weekId: 'donC_test_32',
  weekLabel: 'Tuần 32',
  rows: [ /* minimal representative rows */ ],
  expectedKpi: { total: 12, delivered: 8, rateLabel: '67%', pending: 4 },
  expectedSections: ['Giao hàng trực tiếp', 'Giao qua Chành xe', 'Viettel Post', 'SPX Express'],
}
```

- [ ] **Step 2:** Create donDTP fixture with hold-relevant rows (VTP status "Đang lấy hàng" + matching hold file codes if mocked).

- [ ] **Step 3:** Write `SheetTab.characterization.test.jsx` mocking `useWeeklyData`, `opsStore`, `CarrierStats` similar to `TongDonTab.characterization.test.jsx`:

```javascript
it('donC: renders merged report with KPI strip and closed detail accordion', () => {
  // render SheetTab type="donC"
  expect(document.querySelector('.sheet-tab')).toBeInTheDocument()
  expect(screen.getByText(String(donCFixture.expectedKpi.total))).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /Danh sách chi tiết/i })).toHaveAttribute('aria-expanded', 'false')
})
```

- [ ] **Step 4:** Write `DeliveryReportPresentation.test.jsx` rendering `ThongKeDoiTac` + `ThongKeGiaoHang` with fixtures; assert key counts (e.g. "24 giờ" row totals) match pre-refactor baseline — run against **current** code first and snapshot text counts.

- [ ] **Step 5:** Run `npm test` — new tests may pass on old UI (layout selectors not yet `.sheet-tab`) or fail; note baseline. After Task 2–4, all must pass.

Run: `npm test -- SheetTab DeliveryReportPresentation`

---

### Task 2: CSS foundation (`sheet-tab-*`)

**Files:**
- Modify: `src/index.css` (append after `.tongdon-*` block)

**Interfaces:**
- Produces: CSS classes used by Task 3+: `.sheet-tab`, `.sheet-tab-shell`, `.sheet-tab-context`, `.sheet-tab-kpi`, `.sheet-tab-split`, `.sheet-tab-col`, `.sheet-tab-accordion`, `.sheet-tab.is-active-report`, `.sheet-tab.is-saved-report`, `.sheet-tab-action`, `.sheet-tab-action.is-primary`

- [ ] **Step 1:** Add width constraint `min(1360px, 100%)` mirror tongdon.

- [ ] **Step 2:** Add flex column shell with `min-height: 0`, gap 12px.

- [ ] **Step 3:** Add split grid:

```css
.sheet-tab-split {
  display: grid;
  grid-template-columns: minmax(0, 45fr) minmax(0, 55fr);
  gap: 12px;
  min-height: 0;
  flex: 1;
}
@media (max-width: 1023px) {
  .sheet-tab-split { grid-template-columns: 1fr; }
}
.sheet-tab-col--right { overflow-y: auto; min-height: 0; }
```

- [ ] **Step 4:** Add no-scroll lock:

```css
.dashboard-main:has(.sheet-tab.is-active-report) {
  overflow: hidden;
}
```

- [ ] **Step 5:** Add saved mode:

```css
.sheet-tab.is-saved-report .sheet-tab-report {
  background: var(--surface-canvas);
  border: 1px solid var(--status-ready-border, #b8dcc4);
  border-radius: 12px;
}
```

- [ ] **Step 6:** Add accordion panel max-height ~240px / 35vh with internal scroll.

- [ ] **Step 7:** Add print rules hiding `.sheet-tab-context`, `.sheet-tab-overflow`.

---

### Task 3: Extract sheet report actions hook

**Files:**
- Create: `src/components/useSheetReportActions.js`
- Modify: `src/components/SheetReportPanel.jsx`

**Interfaces:**
- Produces: `useSheetReportActions({ type, data, weekId, weekLabel, referenceDate, pendingClear, onSaved, onUndoClear, exportRef, listExpanded, setListExpanded })` returning:

```javascript
{
  snapshot, isPendingClear, latestClearAt,
  canSave, canUpload,
  handleSave, handleUndo, handleRelink, handleExportImage, handlePrint,
  handleClearCarrierNow, exporting,
  pendingBannerProps,
}
```

- [ ] **Step 1:** Move `handleSave`, `handleUndo`, `handleRelink`, `handleExportImage`, `handleClearCarrierNow`, pending-clear timer logic from `SheetReportPanel` into hook (copy verbatim — no logic changes).

- [ ] **Step 2:** `SheetReportPanel` becomes layout wrapper: pending banner + `{snapshot ? <SnapshotView/> : children}` + `exportRef` on export surface only.

- [ ] **Step 3:** Remove inline `.report-actions` buttons from `SheetReportPanel` (actions rendered by `SheetTab` context bar).

- [ ] **Step 4:** For PNG export: before `toPng`, if accordion closed, temporarily set `listExpanded=true`, await `requestAnimationFrame`, capture, restore.

---

### Task 4: SheetTab composition + context bar

**Files:**
- Modify: `src/components/SheetTab.jsx`
- Modify: `src/components/WeekSelector.jsx` (className props or wrapper)
- Modify: `src/components/ExcelUpload.jsx` (compact already exists — wire to context bar)

**Interfaces:**
- Consumes: `useSheetReportActions` return object
- Produces: DOM structure:

```jsx
<div className={`sheet-tab ${hasData ? 'is-active-report' : ''} ${isSaved ? 'is-saved-report' : ''}`}>
  <header className="sheet-tab-context">...</header>
  {pendingBanner}
  <KpiStrip stats={...} />
  <SheetReportPanel ... exportRef>
    <div className="sheet-tab-split">
      <div className="sheet-tab-col sheet-tab-col--left"><ThongKeDoiTac .../></div>
      <div className="sheet-tab-col sheet-tab-col--right"><ThongKeGiaoHang .../></div>
    </div>
    <DetailAccordion .../>
  </SheetReportPanel>
</div>
```

- [ ] **Step 1:** Remove `view` state and view toggle buttons (R11). Always use merged composition for `donC`/`donDTP`.

- [ ] **Step 2:** Implement `KpiStrip` inline or small helper in same file — compute from `activeData`:

```javascript
const valid = activeData.filter(r => String(r['Mã kiện hàng'] ?? '').trim())
const delivered = valid.filter(r => r['Trạng thái'] === 'Đã giao').length
const total = valid.length
const rate = total ? Math.round((delivered / total) * 100) : 0
const pending = total - delivered
```

- [ ] **Step 3:** Context bar left: eyebrow (`Giao hàng Đơn C` / `Giao hàng Đơn DTP` from prop) + `WeekSelector` + saved pill if `savedIds.includes(activeId)`.

- [ ] **Step 4:** Context bar right: `ExcelUpload compact` (hidden when saved-only / no live excel) + primary `Lưu số liệu tuần này` + overflow menu (`⋮`) with Xuất ảnh, In, Relink, Xóa tuần (confirm).

- [ ] **Step 5:** Detail accordion at bottom — default closed, `aria-expanded`, panel with `DataTable compact`.

- [ ] **Step 6:** Empty state (`displayWeeks.length === 0`) — centered upload, no split.

- [ ] **Step 7:** Pass `type` through unchanged; DTP gets same layout (hold handled in Task 5).

Run: `npm test -- SheetTab`

---

### Task 5: ThongKeDoiTac restyle + DTP hold placement

**Files:**
- Modify: `src/components/ThongKeDoiTac.jsx`

**Interfaces:**
- Consumes: existing props `{ data, type, weekKey, referenceDate }`
- Produces: compact section markup using `sheet-tab-section`, `sheet-tab-stat-row`, disclosure buttons with `aria-expanded`

- [ ] **Step 1:** Replace large colored section cards with neutral `.sheet-tab-section` blocks — eyebrow + total badge.

- [ ] **Step 2:** Each group (trực tiếp, chành, VTP, SPX): default collapsed summary row; "Chi tiết" toggles sub-rows / `DetailTable`.

- [ ] **Step 3:** **DTP only (`type === 'donDTP'`):** render hold block immediately after Viettel Post section — reuse existing hold logic from `CarrierPanel` / `SummaryBar` (do not duplicate counting). Show count "Chờ lấy", missing file hint, unmatched red rows in detail when expanded.

- [ ] **Step 4:** `FrozenCarrierCards` — compact inline with "Đóng băng" chip.

- [ ] **Step 5:** Run `DeliveryReportPresentation.test.jsx` — counts must match Task 1 baseline.

Run: `npm test -- DeliveryReportPresentation`

---

### Task 6: ThongKeGiaoHang restyle

**Files:**
- Modify: `src/components/ThongKeGiaoHang.jsx`

- [ ] **Step 1:** Replace `STAT_COLS` full pastel `bg-*-50 border-*-200` boxes with compact neutral grid (semantic color only on icon/badge).

- [ ] **Step 2:** KH breakdown rows — use subtle left border or chip, not full colored cards (`KH_COLORS` large boxes).

- [ ] **Step 3:** Keep all override inputs (`useChuaGiaoOverride`, chành xe chưa gửi) — restyle inputs to match `tongdon-action` / form tokens.

- [ ] **Step 4:** Re-run presentation tests — counts unchanged.

Run: `npm test -- DeliveryReportPresentation`

---

### Task 7: DataTable compact + WeekSelector a11y

**Files:**
- Modify: `src/components/DataTable.jsx`
- Modify: `src/components/WeekSelector.jsx`

- [ ] **Step 1:** Add optional prop `compact?: boolean` — smaller padding, hide non-essential columns on compact if needed (keep Mã kiện, Trạng thái, VC editable, Ghi chú).

- [ ] **Step 2:** WeekSelector: add `onKeyDown` Escape closes popover; return focus to trigger; apply `sheet-tab-week` classes.

- [ ] **Step 3:** Ensure horizontal scroll contained in `.sheet-tab-accordion-panel`.

---

### Task 8: Saved snapshot view + print/export polish

**Files:**
- Modify: `src/components/SheetReportPanel.jsx` (`SnapshotView`)
- Modify: `src/index.css` (print)

- [ ] **Step 1:** When `snapshot` active, apply `is-saved-report` on root; show eyebrow "Bản đã lưu".

- [ ] **Step 2:** `SnapshotView` restyle to match new section anatomy (same split if snapshot includes frozen carrier — preserve data).

- [ ] **Step 3:** Print CSS: hide context bar, overflow menu, sidebar if needed; show full export surface.

- [ ] **Step 4:** Manual smoke: save week → pending clear banner → undo; relink; export PNG.

---

### Task 9: Final verification

- [ ] **Step 1:** `npm test` — all tests pass.

- [ ] **Step 2:** `npm run lint` — fix new issues in touched files.

- [ ] **Step 3:** `npm run dev` — visual check Đơn C @ 1440×900: no page scroll, accordion closed, KPI + 2 columns visible.

- [ ] **Step 4:** Visual check Đơn DTP: hold block under VTP.

- [ ] **Step 5:** Mobile width ~390px: single column, page scroll OK.

- [ ] **Step 6:** Document any intentional test expectation updates in PR notes (not in spec).

---

## Spec Coverage Self-Review

| Requirement | Task |
|-------------|------|
| R1–R6 layout | 2, 4 |
| R7–R11 toolbar | 3, 4 |
| R12–R13 KPI | 4 |
| R14–R16 VC column | 5 |
| R17–R18 delivery column | 6 |
| R19–R20 saved mode | 2, 8 |
| R21–R23 design tokens | 2 |
| R24–R25 export | 3, 8 |
| R26–R28 immutable logic | all — presentation only |

## Handoff (agent-workflow-kit)

| Step | Who | What |
|------|-----|------|
| Pass 1 Design | Cursor brainstorming | **Done** — origin requirements R1–R28 |
| Pass 2a Code | **Claude** chat 1 | Tasks 1–4 (tests + CSS + hook + SheetTab shell) → simplify nhẹ → **DỪNG** nếu ctx đầy |
| Pass 2b Code | **Claude** chat 2 (mới) | Tasks 5–9 → `code-simplifier:code-simplifier` → **`open-code-review-delegate`** → self-review vs LOCKED → **DỪNG** |
| Audit | **Cursor** | Cổng cuối — FORBIDDEN + Acceptance + visual |
| Pass 2 tighten | **Codex** | Chỉ khi Cursor FAIL / Sonar / lệch DoD |

**Harness:** không bootstrap. Nếu Claude lặp sai sau audit → Cursor chạy `harness-mistake-log`.
