import { useState, useMemo, useRef } from 'react'
import { opsStore as localStorage } from '../data/workspace'
import { List, ChevronDown, ChevronUp, ClipboardList, Download, Printer, RefreshCw } from 'lucide-react'
import { useWeeklyData } from '../useWeeklyData'
import DataTable, { VC_KEY } from './DataTable'
import ThongKeGiaoHang from './ThongKeGiaoHang'
import ThongKeDoiTac from './ThongKeDoiTac'
import ExcelUpload from './ExcelUpload'
import WeekSelector from './WeekSelector'
import SheetReportPanel from './SheetReportPanel'
import { readSheetReports, renameSheetReport, removeSheetReport } from '../utils/sheetReports'
import { useSheetReportActions } from './useSheetReportActions'

// Đơn C và Đơn DTP luôn dùng merged composition — không có view toggle
const TYPE_LABEL = type => type === 'donC' ? 'Giao hàng Đơn C' : 'Giao hàng Đơn DTP'

export default function SheetTab({ type }) {
  const { weeks, activeWeek, activeId, addWeek, removeWeek, renameWeek, selectWeek, pendingClear, schedulePendingClear, cancelPendingClear } = useWeeklyData(type)

  // Đọc báo cáo đã lưu từ storage. Re-read khi type/weeks đổi (sau lưu/xoá Excel), không dùng effect.
  const [savedReports, setSavedReports] = useState(() => readSheetReports(type))
  const [savedReportsSource, setSavedReportsSource] = useState({ type, weeks })
  if (savedReportsSource.type !== type || savedReportsSource.weeks !== weeks) {
    setSavedReportsSource({ type, weeks })
    setSavedReports(readSheetReports(type))
  }

  const savedIds = useMemo(() => savedReports.map(r => r.id), [savedReports])

  // Xử lý đổi tên/xoá: ưu tiên Excel gốc, nếu chỉ còn bản đã lưu thì sửa trực tiếp
  const existingWeekIds = useMemo(() => new Set(weeks.map(w => w.id)), [weeks])
  const renameAny = (id, label) => {
    if (existingWeekIds.has(id)) { renameWeek(id, label); return }
    setSavedReports(renameSheetReport(type, id, label))
  }
  const removeAny = (id) => {
    if (existingWeekIds.has(id)) { removeWeek(id); return }
    setSavedReports(removeSheetReport(type, id))
  }

  // Gộp thêm tuần chỉ còn bản đã lưu
  const displayWeeks = useMemo(() => {
    const existingIds = new Set(weeks.map(w => w.id))
    const savedOnly = savedReports
      .filter(r => !existingIds.has(r.id))
      .map(r => ({ id: r.id, label: r.label, fileName: null, uploadedAt: r.createdAt, data: [] }))
    if (savedOnly.length === 0) return weeks
    return [...weeks, ...savedOnly].sort((a, b) => new Date(a.uploadedAt) - new Date(b.uploadedAt))
  }, [weeks, savedReports])

  const activeWeekDisplay = displayWeeks.find(w => w.id === activeId) || activeWeek
  const loading = false
  const error = null

  // VC edits per invoice key
  const storageKey = `vc_edits_${type}`
  const [vcEdits, setVcEdits] = useState(() => {
    try { return JSON.parse(localStorage.getItem(storageKey) || '{}') } catch { return {} }
  })
  const onEditVC = (key, value) => {
    const next = { ...vcEdits, [key]: value }
    setVcEdits(next)
    localStorage.setItem(storageKey, JSON.stringify(next))
  }
  const activeData = useMemo(() => {
    const rows = activeWeekDisplay?.data ?? []
    return rows.map((row, i) => {
      // Align with DataTable fallback (DataTable.jsx:416: row['Mã hóa đơn'] || String(i))
      const key = row['Mã hóa đơn'] || String(i)
      return vcEdits[key] !== undefined ? { ...row, [VC_KEY]: vcEdits[key] } : row
    })
  }, [activeWeekDisplay, vcEdits])

  const referenceDate = activeWeekDisplay?.uploadedAt || null

  // ─── Actions from extracted hook ─────────────────────────────────────────────
  const exportRef = useRef(null)
  const [listExpanded, setListExpanded] = useState(false)

  const {
    snapshot,
    isPendingClear,
    handleSave,
    handleUndo,
    handleRelink,
    handleExportImage,
    handlePrint,
    handleClearCarrierNow,
    exporting,
    pendingBannerProps,
  } = useSheetReportActions({
    type,
    data: activeData,
    weekId: activeId,
    weekLabel: activeWeekDisplay?.label,
    referenceDate,
    pendingClear,
    onSaved: schedulePendingClear,
    onUndoClear: cancelPendingClear,
    exportRef,
    listExpanded,
    setListExpanded,
  })

  const isSaved = savedIds.includes(activeId)
  const hasData = displayWeeks.length > 0

  // ─── Empty state ────────────────────────────────────────────────────────────
  if (!hasData) {
    return (
      <div>
        <ExcelUpload onData={addWeek} fileName="" onClear={() => {}} />
      </div>
    )
  }

  return (
    <div className={`sheet-tab ${hasData ? 'is-active-report' : ''} ${isSaved ? 'is-saved-report' : ''}`}>
      <div className="sheet-tab-shell">

        {/* ── Context bar ──────────────────────────────────────────────────── */}
        <header className="sheet-tab-context" aria-label="Thao tác báo cáo">
          <span>{TYPE_LABEL(type)}</span>

          <WeekSelector
            weeks={displayWeeks}
            activeId={activeId}
            savedIds={savedIds}
            onSelect={selectWeek}
            onRemove={removeAny}
            onRename={renameAny}
          />

          {isSaved && (
            <span className="sheet-tab-saved-pill" aria-label="Tuần đã lưu">
              Đã lưu
            </span>
          )}

          {/* Actions — right side */}
          <div className="flex items-center gap-2 ml-auto">
            <ExcelUpload onData={addWeek} fileName="" onClear={() => {}} compact />
            {!snapshot && !isPendingClear && activeId && (
              <button
                type="button"
                onClick={handleSave}
                className="sheet-tab-action is-primary"
              >
                <ClipboardList size={13} />
                Lưu số liệu tuần này
              </button>
            )}
            {snapshot && (
              <>
                <button
                  type="button"
                  onClick={handleRelink}
                  className="sheet-tab-action"
                  title="Nối lại đúng file Viettel Post/SPX theo ngày"
                >
                  <RefreshCw size={13} />
                  Đối chiếu lại
                </button>
                <button
                  type="button"
                  onClick={handleExportImage}
                  disabled={exporting}
                  className="sheet-tab-action"
                >
                  <Download size={13} />
                  {exporting ? 'Đang xuất...' : 'Xuất ảnh'}
                </button>
                <button
                  type="button"
                  onClick={handlePrint}
                  className="sheet-tab-action"
                >
                  <Printer size={13} />
                  In
                </button>
              </>
            )}
          </div>
        </header>

        {/* ── Pending-clear banner ──────────────────────────────────────────── */}
        {pendingBannerProps && (
          <div className="flex items-center justify-between gap-2 px-4 py-2.5 rounded-lg bg-amber-50 border border-amber-200 text-sm">
            <span className="text-amber-800">
              {pendingBannerProps.message}
              <strong>{pendingBannerProps.timeRemaining}</strong> nữa.
            </span>
            <button
              type="button"
              onClick={handleUndo}
              className="flex items-center gap-1.5 px-3 py-1 bg-amber-600 text-white rounded-lg text-xs font-medium hover:bg-amber-700"
            >
              Hoàn tác
            </button>
          </div>
        )}

        {/* ── Report body ─────────────────────────────────────────────────── */}
        <div className="sheet-tab-report">
          <SheetReportPanel
            type={type}
            reportSnapshot={snapshot}
            onClearCarrierNow={handleClearCarrierNow}
            exportRef={exportRef}
          >
            <div className="sheet-tab-split">
              {/* Left: Đối tác VC */}
              <div className="sheet-tab-col sheet-tab-col--left">
                <ThongKeDoiTac
                  data={activeData}
                  type={type}
                  weekKey={activeId || 'live'}
                  referenceDate={referenceDate}
                />
              </div>
              {/* Right: Giao hàng */}
              <div className="sheet-tab-col sheet-tab-col--right">
                <ThongKeGiaoHang
                  data={activeData}
                  type={type}
                  weekKey={activeId || 'live'}
                  referenceDate={referenceDate}
                />
              </div>
            </div>

            {/* Detail accordion */}
            <div className="sheet-tab-accordion">
              <button
                type="button"
                className="sheet-tab-accordion-trigger"
                onClick={() => setListExpanded(v => !v)}
                aria-expanded={listExpanded}
                aria-controls="sheet-tab-accordion-panel"
                data-sheet-tab-accordion="true"
              >
                <List size={15} className="text-gray-500" aria-hidden="true" />
                <span>Danh sách chi tiết đơn hàng</span>
                {listExpanded
                  ? <ChevronUp size={15} className="text-gray-400 ml-auto" aria-hidden="true" />
                  : <ChevronDown size={15} className="text-gray-400 ml-auto" aria-hidden="true" />
                }
              </button>
              <div
                id="sheet-tab-accordion-panel"
                className="sheet-tab-accordion-panel"
                hidden={!listExpanded}
              >
                <DataTable
                  data={activeData}
                  loading={loading}
                  error={error}
                  onEditVC={onEditVC}
                />
              </div>
            </div>
          </SheetReportPanel>
        </div>

      </div>
    </div>
  )
}

