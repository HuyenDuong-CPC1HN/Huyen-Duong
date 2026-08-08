import { useState, useMemo } from 'react'
import { List, BarChart2, Truck, ChevronDown, ChevronUp } from 'lucide-react'
import { useWeeklyData } from '../useWeeklyData'
import DataTable, { VC_KEY } from './DataTable'
import ThongKeGiaoHang from './ThongKeGiaoHang'
import ThongKeDoiTac from './ThongKeDoiTac'
import ExcelUpload from './ExcelUpload'
import WeekSelector from './WeekSelector'
import SheetReportPanel from './SheetReportPanel'
import { readSheetReports } from '../utils/sheetReports'

// Gộp Danh sách + Thống kê giao hàng + Đối tác VC thành 1 tab, danh sách chi tiết thu gọn mặc định
const MERGE_LIST_PARTNER = type => type === 'donC' || type === 'donDTP'

export default function SheetTab({ type }) {
  const [view, setView] = useState(MERGE_LIST_PARTNER(type) ? 'partner' : 'list')
  const merged = MERGE_LIST_PARTNER(type)
  const [listExpanded, setListExpanded] = useState(false)
  const { weeks, activeWeek, activeId, addWeek, removeWeek, renameWeek, selectWeek, pendingClear, schedulePendingClear, cancelPendingClear } = useWeeklyData(type)

  // Tuần nào đã bấm "Lưu số liệu tuần này" — hiện tag "Đã lưu" trong Lịch sử upload để dễ phân biệt
  const savedReports = useMemo(() => (merged ? readSheetReports(type) : []), [merged, type, weeks])
  const savedIds = useMemo(() => savedReports.map(r => r.id), [savedReports])

  // Gộp thêm các tuần CHỈ còn bản đã lưu (Excel gốc đã bị "Lưu báo cáo Tổng đơn" xoá bớt để đỡ tốn dung lượng,
  // dù bản thân tuần đó đã "Lưu số liệu tuần này" — vẫn phải hiện & chọn lại được ngay từ tab này, không chỉ từ
  // tab Tổng đơn) — nếu không sẽ trông như mất dữ liệu dù số liệu đã lưu vẫn còn nguyên.
  const displayWeeks = useMemo(() => {
    const existingIds = new Set(weeks.map(w => w.id))
    const savedOnly = savedReports
      .filter(r => !existingIds.has(r.id))
      .map(r => ({ id: r.id, label: r.label, fileName: null, uploadedAt: r.createdAt, data: [] }))
    if (savedOnly.length === 0) return weeks
    return [...weeks, ...savedOnly].sort((a, b) => new Date(a.uploadedAt) - new Date(b.uploadedAt))
  }, [weeks, savedReports])

  const activeWeekDisplay = displayWeeks.find(w => w.id === activeId) || activeWeek

  const rawData = activeWeekDisplay ? activeWeekDisplay.data : []
  const loading = false
  const error = null

  const storageKey = `vc_edits_${type}`
  const [vcEdits, setVcEdits] = useState(() => {
    try { return JSON.parse(localStorage.getItem(storageKey) || '{}') } catch { return {} }
  })

  const onEditVC = (key, value) => {
    const next = { ...vcEdits, [key]: value }
    setVcEdits(next)
    localStorage.setItem(storageKey, JSON.stringify(next))
  }

  const activeData = useMemo(() => rawData.map(row => {
    const key = row['Mã hóa đơn'] || ''
    return vcEdits[key] !== undefined ? { ...row, [VC_KEY]: vcEdits[key] } : row
  }), [rawData, vcEdits])

  // Ngày upload của tuần Excel đang chọn — dùng để khớp đúng file VTP/SPX có ngày upload gần nhất
  // (đáng tin cậy hơn đếm vị trí, vì 2 danh sách Excel & VTP/SPX là 2 danh sách upload độc lập)
  const referenceDate = activeWeekDisplay?.uploadedAt || null

  if (displayWeeks.length === 0) {
    return (
      <div>
        <ExcelUpload onData={addWeek} fileName="" onClear={() => {}} />
      </div>
    )
  }

  return (
    <div>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        {/* View toggle */}
        <div className="flex gap-1 bg-white border border-gray-200 rounded-lg p-1">
          {!MERGE_LIST_PARTNER(type) && (
            <button
              onClick={() => setView('list')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition-all ${
                view === 'list' ? 'bg-[#1e3a5f] text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <List size={14} /> Danh sách
            </button>
          )}
          {!merged && (
            <button
              onClick={() => setView('stats')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition-all ${
                view === 'stats' ? 'bg-[#1e3a5f] text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <BarChart2 size={14} /> Thống kê giao hàng
            </button>
          )}
          <button
            onClick={() => setView('partner')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition-all ${
              view === 'partner' ? 'bg-[#1e3a5f] text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Truck size={14} /> {merged ? 'Thống kê & Danh sách' : 'Đối tác VC'}
          </button>
        </div>

        {/* Week selector */}
        {displayWeeks.length > 0 && (
          <WeekSelector
            weeks={displayWeeks}
            activeId={activeId}
            savedIds={savedIds}
            onSelect={selectWeek}
            onRemove={removeWeek}
            onRename={renameWeek}
          />
        )}

        {/* Upload badge hoặc nút upload tuần mới */}
        <ExcelUpload onData={addWeek} fileName="" onClear={() => {}} compact />
      </div>

      {/* Nội dung */}
      {view === 'list' && (
        <DataTable
          data={activeData}
          loading={loading}
          error={error}
          onEditVC={onEditVC}
        />
      )}
      {view === 'stats' && (
        loading
          ? <div className="text-center py-20 text-gray-400">Đang tải dữ liệu...</div>
          : <ThongKeGiaoHang data={activeData} type={type} weekKey={activeId || 'live'} referenceDate={referenceDate} />
      )}
      {view === 'partner' && (
        loading
          ? <div className="text-center py-20 text-gray-400">Đang tải dữ liệu...</div>
          : merged ? (
            <SheetReportPanel
              type={type}
              data={activeData}
              weekId={activeId}
              weekLabel={activeWeekDisplay?.label}
              referenceDate={referenceDate}
              pendingClear={pendingClear}
              onSaved={id => schedulePendingClear(id)}
              onUndoClear={cancelPendingClear}
            >
              <ThongKeDoiTac data={activeData} type={type} weekKey={activeId || 'live'} referenceDate={referenceDate} />
              <div className="mt-5">
                <ThongKeGiaoHang data={activeData} type={type} weekKey={activeId || 'live'} referenceDate={referenceDate} />
              </div>

              <div className="mt-5 bg-white rounded-xl border border-gray-200 overflow-hidden">
                <button
                  onClick={() => setListExpanded(v => !v)}
                  className="w-full flex items-center gap-2 px-5 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
                >
                  <List size={15} className="text-gray-500" />
                  <span className="font-semibold text-gray-700 text-sm">Danh sách chi tiết đơn hàng</span>
                  {listExpanded ? <ChevronUp size={15} className="text-gray-400 ml-auto" /> : <ChevronDown size={15} className="text-gray-400 ml-auto" />}
                </button>
                {listExpanded && (
                  <div className="p-4">
                    <DataTable
                      data={activeData}
                      loading={loading}
                      error={error}
                      onEditVC={onEditVC}
                    />
                  </div>
                )}
              </div>
            </SheetReportPanel>
          ) : (
            <ThongKeDoiTac data={activeData} type={type} weekKey={activeId || 'live'} referenceDate={referenceDate} />
          )
      )}
    </div>
  )
}
