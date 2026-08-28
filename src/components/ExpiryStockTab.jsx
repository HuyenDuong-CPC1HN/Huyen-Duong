import { useMemo, useRef, useState } from 'react'
import { Upload, FileUp, FileSpreadsheet, X, AlertTriangle, Clock, CircleAlert, Search, PackageSearch, Download } from 'lucide-react'
import * as XLSX from 'xlsx'
import { opsStore as localStorage } from '../data/workspace'
import { parseExpiryStockWorkbook, classifyExpiry, daysUntil } from '../utils/parseExpiryStock'

// ---- Lưu trữ dữ liệu upload theo TỪNG THÁNG, cố định/không bị ghi đè khi upload file mới ----
// expiry_stock_months = [{ id, fileName, uploadedAt, rows }, ...] (mới nhất ở đầu)
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

const BUCKETS = [
  { key: 'expired', label: 'Hết hạn', icon: CircleAlert, cls: 'text-red-600', bg: 'bg-red-50 border-red-200', bgActive: 'bg-red-100 border-red-400' },
  { key: 'near3', label: 'Cận dưới 3 tháng', icon: AlertTriangle, cls: 'text-orange-600', bg: 'bg-orange-50 border-orange-200', bgActive: 'bg-orange-100 border-orange-400' },
  { key: 'near6', label: 'Cận dưới 6 tháng', icon: Clock, cls: 'text-amber-600', bg: 'bg-amber-50 border-amber-200', bgActive: 'bg-amber-100 border-amber-400' },
]

function formatDateVi(iso) {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

// "Tuổi thuốc (Tháng)" = số tháng CÒN LẠI tới hạn dùng (âm nếu đã hết hạn), quy đổi từ số ngày còn lại.
function monthsLeft(daysLeft) {
  if (daysLeft === null) return ''
  return Math.round((daysLeft / 30.44) * 10) / 10
}

const TAB_FILE_LABEL = { canDate: 'CanDate', expired: 'HetHan', near3: 'Duoi3Thang', near6: 'Duoi6Thang', all: 'TatCa' }

function exportRowsToExcel(rows, active, tab) {
  const data = rows.map((r, i) => ({
    'Stt': i + 1,
    'Mã vật tư': r.maVatTu,
    'Tên vật tư': r.tenVatTu,
    'Mã kho': r.maKho,
    'Đvt': r.dvt,
    'Mã lô': r.maLo,
    'Tên lô': r.maLo,
    'Hạn dùng': formatDateVi(r.hanDung),
    'Tuổi thuốc (Tháng)': monthsLeft(r.daysLeft),
    'Tồn đầu': r.tonDau,
    'Sl nhập': r.slNhap,
    'Sl xuất': r.slXuat,
    'Tồn cuối': r.tonCuoi,
  }))
  const ws = XLSX.utils.json_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Ton kho can date')
  const monthLabel = new Date(active.uploadedAt).toLocaleDateString('vi-VN', { month: '2-digit', year: 'numeric' }).replace('/', '-')
  XLSX.writeFile(wb, `TonKhoCanDate_${TAB_FILE_LABEL[tab] || 'CanDate'}_${monthLabel}.xlsx`)
}

export default function ExpiryStockTab() {
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
  const [tab, setTab] = useState('canDate') // canDate | expired | near3 | near6 | all
  const [search, setSearch] = useState('')
  const [khoFilter, setKhoFilter] = useState('all')

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
        const entry = addMonth({ fileName: file.name, uploadedAt: new Date().toISOString(), rows })
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

  const inStock = useMemo(() => {
    if (!active) return []
    const today = new Date()
    return (active.rows || [])
      .filter(r => r.tonCuoi > 0)
      .map(r => ({ ...r, bucket: classifyExpiry(r.hanDung, today), daysLeft: daysUntil(r.hanDung, today) }))
  }, [active])

  const counts = useMemo(() => ({
    expired: inStock.filter(r => r.bucket === 'expired').length,
    near3: inStock.filter(r => r.bucket === 'near3').length,
    near6: inStock.filter(r => r.bucket === 'near6').length,
  }), [inStock])

  const khoOptions = useMemo(() => [...new Set(inStock.map(r => r.maKho).filter(Boolean))].sort(), [inStock])

  const filteredRows = useMemo(() => {
    let rows = inStock
    if (tab === 'canDate') rows = rows.filter(r => ['expired', 'near3', 'near6'].includes(r.bucket))
    else if (tab !== 'all') rows = rows.filter(r => r.bucket === tab)
    if (khoFilter !== 'all') rows = rows.filter(r => r.maKho === khoFilter)
    if (search) {
      const q = search.toLowerCase()
      rows = rows.filter(r => r.maVatTu.toLowerCase().includes(q) || r.tenVatTu.toLowerCase().includes(q) || r.maLo.toLowerCase().includes(q))
    }
    return [...rows].sort((a, b) => {
      if (!a.hanDung && !b.hanDung) return 0
      if (!a.hanDung) return 1
      if (!b.hanDung) return -1
      return a.hanDung.localeCompare(b.hanDung)
    })
  }, [inStock, tab, khoFilter, search])

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
            <p className="text-gray-400 text-xs mt-1">hoặc <span className="text-blue-600 underline font-medium">click để chọn file .xlsx</span> — mỗi lần upload là 1 tháng dữ liệu</p>
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

      <div className="flex items-center gap-2 mb-5 flex-wrap">
        <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-sm">
          <FileSpreadsheet size={15} className="text-green-600 flex-shrink-0" />
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
        <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={e => parseFile(e.target.files[0])} />
        <span className="text-xs text-gray-400">Cập nhật: {new Date(active.uploadedAt).toLocaleString('vi-VN')}</span>
      </div>
      {error && <p className="mb-4 text-sm text-red-500">{error}</p>}

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-5">
        {BUCKETS.map(b => {
          const Icon = b.icon
          const isActive = tab === b.key
          return (
            <button
              key={b.key}
              onClick={() => setTab(isActive ? 'canDate' : b.key)}
              className={`flex items-center gap-3 rounded-xl border p-3.5 text-left transition-colors ${isActive ? b.bgActive : b.bg} hover:brightness-95`}
            >
              <Icon size={20} className={`${b.cls} flex-shrink-0`} />
              <div>
                <div className={`text-xl font-bold ${b.cls}`}>{counts[b.key].toLocaleString('vi-VN')}</div>
                <div className="text-xs text-gray-600">{b.label}</div>
              </div>
            </button>
          )
        })}
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
        <div className="flex gap-1 bg-gray-50 border border-gray-200 rounded-lg p-1">
          <button
            onClick={() => setTab('canDate')}
            className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${tab === 'canDate' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Cận date
          </button>
          <button
            onClick={() => setTab('all')}
            className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${tab === 'all' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Tất cả tồn kho
          </button>
        </div>
        <span className="text-xs text-gray-400 whitespace-nowrap">{filteredRows.length} dòng</span>
        <button
          onClick={() => exportRowsToExcel(filteredRows, active, tab)}
          disabled={filteredRows.length === 0}
          className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm hover:border-green-400 hover:text-green-600 text-gray-600 transition-colors ml-auto disabled:opacity-40 disabled:pointer-events-none"
        >
          <Download size={14} />
          Xuất Excel
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-[#1e3a5f] text-white text-xs">
              <th className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">Mã vật tư</th>
              <th className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">Tên vật tư</th>
              <th className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">Mã kho</th>
              <th className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">Mã lô</th>
              <th className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">Hạn dùng</th>
              <th className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">Còn lại</th>
              <th className="px-3 py-2.5 text-right font-semibold whitespace-nowrap">Tồn cuối</th>
              <th className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">Đvt</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center py-10 text-gray-400">
                  <div className="flex flex-col items-center gap-2">
                    <PackageSearch size={24} className="text-gray-300" />
                    Không có dữ liệu phù hợp
                  </div>
                </td>
              </tr>
            ) : filteredRows.map((r, i) => (
              <tr key={`${r.maVatTu}_${r.maLo}_${i}`} className="border-b border-gray-100 text-[12px] hover:bg-blue-50/40">
                <td className="px-3 py-2 whitespace-nowrap font-mono">{r.maVatTu}</td>
                <td className="px-3 py-2">{r.tenVatTu || '—'}</td>
                <td className="px-3 py-2 whitespace-nowrap">{r.maKho || '—'}</td>
                <td className="px-3 py-2 whitespace-nowrap font-mono">{r.maLo || '—'}</td>
                <td className="px-3 py-2 whitespace-nowrap">{formatDateVi(r.hanDung)}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {r.daysLeft === null ? (
                    <span className="text-gray-400">Không rõ</span>
                  ) : r.daysLeft < 0 ? (
                    <span className="text-red-600 font-medium">Quá hạn {Math.abs(r.daysLeft)} ngày</span>
                  ) : (
                    <span className={r.bucket === 'near3' ? 'text-orange-600 font-medium' : r.bucket === 'near6' ? 'text-amber-600 font-medium' : 'text-gray-600'}>
                      Còn {r.daysLeft} ngày
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-right font-medium whitespace-nowrap">{r.tonCuoi.toLocaleString('vi-VN')}</td>
                <td className="px-3 py-2 whitespace-nowrap">{r.dvt || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
