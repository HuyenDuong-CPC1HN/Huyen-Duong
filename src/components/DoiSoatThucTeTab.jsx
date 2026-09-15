import { useMemo, useRef, useState } from 'react'
import { FileUp, FileSpreadsheet, X, RefreshCw, ListChecks, PackageSearch } from 'lucide-react'
import { opsStore as localStorage } from '../data/workspace'
import {
  readActualScanRows,
  mergeActualScanRows,
  splitSoRows,
  reconcileActualVsInvoice,
} from '../utils/parseGoodsReceipt'

const STORAGE_KEY = 'goods_receipt_batches'

// index.css từng có "* { padding: 0; margin: 0 }" nằm NGOÀI @layer của Tailwind, đè mất mọi class
// px-*/py-*/m-*/space-x-*/space-y-* toàn app (đã fix bằng cách đưa vào @layer base — xem index.css).
// Component này viết từ trước khi fix nên vẫn giữ nguyên cách dùng `style` inline cho padding thay vì
// class Tailwind, để nhất quán trong chính file này — không phải vì bug còn tồn tại.
const padCard = { padding: 16 }
const padCardLg = { padding: 40 }
const padCell = { padding: '12px 16px' }
const padChip = { padding: '4px 10px' }
const padZoneLabel = { padding: '2px 12px' }
const padDropzone = { padding: '28px 16px 16px' }
const padBanner = { padding: '14px 16px' }
const padSelect = { padding: '10px 12px' }
const padButton = { padding: '10px 20px' }
const padFilterCell = { padding: '6px 8px' }
const padFilterInput = { padding: '6px 8px' }

// Chỉ đọc — chuyến hàng được tạo/sửa từ tab Nhập hàng, tab này chỉ chọn 1 chuyến đã lưu để đối soát.
function readBatches() {
  try {
    const batches = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    return Array.isArray(batches) ? batches : []
  } catch { return [] }
}

function monthKeyOf(processedAt) {
  const d = new Date(processedAt)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function monthLabelOf(monthKey) {
  const [y, m] = monthKey.split('-')
  return `Tháng ${Number(m)}/${y}`
}

function batchLabelOf(processedAt) {
  return new Date(processedAt).toLocaleString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function extOf(file) { return file.name.split('.').pop().toLowerCase() }
function isExcelFile(file) { return ['xlsx', 'xls'].includes(extOf(file)) }

function getChenhLechColor(chenh) {
  if (chenh > 0) return 'text-green-600'
  if (chenh < 0) return 'text-red-600'
  return 'text-gray-400'
}

function statusMeta(row) {
  switch (row.trangThai) {
    case 'khop':
      return { label: 'Khớp', bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200', dot: 'bg-green-500' }
    case 'thieu':
      return { label: `Thiếu ${Math.abs(row.chenhLech)}`, bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', dot: 'bg-amber-500' }
    case 'thua':
      return { label: `Thừa ${row.chenhLech}`, bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', dot: 'bg-amber-500' }
    case 'chuaQuet':
      return { label: 'Chưa quét', bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', dot: 'bg-red-500' }
    default:
      return { label: 'Quét lạ', bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', dot: 'bg-red-500' }
  }
}

function StatusChip({ row }) {
  const meta = statusMeta(row)
  return (
    <span
      style={padChip}
      className={`inline-flex items-center gap-1.5 rounded-full border text-[11px] font-semibold whitespace-nowrap ${meta.bg} ${meta.text} ${meta.border}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  )
}

// Nhãn kho nổi trên viền khung — cùng 1 khung nhận nhiều file (1 chuyến có thể quét/xuất nhiều lần cho
// cùng 1 kho), chỉ nhận Excel vì phía Thực tế không có PDF.
function ActualFileZone({ label, files, onAddFiles, onRemoveFile }) {
  const inputRef = useRef(null)
  const [dragging, setDragging] = useState(false)

  return (
    <div className="flex flex-col gap-2">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false) }}
        onDrop={(e) => { e.preventDefault(); setDragging(false); onAddFiles([...e.dataTransfer.files]) }}
        onClick={() => inputRef.current?.click()}
        style={padDropzone}
        className={`relative flex flex-col items-center justify-center gap-1.5 w-full min-h-28 rounded-2xl border-2 border-dashed cursor-pointer transition-all select-none
          ${dragging ? 'border-teal-500 bg-teal-50 scale-[1.01]' : 'border-gray-300 bg-teal-50/30 hover:border-teal-400 hover:bg-teal-50/60'}`}
      >
        <span
          style={padZoneLabel}
          className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-white border border-teal-200 text-teal-700 text-[11px] font-bold uppercase tracking-wide shadow-sm"
        >
          {label}
        </span>
        <FileUp size={18} className={dragging ? 'text-teal-600' : 'text-teal-400'} />
        <p className="text-xs text-gray-500 text-center">Kéo/thả hoặc click — file .xlsx, .xls</p>
      </div>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".xlsx,.xls"
        className="hidden"
        onChange={(e) => { onAddFiles([...e.target.files]); e.target.value = '' }}
      />
      {files.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {files.map((file, i) => (
            <span key={`${file.name}-${i}`} style={padChip} className="inline-flex items-center gap-1 bg-teal-50 border border-teal-200 rounded-full text-[11px] text-teal-700">
              <FileSpreadsheet size={12} />
              <span className="max-w-32 truncate" title={file.name}>{file.name}</span>
              <button type="button" onClick={() => onRemoveFile(i)} className="text-teal-400 hover:text-red-500" title="Bỏ file này">
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

const RESULT_COLUMNS = [
  { key: 'maHang', label: 'Mã hàng', align: 'left', filterable: true },
  { key: 'tenHang', label: 'Tên hàng', align: 'left', filterable: true },
  { key: 'soLo', label: 'Số lô', align: 'center', filterable: true },
  { key: 'slThucTe', label: 'SL Thực tế', align: 'center', filterable: false },
  { key: 'slHoaDon', label: 'SL Hoá đơn', align: 'center', filterable: false },
  { key: 'chenhLech', label: 'Chênh lệch', align: 'center', filterable: false },
  { key: 'trangThai', label: 'Trạng thái', align: 'center', filterable: false },
]
const EMPTY_FILTERS = { maHang: '', tenHang: '', soLo: '' }

function matchesFilters(row, filters) {
  return Object.entries(filters).every(([key, value]) => {
    const v = value.trim().toLowerCase()
    if (!v) return true
    return String(row[key] ?? '').toLowerCase().includes(v)
  })
}

// "lech" là 1 ô gộp chung 2 trạng thái thật ("thiếu" + "thừa") trên thẻ tổng hợp, nên khi lọc theo ô này
// phải khớp CẢ HAI, không phải so trực tiếp bằng "lech" (không có trangThai nào tên vậy).
function matchesStatusFilter(row, statusFilter) {
  if (!statusFilter) return true
  if (statusFilter === 'lech') return row.trangThai === 'thieu' || row.trangThai === 'thua'
  return row.trangThai === statusFilter
}

function ResultTable({ title, rows, statusFilter }) {
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const hasFilter = Object.values(filters).some(v => v.trim())
  const hasAnyFilter = hasFilter || !!statusFilter
  const filteredRows = useMemo(
    () => rows.filter(row => matchesFilters(row, filters) && matchesStatusFilter(row, statusFilter)),
    [rows, filters, statusFilter],
  )
  const setFilter = (key, value) => setFilters(current => ({ ...current, [key]: value }))

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span style={padChip} className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 border border-teal-200 text-teal-700 text-[11px] font-bold uppercase tracking-wide">
          <span className="w-1.5 h-1.5 rounded-full bg-teal-500" />
          {title}
        </span>
        <span className="text-xs text-gray-400">
          {hasAnyFilter ? `${filteredRows.length}/${rows.length} dòng` : `${rows.length} dòng`}
        </span>
        {hasFilter && (
          <button type="button" onClick={() => setFilters(EMPTY_FILTERS)} className="text-xs text-teal-600 hover:text-teal-800 hover:underline">
            Xoá lọc
          </button>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead className="bg-gray-50/80">
              <tr className="divide-x divide-gray-200">
                {RESULT_COLUMNS.map(c => (
                  <th
                    key={c.key}
                    style={padCell}
                    className={`font-semibold text-[11px] uppercase tracking-wide text-gray-500 whitespace-nowrap ${c.align === 'left' ? 'text-left' : 'text-center'}`}
                  >
                    {c.label}
                  </th>
                ))}
              </tr>
              <tr className="divide-x divide-gray-200 border-t border-gray-200">
                {RESULT_COLUMNS.map(c => (
                  <th key={c.key} style={padFilterCell} className="font-normal">
                    {c.filterable && (
                      <input
                        value={filters[c.key]}
                        onChange={(e) => setFilter(c.key, e.target.value)}
                        placeholder={c.label}
                        style={padFilterInput}
                        className="w-full rounded-lg text-xs border border-gray-200 bg-white text-gray-700 hover:border-teal-300 focus:outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-100"
                      />
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row, i) => (
                <tr key={`${row.maHang}-${row.soLo}-${i}`} className="border-t border-gray-200 divide-x divide-gray-100 hover:bg-gray-50/70 transition-colors">
                  <td style={padCell} className="font-semibold text-gray-800 whitespace-nowrap">{row.maHang}</td>
                  <td style={padCell} className="text-gray-600">{row.tenHang}</td>
                  <td style={padCell} className="text-center text-gray-600 whitespace-nowrap tabular-nums">{row.soLo}</td>
                  <td style={padCell} className="text-center tabular-nums">{row.slThucTe ?? '—'}</td>
                  <td style={padCell} className="text-center tabular-nums">{row.slHoaDon ?? '—'}</td>
                  <td style={padCell} className={`text-center font-semibold tabular-nums ${getChenhLechColor(row.chenhLech)}`}>
                    {row.chenhLech ?? '—'}
                  </td>
                  <td style={padCell} className="text-center"><StatusChip row={row} /></td>
                </tr>
              ))}
              {filteredRows.length === 0 && (
                <tr><td colSpan={7} style={padCell} className="text-center text-gray-400">{hasAnyFilter ? 'Không tìm thấy dòng nào khớp' : 'Không có dữ liệu'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// Kho không thả file quét thực tế nào — không chạy đối soát cho kho này (xem runReconciliation), tránh
// báo nhầm toàn bộ hoá đơn kho đó thành "Chưa quét".
function NoActualDataNotice({ title }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span style={padChip} className="inline-flex items-center gap-1.5 rounded-full bg-gray-50 border border-gray-200 text-gray-500 text-[11px] font-bold uppercase tracking-wide">
          <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />
          {title}
        </span>
      </div>
      <div style={padCell} className="bg-white rounded-2xl border border-gray-200 shadow-sm text-center text-sm text-gray-400">
        Không có dữ liệu thực tế để đối soát
      </div>
    </div>
  )
}

// Bấm vào 1 thẻ để lọc các bảng bên dưới chỉ còn dòng đúng trạng thái đó; bấm lại đúng thẻ đang chọn để
// bỏ lọc. Viền màu (ring) nhấn thẻ đang được chọn, phân biệt với 3 thẻ còn lại.
function Tile({ label, count, className, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={padCard}
      className={`flex flex-col gap-1 bg-white rounded-2xl border shadow-sm text-left transition-all hover:border-gray-300
        ${active ? 'border-teal-400 ring-2 ring-teal-200' : 'border-gray-200'}`}
    >
      <div className={`text-3xl font-bold tabular-nums ${className}`}>{count}</div>
      <div className="text-[11px] uppercase tracking-wide text-gray-400">{label}</div>
    </button>
  )
}

export default function DoiSoatThucTeTab() {
  const [batches] = useState(() => readBatches())
  const [selectedBatchId, setSelectedBatchId] = useState(() => batches[0]?.id || null)
  const [pendingFiles, setPendingFiles] = useState({ khoC: [], khoLgt: [], khoSo: [] })
  const [results, setResults] = useState(null)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState('')
  const [statusFilter, setStatusFilter] = useState(null)

  const batch = batches.find(b => b.id === selectedBatchId) || null

  const monthGroups = useMemo(() => {
    const map = new Map()
    for (const b of batches) {
      const key = monthKeyOf(b.processedAt)
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(b)
    }
    for (const list of map.values()) list.sort((a, b) => new Date(b.processedAt) - new Date(a.processedAt))
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1))
  }, [batches])

  const canRun = !!batch
    && (pendingFiles.khoC.length + pendingFiles.khoLgt.length + pendingFiles.khoSo.length) > 0

  const addFiles = (kho, incoming) => {
    const valid = incoming.filter(isExcelFile)
    setError(valid.length < incoming.length ? 'Chỉ nhận file .xlsx hoặc .xls — các file khác đã bị bỏ qua.' : '')
    setPendingFiles(current => ({ ...current, [kho]: [...current[kho], ...valid] }))
  }
  const removeFile = (kho, index) => {
    setPendingFiles(current => ({ ...current, [kho]: current[kho].filter((_, i) => i !== index) }))
  }

  const readActualRowsFromFiles = async (files, fileErrors) => {
    const settled = await Promise.allSettled(files.map(async file => readActualScanRows(await file.arrayBuffer())))
    const rows = []
    settled.forEach((res, i) => {
      if (res.status === 'fulfilled') rows.push(...res.value)
      else fileErrors.push(`${files[i].name}: ${res.reason?.message || 'không đọc được file'}`)
    })
    return rows
  }

  // Thuần tính lại từ file đang thả trong 3 khung + dữ liệu chuyến đã chọn — không lưu gì cố định, nên bấm
  // lại bao nhiêu lần cũng được: quét khắc phục xong, thả file mới đè vào đúng khung rồi chạy lại là ra
  // ngay kết quả mới.
  const runReconciliation = async () => {
    if (!canRun) return
    setProcessing(true)
    setError('')
    try {
      const fileErrors = []
      const [rawC, rawLgt, rawSo] = await Promise.all([
        readActualRowsFromFiles(pendingFiles.khoC, fileErrors),
        readActualRowsFromFiles(pendingFiles.khoLgt, fileErrors),
        readActualRowsFromFiles(pendingFiles.khoSo, fileErrors),
      ])

      const { soRows: invoiceKhoSo, nonSoRows: invoiceKhoC } = splitSoRows(batch.khoC)
      const invoiceKhoLgt = batch.khoLgt || []

      // Kho nào không thả file (khoX.length === 0) thì để null (không chạy đối soát) — chạy với mảng
      // rỗng sẽ coi TOÀN BỘ hoá đơn kho đó là "Chưa quét" dù thực ra người dùng chỉ chưa upload file cho
      // kho này, không phải hàng thật sự chưa quét. ResultTable/summary hiển thị riêng cho trường hợp này.
      setResults({
        khoC: pendingFiles.khoC.length > 0 ? reconcileActualVsInvoice(invoiceKhoC, mergeActualScanRows(rawC)) : null,
        khoLgt: pendingFiles.khoLgt.length > 0 ? reconcileActualVsInvoice(invoiceKhoLgt, mergeActualScanRows(rawLgt)) : null,
        khoSo: pendingFiles.khoSo.length > 0 ? reconcileActualVsInvoice(invoiceKhoSo, mergeActualScanRows(rawSo)) : null,
      })
      setStatusFilter(null)
      if (fileErrors.length > 0) setError(`Không đọc được: ${fileErrors.join('; ')}`)
    } catch (err) {
      setError(err.message || 'Không chạy được đối soát.')
    } finally {
      setProcessing(false)
    }
  }

  const allResults = results ? [...(results.khoC || []), ...(results.khoLgt || []), ...(results.khoSo || [])] : []
  const tiles = [
    { key: 'khop', label: 'Khớp', className: 'text-green-600', count: allResults.filter(r => r.trangThai === 'khop').length },
    { key: 'lech', label: 'Thiếu / Thừa', className: 'text-amber-600', count: allResults.filter(r => r.trangThai === 'thieu' || r.trangThai === 'thua').length },
    { key: 'chuaQuet', label: 'Chưa quét', className: 'text-red-600', count: allResults.filter(r => r.trangThai === 'chuaQuet').length },
    { key: 'quetLa', label: 'Quét lạ (sai mã)', className: 'text-red-600', count: allResults.filter(r => r.trangThai === 'quetLa').length },
  ]

  if (batches.length === 0) {
    return (
      <div style={padCardLg} className="flex flex-col items-center text-center gap-3 bg-white rounded-2xl border border-gray-200 shadow-sm">
        <div className="w-11 h-11 rounded-full bg-teal-50 border border-teal-200 flex items-center justify-center">
          <PackageSearch size={20} className="text-teal-600" />
        </div>
        <p className="text-sm text-gray-600 max-w-sm">
          Chưa có chuyến Nhập hàng nào đã lưu — xử lý ở mục "Nhập hàng" trước, rồi quay lại đây để đối soát.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <div style={padBanner} className="flex items-start gap-3 bg-teal-50/60 border border-teal-100 rounded-2xl">
        <div className="w-8 h-8 rounded-full bg-white border border-teal-200 flex items-center justify-center shrink-0">
          <ListChecks size={16} className="text-teal-600" />
        </div>
        <p className="text-sm text-gray-700 leading-relaxed">
          So Số lượng đã quét thực tế (file Excel xuất từ website) với Số lượng Hoá đơn đã tách
          <span className="font-semibold"> Kho C / Kho LGT / Kho SO</span> của 1 chuyến đã lưu.
        </p>
      </div>

      <div style={padCard} className="flex flex-col gap-4 bg-white rounded-2xl border border-gray-200 shadow-sm">
        <div className="flex flex-col gap-1.5 max-w-sm">
          <label className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Chuyến hàng đã lưu</label>
          <select
            value={selectedBatchId || ''}
            onChange={(e) => { setSelectedBatchId(e.target.value); setResults(null); setStatusFilter(null) }}
            style={padSelect}
            className="w-full rounded-xl text-sm border border-gray-200 bg-white text-gray-700 hover:border-teal-300 focus:outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-100"
          >
            {monthGroups.map(([key, group]) => (
              <optgroup key={key} label={monthLabelOf(key)}>
                {group.map(b => (
                  <option key={b.id} value={b.id}>{batchLabelOf(b.processedAt)}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">File quét thực tế (Excel) — theo từng kho</label>
          <div className="grid md:grid-cols-3 gap-4">
            <ActualFileZone label="Kho C" files={pendingFiles.khoC} onAddFiles={(f) => addFiles('khoC', f)} onRemoveFile={(i) => removeFile('khoC', i)} />
            <ActualFileZone label="Kho LGT" files={pendingFiles.khoLgt} onAddFiles={(f) => addFiles('khoLgt', f)} onRemoveFile={(i) => removeFile('khoLgt', i)} />
            <ActualFileZone label="Kho SO" files={pendingFiles.khoSo} onAddFiles={(f) => addFiles('khoSo', f)} onRemoveFile={(i) => removeFile('khoSo', i)} />
          </div>
        </div>

        <button
          type="button"
          disabled={!canRun || processing}
          onClick={() => void runReconciliation()}
          style={padButton}
          className="flex items-center justify-center gap-2 self-start rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-sm font-semibold shadow-sm shadow-teal-900/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <RefreshCw size={14} className={processing ? 'animate-spin' : ''} />
          {processing ? 'Đang đối soát...' : 'Chạy đối soát'}
        </button>

        {error && <p className="text-sm text-red-500 whitespace-pre-line">{error}</p>}
      </div>

      {results && (
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {tiles.map(tile => (
                <Tile
                  key={tile.key}
                  label={tile.label}
                  count={tile.count}
                  className={tile.className}
                  active={statusFilter === tile.key}
                  onClick={() => setStatusFilter(current => (current === tile.key ? null : tile.key))}
                />
              ))}
            </div>
            {statusFilter && (
              <p className="text-xs text-gray-400">
                Đang lọc theo trạng thái: <span className="font-semibold text-gray-600">{tiles.find(t => t.key === statusFilter)?.label}</span>
                {' — '}
                <button type="button" onClick={() => setStatusFilter(null)} className="text-teal-600 hover:text-teal-800 hover:underline">
                  Bỏ lọc
                </button>
              </p>
            )}
          </div>

          {results.khoC ? <ResultTable title="Kho C" rows={results.khoC} statusFilter={statusFilter} /> : <NoActualDataNotice title="Kho C" />}
          {results.khoLgt ? <ResultTable title="Kho LGT" rows={results.khoLgt} statusFilter={statusFilter} /> : <NoActualDataNotice title="Kho LGT" />}
          {results.khoSo ? <ResultTable title="Kho SO" rows={results.khoSo} statusFilter={statusFilter} /> : <NoActualDataNotice title="Kho SO" />}
        </div>
      )}
    </div>
  )
}
