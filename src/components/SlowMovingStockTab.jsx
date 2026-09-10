import { useMemo, useRef, useState } from 'react'
import { Upload, FileUp, FileSpreadsheet, X, Search, PackageSearch, Download, Hourglass, TriangleAlert } from 'lucide-react'
import * as XLSX from 'xlsx'
import { opsStore as localStorage } from '../data/workspace'
import { ResizeHandle } from './DataTable'
import { parseExpiryStockWorkbook, parseReportDateRange, isSlowMoving } from '../utils/parseExpiryStock'

// Ngưỡng "chậm luân chuyển" theo đúng yêu cầu: không phát sinh Sl nhập lẫn Sl xuất trong SUỐT khoảng thời
// gian file báo cáo bao phủ ("Từ ngày ... đến ngày ..." ở đầu file) — không phải 1 mốc ngày cố định tính từ
// hôm nay như "hàng cận date", vì file chỉ có tổng nhập/xuất trong khoảng đã chọn khi xuất báo cáo, không
// có ngày phát sinh cuối cùng của từng dòng.
const MIN_DAYS = 90

// ---- Lưu trữ dữ liệu upload theo TỪNG THÁNG, giống hệt ExpiryStockTab.jsx nhưng tách riêng storage key —
// đây là 1 tính năng độc lập (dù đọc cùng định dạng file), không dùng chung dữ liệu với tab Tồn kho cận date.
const STORAGE_KEY = 'slow_moving_stock_months'
const ACTIVE_KEY = 'slow_moving_stock_active'
const MAX_MONTHS = 24

function readMonths() {
  try {
    const months = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    return Array.isArray(months) ? months : []
  } catch { return [] }
}
function writeMonths(months) { localStorage.setItem(STORAGE_KEY, JSON.stringify(months)) }

function addMonth(entry) {
  const months = readMonths()
  const withId = { id: entry.uploadedAt || String(Date.now()), ...entry }
  const next = [withId, ...months].slice(0, MAX_MONTHS)
  writeMonths(next)
  localStorage.setItem(ACTIVE_KEY, withId.id)
  return withId
}
function removeMonthEntry(id) {
  const months = readMonths().filter(m => m.id !== id)
  writeMonths(months)
  const activeId = localStorage.getItem(ACTIVE_KEY)
  if (activeId === id) {
    if (months[0]) localStorage.setItem(ACTIVE_KEY, months[0].id)
    else localStorage.removeItem(ACTIVE_KEY)
  }
  return months
}

const TABLE_COLUMNS = ['Mã vật tư', 'Tên vật tư', 'Mã kho', 'Mã lô', 'Hạn dùng', 'Tồn cuối', 'Đvt']
const DEFAULT_COL_WIDTH = {
  'Mã vật tư': 110, 'Tên vật tư': 280, 'Mã kho': 90, 'Mã lô': 120,
  'Hạn dùng': 100, 'Tồn cuối': 100, 'Đvt': 80,
}
const COLWIDTHS_KEY = 'slow_moving_stock_colwidths'

function useColWidths() {
  const init = () => {
    try {
      const saved = JSON.parse(localStorage.getItem(COLWIDTHS_KEY) || '{}')
      return { ...DEFAULT_COL_WIDTH, ...saved }
    } catch { return { ...DEFAULT_COL_WIDTH } }
  }
  const [widths, setWidths] = useState(init)
  const setWidth = (key, w) => setWidths(prev => {
    const next = { ...prev, [key]: Math.max(60, w) }
    localStorage.setItem(COLWIDTHS_KEY, JSON.stringify(next))
    return next
  })
  const resetWidths = () => {
    localStorage.removeItem(COLWIDTHS_KEY)
    setWidths({ ...DEFAULT_COL_WIDTH })
  }
  return [widths, setWidth, resetWidths]
}

function formatDateVi(iso) {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function exportRowsToExcel(rows, active) {
  const data = rows.map((r, i) => ({
    'Stt': i + 1,
    'Mã vật tư': r.maVatTu,
    'Tên vật tư': r.tenVatTu,
    'Mã kho': r.maKho,
    'Đvt': r.dvt,
    'Mã lô': r.maLo,
    'Hạn dùng': formatDateVi(r.hanDung),
    'Tồn cuối': r.tonCuoi,
  }))
  const ws = XLSX.utils.json_to_sheet(data)
  const headers = Object.keys(data[0] || {})
  ws['!cols'] = headers.map(h => {
    const maxLen = data.reduce((max, row) => Math.max(max, String(row[h] ?? '').length), h.length)
    return { wch: Math.min(Math.max(maxLen + 2, 8), 40) }
  })
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Hang cham luan chuyen')
  const monthLabel = new Date(active.uploadedAt).toLocaleDateString('vi-VN', { month: '2-digit', year: 'numeric' }).replace('/', '-')
  XLSX.writeFile(wb, `HangChamLuanChuyen_${monthLabel}.xlsx`)
}

export default function SlowMovingStockTab() {
  const inputRef = useRef()
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState('')
  const [months, setMonths] = useState(() => readMonths())
  const [activeId, setActiveId] = useState(() => {
    const saved = localStorage.getItem(ACTIVE_KEY)
    const all = readMonths()
    if (all.find(m => m.id === saved)) return saved
    return all[0]?.id || null
  })
  const [search, setSearch] = useState('')
  const [khoFilter, setKhoFilter] = useState('all')
  const [colWidths, setColWidth, resetColWidths] = useColWidths()

  const active = months.find(m => m.id === activeId) || null

  const parseFile = (file) => {
    setError('')
    if (!file) return
    const ext = file.name.split('.').pop().toLowerCase()
    if (!['xlsx', 'xls'].includes(ext)) { setError('Chỉ hỗ trợ file .xlsx hoặc .xls'); return }
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const rows = parseExpiryStockWorkbook(e.target.result)
        if (rows.length === 0) { setError('Không tìm thấy dữ liệu vật tư trong file.'); return }
        const dateRange = parseReportDateRange(e.target.result)
        const entry = addMonth({ fileName: file.name, uploadedAt: new Date().toISOString(), rows, dateRange })
        setMonths(readMonths())
        setActiveId(entry.id)
      } catch (err) {
        setError(err.message || 'Không đọc được file. Vui lòng kiểm tra lại.')
      }
    }
    reader.readAsArrayBuffer(file)
  }

  const handleDrop = (e) => { e.preventDefault(); setDragging(false); parseFile(e.dataTransfer.files[0]) }

  const removeActive = () => {
    if (!active) return
    if (!window.confirm(`Xoá dữ liệu tháng "${active.fileName}"? Các tháng khác vẫn được giữ nguyên.`)) return
    const next = removeMonthEntry(active.id)
    setMonths(next)
    setActiveId(next[0]?.id || null)
  }

  const selectMonth = (id) => {
    localStorage.setItem(ACTIVE_KEY, id)
    setActiveId(id)
  }

  const slowRows = useMemo(() => {
    if (!active) return []
    return (active.rows || []).filter(isSlowMoving)
  }, [active])

  const khoOptions = useMemo(() => [...new Set(slowRows.map(r => r.maKho).filter(Boolean))].sort(), [slowRows])

  const filteredRows = useMemo(() => {
    let rows = slowRows
    if (khoFilter !== 'all') rows = rows.filter(r => r.maKho === khoFilter)
    if (search) {
      const q = search.toLowerCase()
      rows = rows.filter(r => r.maVatTu.toLowerCase().includes(q) || r.tenVatTu.toLowerCase().includes(q) || r.maLo.toLowerCase().includes(q))
    }
    return [...rows].sort((a, b) => a.maVatTu.localeCompare(b.maVatTu))
  }, [slowRows, khoFilter, search])

  const dateRange = active?.dateRange || null
  const rangeTooShort = dateRange && dateRange.soNgay < MIN_DAYS

  if (!active) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false) }}
          onDrop={handleDrop}
          onClick={() => inputRef.current.click()}
          className={`flex flex-col items-center justify-center gap-3 w-full h-56 rounded-2xl border-2 border-dashed cursor-pointer transition-all select-none
            ${dragging ? 'border-blue-500 bg-blue-50 scale-[1.01]' : 'border-gray-300 bg-white hover:border-blue-400 hover:bg-blue-50/30'}`}
        >
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${dragging ? 'bg-blue-100' : 'bg-gray-100'}`}>
            {dragging ? <FileUp size={24} className="text-blue-500" /> : <Upload size={24} className="text-gray-400" />}
          </div>
          <div className="text-center">
            <p className="text-gray-700 font-semibold text-sm">Kéo & thả file "Báo cáo tổng hợp nhập xuất tồn theo kho" vào đây</p>
            <p className="text-gray-400 text-xs mt-1">hoặc <span className="text-blue-600 underline font-medium">click để chọn file .xlsx</span> — nên xuất báo cáo với khoảng thời gian từ {MIN_DAYS} ngày trở lên để kết quả chính xác</p>
          </div>
        </div>
        {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
        <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={e => parseFile(e.target.files[0])} />
      </div>
    )
  }

  return (
    <div>
      {months.length > 1 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {months.map(m => (
            <button
              key={m.id}
              onClick={() => selectMonth(m.id)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                m.id === activeId ? 'bg-[#1e3a5f] text-white border-[#1e3a5f]' : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
              }`}
              title={m.fileName}
            >
              {new Date(m.uploadedAt).toLocaleDateString('vi-VN', { month: '2-digit', year: 'numeric' })}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-sm">
          <FileSpreadsheet size={15} className="text-green-600 flex-shrink-0" />
          <span className="text-green-700 font-medium truncate max-w-72">{active.fileName}</span>
          <span className="text-green-500 text-xs">({slowRows.length} mặt hàng chậm luân chuyển)</span>
          <button onClick={removeActive} className="ml-1 p-0.5 rounded hover:bg-green-100 text-green-400 hover:text-green-700" title="Xoá hẳn dữ liệu tháng này (các tháng khác không bị ảnh hưởng)">
            <X size={14} />
          </button>
        </div>
        <button
          onClick={() => inputRef.current.click()}
          className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm hover:border-blue-400 hover:text-blue-600 text-gray-600 transition-colors"
        >
          <Upload size={14} />
          Upload tháng mới
        </button>
        <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={e => parseFile(e.target.files[0])} />
        <span className="text-xs text-gray-400">Cập nhật: {new Date(active.uploadedAt).toLocaleString('vi-VN')}</span>
      </div>
      {error && <p className="mb-3 text-sm text-red-500">{error}</p>}

      <div className={`flex items-start gap-2.5 mb-5 px-3.5 py-3 rounded-xl border text-sm ${rangeTooShort ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-indigo-50 border-indigo-200 text-indigo-800'}`}>
        {rangeTooShort ? <TriangleAlert size={17} className="flex-shrink-0 mt-0.5" /> : <Hourglass size={17} className="flex-shrink-0 mt-0.5" />}
        {dateRange ? (
          <p>
            File báo cáo khoảng <span className="font-semibold">{formatDateVi(dateRange.tuNgay)} → {formatDateVi(dateRange.denNgay)}</span> ({dateRange.soNgay} ngày)
            {rangeTooShort ? (
              <> — <span className="font-semibold">chưa đủ {MIN_DAYS} ngày</span>, danh sách bên dưới có thể chưa phản ánh đúng "chậm luân chuyển" (không phát sinh nhập/xuất &gt; {MIN_DAYS} ngày). Nên xuất lại báo cáo với khoảng thời gian dài hơn.</>
            ) : (
              <> — hàng bên dưới không có phát sinh nhập/xuất trong suốt khoảng này (≥ {MIN_DAYS} ngày), còn tồn kho.</>
            )}
          </p>
        ) : (
          <p>Không đọc được khoảng thời gian báo cáo (dòng "Từ ngày ... đến ngày ...") từ file — không xác nhận được có đủ {MIN_DAYS} ngày hay không, kiểm tra lại số liệu trước khi báo luân chuyển.</p>
        )}
      </div>

      <div className="flex flex-wrap gap-2 mb-3 items-center">
        <div className="relative flex-1 min-w-48 max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            placeholder="Tìm mã hàng, tên hàng, mã lô..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        {khoOptions.length > 1 && (
          <select
            value={khoFilter}
            onChange={e => setKhoFilter(e.target.value)}
            className="border border-gray-200 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          >
            <option value="all">Tất cả kho</option>
            {khoOptions.map(k => <option key={k} value={k}>{k}</option>)}
          </select>
        )}
        <span className="text-xs text-gray-400 whitespace-nowrap">{filteredRows.length} dòng</span>
        <button
          onClick={resetColWidths}
          className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm hover:border-blue-400 hover:text-blue-600 text-gray-600 transition-colors ml-auto"
          title="Đặt lại độ rộng cột về mặc định"
        >
          Đặt lại độ rộng cột
        </button>
        <button
          onClick={() => exportRowsToExcel(filteredRows, active)}
          disabled={filteredRows.length === 0}
          className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm hover:border-green-400 hover:text-green-600 text-gray-600 transition-colors disabled:opacity-40 disabled:pointer-events-none"
        >
          <Download size={14} />
          Xuất Excel
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="text-sm border-collapse" style={{ tableLayout: 'fixed', width: TABLE_COLUMNS.reduce((sum, c) => sum + colWidths[c], 0), minWidth: '100%' }}>
          <thead>
            <tr className="bg-[#1e3a5f] text-white text-xs">
              {TABLE_COLUMNS.map(c => (
                <th
                  key={c}
                  className={`px-3 py-2.5 font-semibold whitespace-nowrap relative ${c === 'Tồn cuối' || c === 'Đvt' ? 'text-center' : 'text-left'}`}
                  style={{ width: colWidths[c] }}
                >
                  {c}
                  <ResizeHandle colKey={c} setWidth={setColWidth} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredRows.length === 0 ? (
              <tr>
                <td colSpan={TABLE_COLUMNS.length} className="text-center py-10 text-gray-400">
                  <div className="flex flex-col items-center gap-2">
                    <PackageSearch size={24} className="text-gray-300" />
                    Không có mặt hàng nào chậm luân chuyển
                  </div>
                </td>
              </tr>
            ) : filteredRows.map((r, i) => (
              <tr key={`${r.maVatTu}_${r.maLo}_${i}`} className="border-b border-gray-100 text-[12px] hover:bg-blue-50/40">
                <td className="px-3 py-2 font-mono" style={{ maxWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.maVatTu}</td>
                <td className="px-3 py-2" style={{ maxWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.tenVatTu || '—'}</td>
                <td className="px-3 py-2" style={{ maxWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.maKho || '—'}</td>
                <td className="px-3 py-2 font-mono" style={{ maxWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.maLo || '—'}</td>
                <td className="px-3 py-2" style={{ maxWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{formatDateVi(r.hanDung)}</td>
                <td className="px-3 py-2 text-center font-medium" style={{ maxWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.tonCuoi.toLocaleString('vi-VN')}</td>
                <td className="px-3 py-2 text-center" style={{ maxWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.dvt || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
