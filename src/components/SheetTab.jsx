import { useState } from 'react'
import { List, BarChart2, Truck } from 'lucide-react'
import { useSheetData } from '../useSheetData'
import { useWeeklyData } from '../useWeeklyData'
import DataTable from './DataTable'
import ThongKeGiaoHang from './ThongKeGiaoHang'
import ThongKeDoiTac from './ThongKeDoiTac'
import ExcelUpload from './ExcelUpload'
import WeekSelector from './WeekSelector'

export default function SheetTab({ sheetId, gid, type }) {
  const sheet = useSheetData(sheetId, gid)
  const [view, setView] = useState('list')
  const { weeks, activeWeek, activeId, addWeek, removeWeek, renameWeek, selectWeek } = useWeeklyData(type)

  const activeData = activeWeek ? activeWeek.data : sheet.data
  const loading = activeWeek ? false : sheet.loading
  const error = activeWeek ? null : sheet.error

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
    </div>
  )
}
