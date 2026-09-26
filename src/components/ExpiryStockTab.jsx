import { useMemo, useRef, useState } from 'react'
import { Upload, FileUp, FileSpreadsheet, X, AlertTriangle, Clock, CircleAlert, Search, PackageSearch, Download, FileWarning, Hourglass, TriangleAlert, CalendarRange, FileDown } from 'lucide-react'
import * as XLSX from 'xlsx'
import { opsStore as localStorage } from '../data/workspace'
import { ResizeHandle } from './DataTable'
import { parseExpiryStockWorkbook, parseReportDateRange, isSlowMoving, classifyExpiry, daysUntil, drugAgeMonths, CAN_DATE_BUCKETS } from '../utils/parseExpiryStock'
import { exportExpiryDisposal } from '../utils/exportExpiryDisposal'
import { exportStockReport } from '../utils/exportStockReport'

// Tab gộp "Tồn kho cận date & chậm luân chuyển": 1 file "Báo cáo tổng hợp nhập xuất tồn theo kho" mỗi tháng,
// xem được cả hàng cận date lẫn hàng chậm luân chuyển (CLC), và xuất 1 file báo cáo 2 sheet đúng mẫu
// "CNHCM-T..._Báo cáo hàng cận date_CLC.xlsx".

// Ngưỡng "hàng còn hạn dùng dưới 1 tháng" dùng riêng cho Biên bản Xử lý/Xác minh — hẹp hơn bucket
// "near3" (dưới 3 tháng) đã có, và không gồm hàng đã hết hạn (daysLeft âm, thuộc bucket "expired" riêng,
// khác quy trình với "hàng cận date" mà 2 mẫu biên bản này dùng).
const DISPOSAL_DAYS_THRESHOLD = 30

// "Chậm luân chuyển" = không phát sinh Sl nhập lẫn Sl xuất trong SUỐT khoảng thời gian file báo cáo bao
// phủ ("Từ ngày ... đến ngày ..." ở đầu file) — khoảng này nên từ MIN_SLOW_DAYS ngày trở lên.
const MIN_SLOW_DAYS = 90

// ---- Lưu trữ dữ liệu upload theo TỪNG THÁNG, cố định/không bị ghi đè khi upload file mới ----
// expiry_stock_months = [{ id, fileName, uploadedAt, rows, dateRange }, ...] (mới nhất ở đầu)
const STORAGE_KEY = 'expiry_stock_months'
const ACTIVE_KEY = 'expiry_stock_active'
const MAX_MONTHS = 24 // tối đa số tháng giữ lại

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

const CARDS = [
  { key: 'expired', label: 'Hết hạn', icon: CircleAlert, cls: 'text-red-600', bg: 'bg-red-50 border-red-200', bgActive: 'bg-red-100 border-red-400' },
  { key: 'near3', label: 'Cận dưới 3 tháng', icon: AlertTriangle, cls: 'text-orange-600', bg: 'bg-orange-50 border-orange-200', bgActive: 'bg-orange-100 border-orange-400' },
  { key: 'near6', label: 'Cận dưới 6 tháng', icon: Clock, cls: 'text-amber-600', bg: 'bg-amber-50 border-amber-200', bgActive: 'bg-amber-100 border-amber-400' },
  { key: 'near18', label: 'Cận hạn 6–18 tháng (cảnh báo luân chuyển)', icon: CalendarRange, cls: 'text-sky-700', bg: 'bg-sky-50 border-sky-200', bgActive: 'bg-sky-100 border-sky-400' },
  { key: 'clc', label: 'Chậm luân chuyển (CLC)', icon: Hourglass, cls: 'text-indigo-700', bg: 'bg-indigo-50 border-indigo-200', bgActive: 'bg-indigo-100 border-indigo-400' },
]

const VIEWS = [
  { key: 'canDate', label: 'Cận date' },
  { key: 'near18', label: 'Cận hạn 6–18 tháng' },
  { key: 'clc', label: 'Chậm luân chuyển (CLC)' },
  { key: 'all', label: 'Tất cả tồn kho' },
]

// Cột bảng đúng theo 2 sheet của file báo cáo mẫu: "Cận date" (9 cột) và "CLC" (13 cột).
const CAN_DATE_COLUMNS = ['Stt', 'Mã vật tư', 'Tên vật tư', 'Mã kho', 'Đvt', 'Mã lô', 'Hạn dùng', 'Tuổi thuốc (Tháng)', 'Tồn cuối']
const CLC_COLUMNS = ['Stt', 'Mã vật tư', 'Tên vật tư', 'Mã kho', 'Đvt', 'Mã lô', 'Tên lô', 'Hạn dùng', 'Tuổi thuốc (Tháng)', 'Tồn đầu', 'Sl nhập', 'Sl xuất', 'Tồn cuối']
const NUMERIC_COLUMNS = new Set(['Stt', 'Tuổi thuốc (Tháng)', 'Tồn đầu', 'Sl nhập', 'Sl xuất', 'Tồn cuối'])
const DEFAULT_COL_WIDTH = {
  'Stt': 56, 'Mã vật tư': 100, 'Tên vật tư': 280, 'Mã kho': 84, 'Đvt': 70, 'Mã lô': 100, 'Tên lô': 100,
  'Hạn dùng': 100, 'Tuổi thuốc (Tháng)': 120, 'Tồn đầu': 90, 'Sl nhập': 84, 'Sl xuất': 84, 'Tồn cuối': 90,
}
const COLWIDTHS_KEY = 'expiry_stock_colwidths'

// Độ rộng cột do người dùng tự kéo chỉnh (kéo mép phải mỗi cột) — lưu lại để lần sau mở vẫn giữ nguyên.
function useColWidths() {
  const init = () => {
    try {
      const saved = JSON.parse(localStorage.getItem(COLWIDTHS_KEY) || '{}')
      return { ...DEFAULT_COL_WIDTH, ...saved }
    } catch { return { ...DEFAULT_COL_WIDTH } }
  }
  const [widths, setWidths] = useState(init)
  const setWidth = (key, w) => setWidths(prev => {
    const next = { ...prev, [key]: Math.max(50, w) }
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

function byExpiry(a, b) {
  if (!a.hanDung && !b.hanDung) return 0
  if (!a.hanDung) return 1
  if (!b.hanDung) return -1
  return a.hanDung.localeCompare(b.hanDung)
}

const AGE_CLASS = {
  expired: 'text-red-600 font-semibold',
  near3: 'text-orange-600 font-semibold',
  near6: 'text-amber-600 font-semibold',
  near18: 'text-sky-700 font-medium',
}

function ageTitle(daysLeft) {
  if (daysLeft === null) return 'Không rõ hạn dùng'
  return daysLeft < 0 ? `Quá hạn ${Math.abs(daysLeft)} ngày` : `Còn ${daysLeft} ngày`
}

function cellValue(col, r, i) {
  switch (col) {
    case 'Stt': return i + 1
    case 'Mã vật tư': return r.maVatTu
    case 'Tên vật tư': return r.tenVatTu || '—'
    case 'Mã kho': return r.maKho || '—'
    case 'Đvt': return r.dvt || '—'
    case 'Mã lô': return r.maLo || '—'
    case 'Tên lô': return r.tenLo || r.maLo || '—'
    case 'Hạn dùng': return formatDateVi(r.hanDung)
    case 'Tuổi thuốc (Tháng)': return r.tuoiThuoc ?? '—'
    case 'Tồn đầu': return (r.tonDau ?? 0).toLocaleString('vi-VN')
    case 'Sl nhập': return (r.slNhap ?? 0).toLocaleString('vi-VN')
    case 'Sl xuất': return (r.slXuat ?? 0).toLocaleString('vi-VN')
    case 'Tồn cuối': return (r.tonCuoi ?? 0).toLocaleString('vi-VN')
    default: return ''
  }
}

const VIEW_FILE_LABEL = { canDate: 'CanDate', expired: 'HetHan', near3: 'Duoi3Thang', near6: 'Duoi6Thang', near18: 'CanHan6-18Thang', clc: 'CLC', all: 'TatCa' }

// Xuất nhanh đúng danh sách đang xem trên màn hình (theo bộ lọc) — khác với "Xuất báo cáo" đúng mẫu 2 sheet.
function exportRowsToExcel(rows, active, view) {
  const data = rows.map((r, i) => ({
    'Stt': i + 1,
    'Mã vật tư': r.maVatTu,
    'Tên vật tư': r.tenVatTu,
    'Mã kho': r.maKho,
    'Đvt': r.dvt,
    'Mã lô': r.maLo,
    'Tên lô': r.tenLo || r.maLo,
    'Hạn dùng': formatDateVi(r.hanDung),
    'Tuổi thuốc (Tháng)': r.tuoiThuoc,
    'Tồn đầu': r.tonDau,
    'Sl nhập': r.slNhap,
    'Sl xuất': r.slXuat,
    'Tồn cuối': r.tonCuoi,
  }))
  const ws = XLSX.utils.json_to_sheet(data)
  // json_to_sheet không tự đặt độ rộng cột — mặc định quá hẹp khiến 2 cột liền nhau bị dính chữ vào nhau
  // khi mở bằng Excel/LibreOffice, nên tự tính theo nội dung dài nhất của từng cột (kể cả tiêu đề).
  const headers = Object.keys(data[0] || {})
  ws['!cols'] = headers.map(h => {
    const maxLen = data.reduce((max, row) => Math.max(max, String(row[h] ?? '').length), h.length)
    return { wch: Math.min(Math.max(maxLen + 2, 8), 40) }
  })
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Ton kho can date')
  const monthLabel = new Date(active.uploadedAt).toLocaleDateString('vi-VN', { month: '2-digit', year: 'numeric' }).replace('/', '-')
  XLSX.writeFile(wb, `TonKhoCanDate_${VIEW_FILE_LABEL[view] || 'CanDate'}_${monthLabel}.xlsx`)
}

export default function ExpiryStockTab() {
  const inputRef = useRef()
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState('')
  const [months, setMonths] = useState(() => readMonths())
  const [activeId, setActiveId] = useState(() => {
    const saved = localStorage.getItem(ACTIVE_KEY)
    const all = readMonths()
    if (all.some(m => m.id === saved)) return saved
    return all[0]?.id || null
  })
  const [view, setView] = useState('canDate') // canDate | expired | near3 | near6 | near18 | clc | all
  const [search, setSearch] = useState('')
  const [khoFilter, setKhoFilter] = useState('all')
  const [exportingDisposal, setExportingDisposal] = useState(false)
  const [exportingReport, setExportingReport] = useState(false)
  const [colWidths, setColWidth, resetColWidths] = useColWidths()

  const active = months.find(m => m.id === activeId) || null

  const parseFile = async (file) => {
    setError('')
    if (!file) return
    const ext = file.name.split('.').pop().toLowerCase()
    if (!['xlsx', 'xls'].includes(ext)) { setError('Chỉ hỗ trợ file .xlsx hoặc .xls'); return }
    try {
      const buffer = await file.arrayBuffer()
      const rows = parseExpiryStockWorkbook(buffer)
      if (rows.length === 0) { setError('Không tìm thấy dữ liệu vật tư trong file.'); return }
      const dateRange = parseReportDateRange(buffer)
      const entry = addMonth({ fileName: file.name, uploadedAt: new Date().toISOString(), rows, dateRange })
      setMonths(readMonths())
      setActiveId(entry.id)
    } catch (err) {
      setError(err.message || 'Không đọc được file. Vui lòng kiểm tra lại.')
    }
  }

  const handleDrop = (e) => { e.preventDefault(); setDragging(false); void parseFile(e.dataTransfer.files[0]) }

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

  const inStock = useMemo(() => {
    if (!active) return []
    const today = new Date()
    return (active.rows || [])
      .filter(r => r.tonCuoi > 0)
      .map(r => ({
        ...r,
        bucket: classifyExpiry(r.hanDung, today),
        daysLeft: daysUntil(r.hanDung, today),
        tuoiThuoc: drugAgeMonths(r.hanDung, today),
        slow: isSlowMoving(r),
      }))
  }, [active])

  const counts = useMemo(() => ({
    expired: inStock.filter(r => r.bucket === 'expired').length,
    near3: inStock.filter(r => r.bucket === 'near3').length,
    near6: inStock.filter(r => r.bucket === 'near6').length,
    near18: inStock.filter(r => r.bucket === 'near18').length,
    clc: inStock.filter(r => r.slow).length,
  }), [inStock])

  // Dữ liệu 2 sheet của báo cáo — luôn lấy toàn bộ tháng đang chọn, không phụ thuộc tìm kiếm/lọc kho.
  const reportRows = useMemo(() => ({
    canDateRows: inStock.filter(r => CAN_DATE_BUCKETS.includes(r.bucket)).sort(byExpiry),
    clcRows: inStock.filter(r => r.slow).sort(byExpiry),
  }), [inStock])

  const khoOptions = useMemo(() => [...new Set(inStock.map(r => r.maKho).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'vi')), [inStock])

  const filteredRows = useMemo(() => {
    let rows = inStock
    if (view === 'canDate') rows = rows.filter(r => CAN_DATE_BUCKETS.includes(r.bucket))
    else if (view === 'clc') rows = rows.filter(r => r.slow)
    else if (view !== 'all') rows = rows.filter(r => r.bucket === view)
    if (khoFilter !== 'all') rows = rows.filter(r => r.maKho === khoFilter)
    if (search) {
      const q = search.toLowerCase()
      rows = rows.filter(r => r.maVatTu.toLowerCase().includes(q) || r.tenVatTu.toLowerCase().includes(q) || r.maLo.toLowerCase().includes(q))
    }
    return [...rows].sort(byExpiry)
  }, [inStock, view, khoFilter, search])

  const columns = view === 'clc' ? CLC_COLUMNS : CAN_DATE_COLUMNS
  const activeView = ['expired', 'near3', 'near6'].includes(view) ? 'canDate' : view

  // Hàng còn hạn dùng dưới 1 tháng (chưa hết hạn) — nguồn cho Biên bản Xử lý + Xác minh, tính từ toàn bộ
  // inStock (không phụ thuộc tab/tìm kiếm/lọc kho đang chọn trên bảng), vì biên bản hủy cần đủ toàn bộ
  // hàng cận date trong tháng, không phải chỉ phần đang xem trên màn hình.
  const disposalRows = useMemo(
    () => inStock.filter(r => r.daysLeft !== null && r.daysLeft >= 0 && r.daysLeft < DISPOSAL_DAYS_THRESHOLD),
    [inStock],
  )

  const handleExportDisposal = async () => {
    if (disposalRows.length === 0) return
    setExportingDisposal(true)
    setError('')
    try {
      await exportExpiryDisposal(disposalRows.map(r => ({
        maHang: r.maVatTu,
        tenHang: r.tenVatTu,
        soLo: r.maLo,
        hanDung: r.hanDung,
        dvt: r.dvt,
        soLuong: r.tonCuoi,
        maKho: r.maKho,
      })))
    } catch (err) {
      setError(err.message || 'Không xuất được biên bản hàng cận date.')
    } finally {
      setExportingDisposal(false)
    }
  }

  const handleExportReport = async () => {
    setExportingReport(true)
    setError('')
    try {
      await exportStockReport({ ...reportRows, dateRange: active?.dateRange || null })
    } catch (err) {
      setError(err.message || 'Không xuất được báo cáo hàng cận date_CLC.')
    } finally {
      setExportingReport(false)
    }
  }

  if (!active) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <label
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false) }}
          onDrop={handleDrop}
          className={`flex flex-col items-center justify-center gap-3 w-full h-56 rounded-2xl border-2 border-dashed cursor-pointer transition-all select-none
            ${dragging ? 'border-blue-500 bg-blue-50 scale-[1.01]' : 'border-gray-300 bg-white hover:border-blue-400 hover:bg-blue-50/30'}`}
        >
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${dragging ? 'bg-blue-100' : 'bg-gray-100'}`}>
            {dragging ? <FileUp size={24} className="text-blue-500" /> : <Upload size={24} className="text-gray-400" />}
          </div>
          <div className="text-center">
            <p className="text-gray-700 font-semibold text-sm">Kéo & thả file "Báo cáo tổng hợp nhập xuất tồn theo kho" vào đây</p>
            <p className="text-gray-400 text-xs mt-1">hoặc <span className="text-blue-600 underline font-medium">click để chọn file .xlsx</span> — mỗi lần upload là 1 tháng dữ liệu; nên xuất báo cáo với khoảng thời gian từ {MIN_SLOW_DAYS} ngày trở lên để lọc đúng hàng chậm luân chuyển</p>
          </div>
          <input ref={inputRef} type="file" accept=".xlsx,.xls" className="sr-only" onChange={e => void parseFile(e.target.files[0])} />
        </label>
        {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
      </div>
    )
  }

  const dateRange = active.dateRange || null
  const rangeTooShort = dateRange && dateRange.soNgay < MIN_SLOW_DAYS

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
          <FileSpreadsheet size={15} className="text-green-600 shrink-0" />
          <span className="text-green-700 font-medium truncate max-w-72">{active.fileName}</span>
          <span className="text-green-500 text-xs">({inStock.length} mặt hàng còn tồn)</span>
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
        <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={e => void parseFile(e.target.files[0])} />
        <span className="text-xs text-gray-400">
          Cập nhật: {new Date(active.uploadedAt).toLocaleString('vi-VN')}
          {dateRange && <> · Kỳ báo cáo: {formatDateVi(dateRange.tuNgay)} → {formatDateVi(dateRange.denNgay)} ({dateRange.soNgay} ngày)</>}
        </span>
        <button
          onClick={() => void handleExportReport()}
          disabled={exportingReport || (reportRows.canDateRows.length === 0 && reportRows.clcRows.length === 0)}
          title="Xuất file báo cáo đúng mẫu: sheet Cận date (hết hạn, cận dưới 3 tháng, cận dưới 6 tháng) và sheet CLC (chậm luân chuyển)"
          className="flex items-center gap-1.5 px-3 py-2 bg-[#1e3a5f] text-white rounded-lg text-sm font-medium hover:bg-[#2a4d7a] transition-colors ml-auto disabled:opacity-40 disabled:pointer-events-none"
        >
          <FileDown size={15} />
          {exportingReport ? 'Đang tạo báo cáo...' : 'Xuất báo cáo Cận date & CLC'}
        </button>
      </div>
      {error && <p className="mb-3 text-sm text-red-500">{error}</p>}

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 mb-5">
        {CARDS.map(b => {
          const Icon = b.icon
          const isActive = view === b.key
          return (
            <button
              key={b.key}
              onClick={() => setView(isActive ? 'canDate' : b.key)}
              className={`flex items-center gap-3 rounded-xl border p-3.5 text-left transition-colors ${isActive ? b.bgActive : b.bg} hover:brightness-95`}
            >
              <Icon size={20} className={`${b.cls} shrink-0`} />
              <div>
                <div className={`text-xl font-bold ${b.cls}`}>{counts[b.key].toLocaleString('vi-VN')}</div>
                <div className="text-xs text-gray-600">{b.label}</div>
              </div>
            </button>
          )
        })}
      </div>

      {view === 'clc' && (
        <div className={`flex items-start gap-2.5 mb-4 px-3.5 py-3 rounded-xl border text-sm ${!dateRange || rangeTooShort ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-indigo-50 border-indigo-200 text-indigo-800'}`}>
          {!dateRange || rangeTooShort ? <TriangleAlert size={17} className="shrink-0 mt-0.5" /> : <Hourglass size={17} className="shrink-0 mt-0.5" />}
          {dateRange ? (
            <p>
              File báo cáo khoảng <span className="font-semibold">{formatDateVi(dateRange.tuNgay)} → {formatDateVi(dateRange.denNgay)}</span> ({dateRange.soNgay} ngày)
              {rangeTooShort ? (
                <> — <span className="font-semibold">chưa đủ {MIN_SLOW_DAYS} ngày</span>, danh sách bên dưới có thể chưa phản ánh đúng "chậm luân chuyển". Nên xuất lại báo cáo với khoảng thời gian dài hơn.</>
              ) : (
                <> — hàng bên dưới còn tồn kho và không có phát sinh nhập/xuất trong suốt khoảng này.</>
              )}
            </p>
          ) : (
            <p>Không có khoảng thời gian báo cáo (dòng "Từ ngày ... đến ngày ...") cho tháng này — file tải lên trước đây chưa lưu thông tin này. Tải lại file để có kỳ báo cáo cho phần CLC và dòng 2 của báo cáo xuất ra.</p>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2 mb-3 items-center">
        <div className="flex gap-1 bg-gray-50 border border-gray-200 rounded-lg p-1">
          {VIEWS.map(v => (
            <button
              key={v.key}
              onClick={() => setView(v.key)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${activeView === v.key ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}
            >
              {v.label}
            </button>
          ))}
        </div>
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
          onClick={() => exportRowsToExcel(filteredRows, active, view)}
          disabled={filteredRows.length === 0}
          title="Xuất nhanh danh sách đang xem trên màn hình"
          className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm hover:border-green-400 hover:text-green-600 text-gray-600 transition-colors disabled:opacity-40 disabled:pointer-events-none"
        >
          <Download size={14} />
          Xuất Excel
        </button>
        <button
          onClick={() => void handleExportDisposal()}
          disabled={disposalRows.length === 0 || exportingDisposal}
          title="Xuất Biên bản Xử lý (Excel) + Biên bản Xác minh (Word) cho hàng còn hạn dùng dưới 1 tháng"
          className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm hover:border-red-400 hover:text-red-600 text-gray-600 transition-colors disabled:opacity-40 disabled:pointer-events-none"
        >
          <FileWarning size={14} />
          {exportingDisposal ? 'Đang tạo biên bản...' : `Xuất biên bản hàng cận date (${disposalRows.length})`}
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="text-sm border-collapse" style={{ tableLayout: 'fixed', width: columns.reduce((sum, c) => sum + colWidths[c], 0), minWidth: '100%' }}>
          <thead>
            <tr className="bg-[#1e3a5f] text-white text-xs">
              {columns.map(c => (
                <th
                  key={c}
                  className={`px-3 py-2.5 font-semibold whitespace-nowrap relative ${NUMERIC_COLUMNS.has(c) || c === 'Đvt' ? 'text-center' : 'text-left'}`}
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
                <td colSpan={columns.length} className="text-center py-10 text-gray-400">
                  <div className="flex flex-col items-center gap-2">
                    <PackageSearch size={24} className="text-gray-300" />
                    Không có dữ liệu phù hợp
                  </div>
                </td>
              </tr>
            ) : filteredRows.map((r, i) => (
              <tr key={`${r.maVatTu}_${r.maLo}_${i}`} className="border-b border-gray-100 text-[12px] hover:bg-blue-50/40">
                {columns.map(c => {
                  const isAge = c === 'Tuổi thuốc (Tháng)'
                  const align = NUMERIC_COLUMNS.has(c) || c === 'Đvt' ? 'text-center' : ''
                  const mono = c === 'Mã vật tư' || c === 'Mã lô' || c === 'Tên lô' ? 'font-mono' : ''
                  const emphasis = c === 'Tồn cuối' ? 'font-medium' : isAge ? AGE_CLASS[r.bucket] || 'text-gray-600' : ''
                  return (
                    <td
                      key={c}
                      className={`px-3 py-2 ${align} ${mono} ${emphasis}`}
                      style={{ maxWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                      title={isAge ? ageTitle(r.daysLeft) : undefined}
                    >
                      {cellValue(c, r, i)}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
