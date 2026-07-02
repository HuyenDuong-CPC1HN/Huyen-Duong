import { useState, useMemo } from 'react'
import { List, BarChart2, Truck, ClipboardCheck } from 'lucide-react'
import { useSheetData } from '../useSheetData'
import { useWeeklyData } from '../useWeeklyData'
import DataTable, { VC_KEY } from './DataTable'
import ThongKeGiaoHang from './ThongKeGiaoHang'
import ThongKeDoiTac from './ThongKeDoiTac'
import CarrierStats from './CarrierStats'
import ExcelUpload from './ExcelUpload'
import WeekSelector from './WeekSelector'

export default function SheetTab({ sheetId, gid, type }) {
  const sheet = useSheetData(sheetId, gid)
  const [view, setView] = useState('list')
  const { weeks, activeWeek, activeId, addWeek, removeWeek, renameWeek, selectWeek } = useWeeklyData(type)

  const rawData = activeWeek ? activeWeek.data : sheet.data
  const loading = activeWeek ? false : sheet.loading
  const error = activeWeek ? null : sheet.error

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

  return (
    <div>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        {/* View toggle */}
        <div className="flex gap-1 bg-white border border-gray-200 rounded-lg p-1">
          <button
            onClick={() => setView('list')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition-all ${
              view === 'list' ? 'bg-[#1e3a5f] text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <List size={14} /> Danh sách
          </button>
          <button
            onClick={() => setView('stats')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition-all ${
              view === 'stats' ? 'bg-[#1e3a5f] text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <BarChart2 size={14} /> Thống kê giao hàng
          </button>
          <button
            onClick={() => setView('partner')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition-all ${
              view === 'partner' ? 'bg-[#1e3a5f] text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Truck size={14} /> Đối tác VC
          </button>
          <button
            onClick={() => setView('doisoat')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition-all ${
              view === 'doisoat' ? 'bg-[#1e3a5f] text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <ClipboardCheck size={14} /> Đối soát VTP/SPX
          </button>
        </div>

        {/* Week selector */}
        {weeks.length > 0 && (
          <WeekSelector
            weeks={weeks}
            activeId={activeId}
            onSelect={selectWeek}
            onRemove={removeWeek}
            onRename={renameWeek}
          />
        )}

        {/* Upload badge hoặc nút upload tuần mới */}
        <ExcelUpload onData={addWeek} fileName="" onClear={() => {}} compact />
      </div>

      {/* Chưa có tuần nào: hiện khung upload to */}
      {weeks.length === 0 && (
        <div className="mb-4">
          <ExcelUpload onData={addWeek} fileName="" onClear={() => {}} />
        </div>
      )}

      {/* Nội dung */}
      {view === 'list' && (
        <DataTable
          data={activeData}
          loading={loading}
          error={error}
          refresh={sheet.refresh}
          lastRefresh={activeWeek ? null : sheet.lastRefresh}
          onEditVC={onEditVC}
        />
      )}
      {view === 'stats' && (
        loading
          ? <div className="text-center py-20 text-gray-400">Đang tải dữ liệu...</div>
          : <ThongKeGiaoHang data={activeData} type={type} />
      )}
      {view === 'partner' && (
        loading
          ? <div className="text-center py-20 text-gray-400">Đang tải dữ liệu...</div>
          : <ThongKeDoiTac data={activeData} />
      )}
      {view === 'doisoat' && <CarrierStats type={type} />}
    </div>
  )
}
