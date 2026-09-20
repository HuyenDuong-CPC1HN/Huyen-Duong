import { useEffect, useMemo, useState } from 'react'
import {
  Upload, FileUp, FileSpreadsheet, X, Download, Search, PackagePlus,
  Pencil, Save, History, FileText, Plus, Trash2, RefreshCw,
  ArrowUp, ArrowDown, ArrowUpDown, Check,
} from 'lucide-react'
import { opsStore as localStorage } from '../data/workspace'
import {
  buildReceiptFromFiles,
  calcChenhLech,
  detectPhieuXuatKhoWarehouse,
  extractPdfText,
  mergeSupplementRows,
  parsePdfMetadata,
  readWarehouseExportRows,
  recheckKienTotal,
} from '../utils/parseGoodsReceipt'
import { exportReceiptFromTemplate } from '../utils/exportGoodsReceipt'

const STORAGE_KEY = 'goods_receipt_batches'
const ACTIVE_KEY = 'goods_receipt_active'


const MAX_HISTORY_QUERY_LENGTH = 100

function normalizeHistoryQuery(value) {
  return String(value).trim().toLocaleLowerCase().slice(0, MAX_HISTORY_QUERY_LENGTH)
}

function matchesHistoryRow(row, query) {
  return String(row.maHang ?? '').toLocaleLowerCase().includes(query) ||
    String(row.tenHang ?? '').toLocaleLowerCase().includes(query)
}

function toHistoryHit(row, batch, warehouse) {
  return {
    ma_hang: row.maHang,
    ten_hang: row.tenHang,
    so_lo: row.soLo,
    sl_hoa_don: row.slHoaDon,
    han_dung: row.hanDung,
    warehouse,
    goods_receipt_batches: { processed_at: batch.processedAt },
  }
}

function collectLocalHistoryMatches(batches, query) {
  const q = normalizeHistoryQuery(query)
  if (!q) return []
  const hits = []
  for (const batch of batches) {
    for (const row of (batch.khoC || [])) {
      if (matchesHistoryRow(row, q)) hits.push(toHistoryHit(row, batch, 'C'))
    }
    for (const row of (batch.khoLgt || [])) {
      if (matchesHistoryRow(row, q)) hits.push(toHistoryHit(row, batch, 'LGT'))
    }
  }
  return hits
}
function withRowIds(rows) {
  return rows.map(row => (row.rowId ? row : { ...row, rowId: crypto.randomUUID() }))
}

function readBatches() {
  try {
    const batches = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    return Array.isArray(batches)
      ? batches.map(batch => ({ ...batch, khoC: withRowIds(batch.khoC || []), khoLgt: withRowIds(batch.khoLgt || []) }))
      : []
  } catch { return [] }
}

function readStoredActiveId() {
  const saved = localStorage.getItem(ACTIVE_KEY)
  const all = readBatches()
  if (all.some(batch => batch.id === saved)) return saved
  return all[0]?.id || null
}

function writeBatches(batches) { localStorage.setItem(STORAGE_KEY, JSON.stringify(batches)) }

function addBatch(entry) {
  const batches = readBatches()
  const withId = {
    ...entry,
    id: entry.id || String(Date.now()),
    khoC: withRowIds(entry.khoC || []),
    khoLgt: withRowIds(entry.khoLgt || []),
  }
  writeBatches([withId, ...batches])
  localStorage.setItem(ACTIVE_KEY, withId.id)
  return withId
}

function updateBatch(id, patch) {
  const batches = readBatches().map(batch => (batch.id === id ? { ...batch, ...patch } : batch))
  writeBatches(batches)
  return batches.find(batch => batch.id === id) || null
}

function removeBatchEntry(id) {
  const batches = readBatches().filter(batch => batch.id !== id)
  writeBatches(batches)
  const activeId = localStorage.getItem(ACTIVE_KEY)
  if (activeId === id) {
    if (batches[0]) localStorage.setItem(ACTIVE_KEY, batches[0].id)
    else localStorage.removeItem(ACTIVE_KEY)
  }
  return batches
}

function formatDateVi(iso) {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

// Nhóm các chuyến đã lưu theo Tháng — khớp với cách tổ chức Kho C/LGT > Năm > Tháng trên Supabase Storage,
// và giúp phân biệt 2 chuyến xử lý cùng ngày (trước đây chỉ hiện ngày/tháng/năm, trùng nhau không phân biệt được).
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

// multiline: dùng <textarea> thay <input> — Tên hàng thường dài (vd tên sản phẩm ghi kèm quy cách đóng
// gói), gói gọn trong 1 hàng ngang rất khó đọc/sửa hết chữ. resize-y cho tự kéo giãn thêm nếu 2 dòng vẫn
// chưa đủ.
function EditableCell({ value, onChange, type = 'text', className = '', multiline = false }) {
  const handleChange = (e) => {
    if (type === 'number') {
      onChange(e.target.value === '' ? null : Number(e.target.value))
    } else {
      onChange(e.target.value)
    }
  }

  if (multiline) {
    return (
      <textarea
        value={value ?? ''}
        onChange={handleChange}
        rows={2}
        className={`w-full min-w-40 px-1.5 py-1 text-xs border border-transparent rounded hover:border-gray-300 focus:border-blue-400 focus:outline-none bg-transparent resize-y leading-snug ${className}`}
      />
    )
  }

  return (
    <input
      type={type}
      value={value ?? ''}
      onChange={handleChange}
      className={`w-full min-w-18 px-1.5 py-1 text-xs border border-transparent rounded hover:border-gray-300 focus:border-blue-400 focus:outline-none bg-transparent ${className}`}
    />
  )
}

function getChenhLechColor(chenh) {
  if (chenh > 0) return 'text-green-600'
  if (chenh < 0) return 'text-red-600'
  return ''
}

function extOf(file) { return file.name.split('.').pop().toLowerCase() }
function isExcelFile(file) { return ['xlsx', 'xls'].includes(extOf(file)) }
function isPdfFile(file) { return extOf(file) === 'pdf' }
function isSupportedFile(file) { return isExcelFile(file) || isPdfFile(file) }

// Vùng upload đa file cho 1 kho vật lý — chuyến hàng thường có nhiều phiếu xuất kho (nhiều Excel) +
// có thể kèm PDF phiếu xuất kho riêng, nên nhận bao nhiêu file cũng được thay vì đúng 1 file cố định.
function FileZone({ label, hint, files, onAddFiles, onRemoveFile, accept = '.xlsx,.xls,.pdf' }) {
  const [dragging, setDragging] = useState(false)

  return (
    <div className="border border-gray-200 rounded-xl p-3 bg-white">
      <label
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false) }}
        onDrop={(e) => { e.preventDefault(); setDragging(false); onAddFiles([...e.dataTransfer.files]) }}
        className={`flex flex-col items-center justify-center gap-2 w-full min-h-28 rounded-xl border-2 border-dashed cursor-pointer transition-all select-none p-4 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-200
          ${dragging ? 'border-blue-500 bg-blue-50 scale-[1.01]' : 'border-gray-300 hover:border-blue-400 hover:bg-blue-50/30'}`}
      >
        <FileUp size={20} className={dragging ? 'text-blue-500' : 'text-gray-400'} />
        <div className="text-center">
          <p className="text-sm font-semibold text-gray-700">{label}</p>
          <p className="text-xs text-gray-400 mt-0.5">{hint}</p>
        </div>
      <input
        type="file"
        multiple
        accept={accept}
        className="sr-only"
        onChange={(e) => { onAddFiles([...e.target.files]); e.target.value = '' }}
      />
      </label>
      {files.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {files.map((file, i) => (
            <span key={`${file.name}-${i}`} className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700">
              {isPdfFile(file) ? <FileText size={12} /> : <FileSpreadsheet size={12} />}
              <span className="max-w-40 truncate" title={file.name}>{file.name}</span>
              <button type="button" onClick={() => onRemoveFile(i)} className="ml-0.5 text-blue-400 hover:text-red-500" title="Bỏ file này">
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function parseVietnameseDate(val) {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(val))
  if (!match) return null
  return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`
}

// Ô Hạn dùng: gõ tay theo từng ký tự (2 -> 23 -> 23/0 -> 23/04 -> ...) — mọi bước trung gian đều KHÔNG
// khớp "dd/mm/yyyy" đầy đủ nên parseVietnameseDate trả về null; nếu commit thẳng null lên row.hanDung
// ngay mỗi ký tự (như EditableCell thường làm) thì ô hiện lại thành rỗng ngay sau mỗi lần gõ, coi như
// không gõ được. Giữ text đang gõ dở ở state cục bộ, chỉ đẩy lên trên (parse ISO) khi đủ 1 ngày hợp lệ
// hoặc khi xoá trắng; gõ dở dang thì cứ hiện nguyên như đã gõ.
function DateCell({ value, onChange, className = '' }) {
  const display = value ? value.split('-').reverse().join('/') : ''
  const [draft, setDraft] = useState(display)
  // "Điều chỉnh state khi prop đổi" ngay trong lúc render (theo khuyến nghị của React), KHÔNG dùng
  // useEffect — so sánh với display của lần render trước để chỉ đồng bộ khi giá trị từ ngoài đổi thật
  // (vd Lưu xong rồi mở lại), không bị reset draft đang gõ dở mỗi khi dòng/ô khác khiến component re-render.
  const [prevDisplay, setPrevDisplay] = useState(display)
  if (display !== prevDisplay) {
    setPrevDisplay(display)
    setDraft(display)
  }

  const handleChange = (e) => {
    const text = e.target.value
    setDraft(text)
    const parsed = parseVietnameseDate(text)
    if (parsed) onChange(parsed)
    else if (text.trim() === '') onChange(null)
    // else: đang gõ dở/chưa hợp lệ — chỉ giữ ở draft, chưa đẩy lên trên.
  }

  const handleBlur = () => setDraft(display) // rời ô khi còn gõ dở -> quay về giá trị đã lưu gần nhất

  return (
    <input
      type="text"
      value={draft}
      onChange={handleChange}
      onBlur={handleBlur}
      placeholder="dd/mm/yyyy"
      className={`w-full min-w-18 px-1.5 py-1 text-xs border border-transparent rounded hover:border-gray-300 focus:border-blue-400 focus:outline-none bg-transparent ${className}`}
    />
  )
}

// Đánh dấu "đã dò biên bản giao nhận" — thuần công cụ theo dõi riêng trên màn hình (lưu vào
// batch.checkedRowIds để giữ được qua lần tải lại trang, nhưng KHÔNG đụng vào khoC/khoLgt nên không kéo
// theo việc lưu nhầm các sửa nội dung khác chưa bấm "Lưu chỉnh sửa"), không xuất ra file Excel. Bấm vào ô
// bất kỳ trong dòng (để sửa hay chỉ để xem) sẽ đánh dấu; bấm lại vào đúng số STT của dòng đã đánh dấu để
// bỏ đánh dấu — tách riêng khỏi các ô còn lại để không bị bỏ đánh dấu ngoài ý muốn khi đang sửa nhiều ô
// liên tiếp trong cùng 1 dòng đã đánh dấu.
function ReceiptTableRow({ row, index, rank, editing, onRowChange, onRemoveRow, onInsertRow, checked, onToggleChecked }) {
  const chenh = calcChenhLech(row)
  const highlight = row.needsManual || !row.hanDung
  const rowClass = [
    highlight ? 'bg-amber-50/70' : 'border-t border-gray-50',
    checked ? 'border-l-4 border-l-emerald-500' : '',
  ].filter(Boolean).join(' ')

  const handleRowClick = (e) => {
    if (e.target.closest('button')) return
    if (!checked) onToggleChecked()
  }

  return (
    <tr className={rowClass} onClick={handleRowClick}>
      {/* STT hiển thị theo thứ tự đang XEM (rank) — khác với index (vị trí thật trong mảng dữ liệu,
          dùng để gọi onRowChange/onRemoveRow đúng dòng) vì bảng có thể đang sắp xếp alphabet. Đồng thời
          là nút bật/tắt đánh dấu "đã dò" (xem ghi chú trên hàm). */}
      <td className="px-2 py-1.5">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onToggleChecked() }}
          title={checked ? 'Bấm để bỏ đánh dấu "đã dò biên bản"' : 'Bấm để đánh dấu "đã dò biên bản"'}
          className={`flex items-center justify-center gap-0.5 min-w-6 h-5 px-1 rounded text-[11px] ${checked ? 'bg-emerald-500 text-white' : 'text-gray-500 hover:bg-gray-100'}`}
        >
          {checked && <Check size={11} />}{(rank ?? index) + 1}
        </button>
      </td>
      <td className="px-2 py-1.5 font-medium">
        {editing ? <EditableCell value={row.maHang} onChange={(v) => onRowChange(index, 'maHang', v)} /> : row.maHang}
      </td>
      <td className="px-2 py-1.5">
        {editing ? <EditableCell value={row.tenHang} onChange={(v) => onRowChange(index, 'tenHang', v)} multiline /> : row.tenHang}
      </td>
      <td className="px-2 py-1.5">
        {editing ? <EditableCell value={row.dvt} onChange={(v) => onRowChange(index, 'dvt', v)} /> : row.dvt}
      </td>
      <td className="px-2 py-1.5">
        {editing ? <EditableCell value={row.soLo} onChange={(v) => onRowChange(index, 'soLo', v)} /> : row.soLo}
      </td>
      <td className="px-2 py-1.5">
        {editing ? (
          <DateCell
            value={row.hanDung}
            onChange={(v) => onRowChange(index, 'hanDung', v)}
            className={!row.hanDung ? 'bg-amber-100' : ''}
          />
        ) : formatDateVi(row.hanDung)}
      </td>
      <td className="px-2 py-1.5 text-right">
        {editing ? <EditableCell type="number" value={row.kienNguyen} onChange={(v) => onRowChange(index, 'kienNguyen', v)} /> : row.kienNguyen}
      </td>
      <td className="px-2 py-1.5 text-right">
        {editing ? <EditableCell type="number" value={row.kienLe} onChange={(v) => onRowChange(index, 'kienLe', v)} /> : row.kienLe}
      </td>
      <td className="px-2 py-1.5 text-right">
        {editing ? <EditableCell type="number" value={row.slHoaDon} onChange={(v) => onRowChange(index, 'slHoaDon', v)} /> : row.slHoaDon}
      </td>
      <td className="px-2 py-1.5">
        {editing ? (
          <EditableCell
            type="number"
            value={row.slThucTe}
            onChange={(v) => onRowChange(index, 'slThucTe', v)}
            className="bg-amber-100"
          />
        ) : (row.slThucTe ?? '—')}
      </td>
      <td className={`px-2 py-1.5 text-right font-medium ${getChenhLechColor(chenh)}`}>
        {chenh ?? '—'}
      </td>
      <td className="px-2 py-1.5">
        {editing ? <EditableCell value={row.ghiChu} onChange={(v) => onRowChange(index, 'ghiChu', v)} className="bg-amber-100" /> : (row.ghiChu || '—')}
      </td>
      {editing && (
        <td className="px-2 py-1.5 text-center">
          <div className="flex items-center justify-center gap-1">
            <button type="button" onClick={() => onInsertRow(index)} className="p-1 rounded hover:bg-blue-50 text-gray-400 hover:text-blue-500" title="Thêm dòng mới ngay dưới dòng này">
              <Plus size={14} />
            </button>
            <button type="button" onClick={() => onRemoveRow(index)} className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500" title="Xoá dòng này">
              <Trash2 size={14} />
            </button>
          </div>
        </td>
      )}
    </tr>
  )
}

// Cột bấm được để sắp xếp alphabet — map tên cột hiển thị -> field dữ liệu tương ứng.
const SORTABLE_COLUMNS = { 'Mã hàng': 'maHang', 'Tên hàng': 'tenHang' }

// Dùng chung cho cả bảng hiển thị (ReceiptTable) LẪN lúc xuất file — trước đây bảng sắp xếp được nhưng
// "Tải Excel" luôn xuất theo đúng thứ tự gốc trong dữ liệu (không theo thứ tự đang xem trên màn hình),
// khiến file xuất ra khác thứ tự bảng đang hiển thị. Giữ đúng cùng 1 công thức so sánh (locale 'vi', số
// so theo giá trị chứ không so ký tự) để 2 nơi luôn khớp nhau.
function sortRowsBy(rows, sortKey, sortDir) {
  if (!sortKey) return rows
  const dir = sortDir === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => (
    dir * String(a[sortKey] || '').localeCompare(String(b[sortKey] || ''), 'vi', { sensitivity: 'base', numeric: true })
  ))
}

function nextSortState(current, key) {
  if (current.key !== key) return { key, dir: 'asc' }
  return { key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
}

function SortableHeader({ label, sortKey, activeKey, dir, disabled, onToggle }) {
  const active = activeKey === sortKey
  return (
    <th className="px-2 py-2 text-left font-medium whitespace-nowrap">
      <button
        type="button"
        onClick={() => onToggle(sortKey)}
        disabled={disabled}
        title={disabled ? 'Tắt "Chỉnh sửa" để sắp xếp theo cột này' : `Bấm để sắp xếp theo ${label} (A→Z / Z→A)`}
        className={`flex items-center gap-1 ${disabled ? 'cursor-not-allowed text-gray-400' : 'hover:text-gray-900'}`}
      >
        {label}
        {active && dir === 'asc' && <ArrowUp size={12} />}
        {active && dir !== 'asc' && <ArrowDown size={12} />}
        {!active && <ArrowUpDown size={12} className="text-gray-300" />}
      </button>
    </th>
  )
}

// Bảng chi tiết lệch kiện theo mã hàng (đối chiếu với biên bản giao nhận) — dùng cho cả 2 nhóm
// "conONhaMay" (lệch dương, tô cam) và "khac" (lệch âm, tô xám) trong buildFactoryReconciliation.
function FactoryReconciliationTable({ rows, tone }) {
  const lechCls = tone === 'warn' ? 'text-amber-800' : 'text-gray-600'
  const borderCls = tone === 'warn' ? 'border-amber-200' : 'border-gray-200'
  const rowBorderCls = tone === 'warn' ? 'border-amber-100' : 'border-gray-100'
  return (
    <div className={`mt-2 overflow-x-auto rounded-lg border bg-white ${borderCls}`}>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-gray-500 text-left">
            <th className="px-2 py-1.5 font-medium whitespace-nowrap">Mã hàng</th>
            <th className="px-2 py-1.5 font-medium">Tên hàng</th>
            <th className="px-2 py-1.5 font-medium text-right whitespace-nowrap">Đặt (2 kho)</th>
            <th className="px-2 py-1.5 font-medium text-right whitespace-nowrap">Biên bản</th>
            <th className="px-2 py-1.5 font-medium text-right whitespace-nowrap">Lệch</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.maHang} className={`border-t ${rowBorderCls}`}>
              <td className="px-2 py-1.5 text-gray-700 whitespace-nowrap">{r.maHang}</td>
              <td className="px-2 py-1.5 text-gray-700">{r.tenHang}</td>
              <td className="px-2 py-1.5 text-right text-gray-600">{r.dat}</td>
              <td className="px-2 py-1.5 text-right text-gray-600">{r.bienBan}</td>
              <td className={`px-2 py-1.5 text-right font-semibold ${lechCls}`}>{r.lech > 0 ? `+${r.lech}` : r.lech}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ReceiptTable({ title, rows, editing, onRowChange, onRemoveRow, onInsertRow, sortKey, sortDir, onToggleSort, checkedRowIds, onToggleChecked }) {
  // Sắp xếp CHỈ áp dụng khi KHÔNG Chỉnh sửa — nếu sắp cả lúc đang gõ Mã hàng/Tên hàng, mỗi ký tự gõ vào
  // sẽ đổi thứ tự ngay, dòng đang gõ nhảy vị trí liên tục ngay dưới con trỏ, trải nghiệm rất khó chịu dù
  // key={row.rowId} vẫn giữ đúng danh tính từng dòng. originalIndex giữ nguyên vị trí thật trong mảng dữ
  // liệu để onRowChange/onRemoveRow sửa đúng dòng dù bảng đang hiển thị theo thứ tự đã sắp xếp.
  // sortKey/sortDir được nhấc lên component cha (NhapHangTab) để "Tải Excel" xuất đúng theo thứ tự đang
  // xem trên bảng — xem sortRowsBy.
  const ordered = useMemo(() => {
    const indexed = rows.map((row, originalIndex) => ({ row, originalIndex }))
    if (editing || !sortKey) return indexed
    const dir = sortDir === 'asc' ? 1 : -1
    return [...indexed].sort((a, b) =>
      dir * String(a.row[sortKey] || '').localeCompare(String(b.row[sortKey] || ''), 'vi', { sensitivity: 'base', numeric: true })
    )
  }, [rows, editing, sortKey, sortDir])

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <h3 className="font-semibold text-sm text-gray-800">{title}</h3>
        <span className="text-xs text-gray-400">{rows.length} dòng</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              {['STT', 'Mã hàng', 'Tên hàng', 'ĐVT', 'Số lô', 'Hạn dùng', 'Kiện nguyên', 'Kiện lẻ', 'SL HĐ', 'SL TT', 'Chênh lệch', 'Ghi chú'].map(h => (
                SORTABLE_COLUMNS[h] ? (
                  <SortableHeader
                    key={h}
                    label={h}
                    sortKey={SORTABLE_COLUMNS[h]}
                    activeKey={sortKey}
                    dir={sortDir}
                    disabled={editing}
                    onToggle={onToggleSort}
                  />
                ) : (
                  <th key={h} className="px-2 py-2 text-left font-medium whitespace-nowrap">{h}</th>
                )
              ))}
              {editing && <th className="px-2 py-2 w-16" />}
            </tr>
          </thead>
          <tbody>
            {ordered.map(({ row, originalIndex }, rank) => (
              <ReceiptTableRow
                key={row.rowId}
                row={row}
                index={originalIndex}
                rank={rank}
                editing={editing}
                onRowChange={onRowChange}
                onRemoveRow={onRemoveRow}
                onInsertRow={onInsertRow}
                checked={checkedRowIds.has(row.rowId)}
                onToggleChecked={() => onToggleChecked(row.rowId)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function collectWarehouseWarnings(khoCItems, khoLgtItems) {
  const warnings = []
  for (const [items, warehouse] of [[khoCItems, 'C'], [khoLgtItems, 'LGT']]) {
    for (const item of items) {
      const detected = detectPhieuXuatKhoWarehouse(item.text)
      if (detected && detected !== warehouse) warnings.push(`${item.name}: nội dung PDF ghi Kho ${detected} nhưng đang ở vùng Kho ${warehouse}`)
    }
  }
  return warnings
}

function groupBatchesByMonth(batches) {
  const map = new Map()
  for (const batch of batches) {
    const key = monthKeyOf(batch.processedAt)
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(batch)
  }
  for (const list of map.values()) list.sort((a, b) => new Date(b.processedAt) - new Date(a.processedAt))
  return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1))
}

function resolveEffectiveMonthKey(selectedMonthKey, active, monthGroups) {
  if (selectedMonthKey && monthGroups.some(([key]) => key === selectedMonthKey)) return selectedMonthKey
  if (active) return monthKeyOf(active.processedAt)
  return monthGroups[0]?.[0] || null
}

function EmptyNhapHangState({ pendingFiles, onAddFiles, onRemoveFile, canProcess, processing, onProcess, error }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <PackagePlus size={18} className="text-gray-500" />
        <p className="text-sm text-gray-600">
          Mỗi kho vật lý có thể nhận nhiều file (Excel + PDF phiếu xuất kho) — thả vào vùng nào cũng
          được, PDF phiếu xuất kho tự ghi rõ đích đến (Kho C hay Kho DTP LGT) nên hệ thống tự tách đúng
          kho theo nội dung, không phụ thuộc vùng bạn thả.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        <FileZone
          label="Kho C *"
          hint="Kéo/thả hoặc click — nhận nhiều file .xlsx, .xls, .pdf"
          files={pendingFiles.khoC}
          onAddFiles={(files) => onAddFiles('khoC', files)}
          onRemoveFile={(i) => onRemoveFile('khoC', i)}
        />
        <FileZone
          label="Kho LGT (DTP) — tuỳ chọn"
          hint="Nếu chưa có file riêng, app sẽ dùng chung dữ liệu Kho C"
          files={pendingFiles.khoLgt}
          onAddFiles={(files) => onAddFiles('khoLgt', files)}
          onRemoveFile={(i) => onRemoveFile('khoLgt', i)}
        />
      </div>

      <FileZone
        label="Biên bản giao nhận — tuỳ chọn"
        hint="Chỉ nhận .pdf — dùng để đối chiếu SL thực tế + tổng kiện, không phải nguồn tách kho"
        accept=".pdf"
        files={pendingFiles.bienBan}
        onAddFiles={(files) => onAddFiles('bienBan', files)}
        onRemoveFile={(i) => onRemoveFile('bienBan', i)}
      />

      <div className="flex gap-2">
        <button
          type="button"
          disabled={!canProcess || processing}
          onClick={() => void onProcess()}
          className="px-4 py-2 rounded-lg bg-[#1e3a5f] text-white text-sm disabled:opacity-50"
        >
          {processing ? 'Đang xử lý...' : 'Tách kho & tạo biên bản'}
        </button>
      </div>

      {error && <p className="text-sm text-red-500 whitespace-pre-line">{error}</p>}
    </div>
  )
}

function KienCheckResultBanner({ result }) {
  if (!result) return null
  const ok = result.matched
  return (
    <p className={`text-xs rounded-lg px-3 py-2 mb-2 ${ok ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
      {ok ? '✅ ' : '⚠️ '}{result.message}
    </p>
  )
}

export default function NhapHangTab() {
  const [error, setError] = useState('')
  const [processing, setProcessing] = useState(false)
  const [editing, setEditing] = useState(false)
  const [historyQuery, setHistoryQuery] = useState('')
  const [historyRows, setHistoryRows] = useState([])
  const [exporting, setExporting] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [batches, setBatches] = useState(() => readBatches())
  const [uploadingBienBan, setUploadingBienBan] = useState(false)
  const [uploadingSupplement, setUploadingSupplement] = useState({ khoC: false, khoLgt: false })
  const [checkingKien, setCheckingKien] = useState(false)
  const [kienCheckResult, setKienCheckResult] = useState(null)
  const [showFactoryDetail, setShowFactoryDetail] = useState(false)
  const [showFactoryOther, setShowFactoryOther] = useState(false)
  const [activeId, setActiveId] = useState(readStoredActiveId)
  // null = chưa tự chọn tháng nào — mặc định bám theo tháng của chuyến đang xem (active).
  const [selectedMonthKey, setSelectedMonthKey] = useState(null)

  const [pendingFiles, setPendingFiles] = useState({ khoC: [], khoLgt: [], bienBan: [] })

  // Sắp xếp alphabet của mỗi bảng (Kho C/Kho LGT click cột "Mã hàng"/"Tên hàng") — nhấc lên đây (thay vì
  // để state riêng trong ReceiptTable) để "Tải Excel" xuất đúng theo thứ tự đang xem, không phải thứ tự
  // gốc trong dữ liệu.
  const [khoCSort, setKhoCSort] = useState({ key: null, dir: 'asc' })
  const [khoLgtSort, setKhoLgtSort] = useState({ key: null, dir: 'asc' })
  const toggleKhoCSort = key => setKhoCSort(current => nextSortState(current, key))
  const toggleKhoLgtSort = key => setKhoLgtSort(current => nextSortState(current, key))

  const active = batches.find(batch => batch.id === activeId) || null

  // Tự động lưu sửa ô/thêm dòng/xoá dòng sau ~1.2s ngừng thao tác — trước đây chỉ lưu khi bấm "Lưu chỉnh
  // sửa", thoát trang giữa chừng (đóng tab, bấm nhầm nút Back...) là mất sạch. Không gate theo `editing`
  // (chỉ theo hasUnsavedChanges) để việc tắt "Chỉnh sửa" ngay sau khi gõ không huỷ mất lượt lưu đang chờ.
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)

  useEffect(() => {
    if (!hasUnsavedChanges || !active) return
    const timer = setTimeout(() => {
      updateBatch(active.id, { khoC: active.khoC, khoLgt: active.khoLgt })
      setHasUnsavedChanges(false)
    }, 1200)
    return () => clearTimeout(timer)
  }, [hasUnsavedChanges, active])

  // Cảnh báo trình duyệt trước khi rời/đóng trang nếu còn thay đổi CHƯA kịp tự lưu (trong khoảng 1.2s chờ
  // ở trên) — đúng tình huống "thoát nhầm trang mất dữ liệu" đã gặp.
  useEffect(() => {
    if (!hasUnsavedChanges) return
    const handleBeforeUnload = (e) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [hasUnsavedChanges])

  // Hoàn tác (Ctrl+Z / Cmd+Z) cho sửa ô / thêm dòng / xoá dòng khi đang Chỉnh sửa — mỗi lần đổi batch hoặc
  // Lưu xong thì xoá lịch sử, không cho hoàn tác xuyên qua ranh giới đã lưu/đã đổi chuyến khác.
  const [undoStack, setUndoStack] = useState([])
  const [undoStackActiveId, setUndoStackActiveId] = useState(activeId)
  if (activeId !== undoStackActiveId) {
    setUndoStackActiveId(activeId)
    setUndoStack([])
  }

  const pushUndo = () => {
    if (!active) return
    setUndoStack(stack => [...stack.slice(-49), { batchId: active.id, khoC: active.khoC, khoLgt: active.khoLgt }])
  }

  useEffect(() => {
    if (!editing) return
    const handleKeyDown = e => {
      const isUndo = (e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'z'
      if (!isUndo || undoStack.length === 0) return
      e.preventDefault()
      const last = undoStack[undoStack.length - 1]
      setBatches(prev => prev.map(b => (b.id === last.batchId ? { ...b, khoC: last.khoC, khoLgt: last.khoLgt } : b)))
      setUndoStack(stack => stack.slice(0, -1))
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [editing, undoStack])

  const monthGroups = useMemo(() => groupBatchesByMonth(batches), [batches])

  // Mặc định bám theo tháng của chuyến đang xem; chỉ dùng lựa chọn tay khi tháng đó vẫn còn tồn tại
  // (vd sau khi xoá hết chuyến trong tháng đang xem tay thì quay lại bám theo active).
  const effectiveMonthKey = resolveEffectiveMonthKey(selectedMonthKey, active, monthGroups)
  const batchesInMonth = monthGroups.find(([key]) => key === effectiveMonthKey)?.[1] || []

  const canProcess = pendingFiles.khoC.some(isExcelFile)

  // Vùng "Biên bản giao nhận" chỉ nhận PDF (không tách kho, không phải nguồn Excel/phiếu xuất kho).
  const addFiles = (warehouse, incoming) => {
    const valid = warehouse === 'bienBan' ? incoming.filter(isPdfFile) : incoming.filter(isSupportedFile)
    const rejectedMsg = warehouse === 'bienBan'
      ? 'Chỉ nhận file .pdf — các file khác đã bị bỏ qua.'
      : 'Chỉ nhận file .xlsx, .xls hoặc .pdf — các file khác đã bị bỏ qua.'
    setError(valid.length < incoming.length ? rejectedMsg : '')
    setPendingFiles(current => ({ ...current, [warehouse]: [...current[warehouse], ...valid] }))
  }
  const removeFile = (warehouse, index) => {
    setPendingFiles(current => ({ ...current, [warehouse]: current[warehouse].filter((_, i) => i !== index) }))
  }

  // Đọc từng file Excel riêng lẻ, gom lỗi theo tên file — 1 file hỏng không chặn các file còn lại
  const readWarehouseRowsFromFiles = async (files, fileErrors) => {
    const results = await Promise.allSettled(files.map(async file => readWarehouseExportRows(await file.arrayBuffer())))
    const rows = []
    results.forEach((res, i) => {
      if (res.status === 'fulfilled') rows.push(...res.value)
      else fileErrors.push(`${files[i].name}: ${res.reason?.message || 'không đọc được file'}`)
    })
    return rows
  }

  // Trả về {name, text} thay vì chỉ text — cần tên file để báo lỗi/cảnh báo đúng chỗ.
  const readPdfTextsFromFiles = async (files, fileErrors) => {
    const results = await Promise.allSettled(files.map(async file => extractPdfText(await file.arrayBuffer())))
    const items = []
    results.forEach((res, i) => {
      if (res.status === 'fulfilled') items.push({ name: files[i].name, text: res.value })
      else fileErrors.push(`${files[i].name}: ${res.reason?.message || 'không đọc được file'}`)
    })
    return items
  }

  const processFiles = async () => {
    if (!canProcess) return
    setProcessing(true)
    setError('')
    try {
      const khoCExcelFiles = pendingFiles.khoC.filter(isExcelFile)
      const khoCPdfFiles = pendingFiles.khoC.filter(isPdfFile)
      const khoLgtExcelFilesRaw = pendingFiles.khoLgt.filter(isExcelFile)
      const khoLgtPdfFiles = pendingFiles.khoLgt.filter(isPdfFile)
      const bienBanFilesRaw = pendingFiles.bienBan
      const usedSharedExcel = khoLgtExcelFilesRaw.length === 0

      const fileErrors = []
      const khoCRows = await readWarehouseRowsFromFiles(khoCExcelFiles, fileErrors)
      const khoLgtRows = usedSharedExcel ? khoCRows : await readWarehouseRowsFromFiles(khoLgtExcelFilesRaw, fileErrors)
      const khoCPdfItems = await readPdfTextsFromFiles(khoCPdfFiles, fileErrors)
      const khoLgtPdfItems = await readPdfTextsFromFiles(khoLgtPdfFiles, fileErrors)
      const bienBanPdfItems = await readPdfTextsFromFiles(bienBanFilesRaw, fileErrors)
      // Gộp chung PDF của cả 2 vùng kho + vùng biên bản giao nhận — "Phiếu xuất kho" tự route theo đúng
      // "Lý do xuất kho" trong chính nó (buildReceiptFromFiles), không phụ thuộc vùng thả file; "Biên bản
      // giao nhận" chỉ dùng để đối chiếu, không quan tâm vùng nào.
      const pdfTexts = [...khoCPdfItems, ...khoLgtPdfItems, ...bienBanPdfItems].map(item => item.text)

      const warehouseWarnings = collectWarehouseWarnings(khoCPdfItems, khoLgtPdfItems)

      const pdfMetadata = parsePdfMetadata(pdfTexts[0] || '')
      const { khoC, khoLgt, warnings: reconciliationWarnings, factoryReconciliation } = buildReceiptFromFiles({ khoCRows, khoLgtRows, pdfTexts })

      const batchId = String(Date.now())
      const processedAt = new Date().toISOString()

      // Lưu (các) file Biên bản giao nhận lên Storage ngay lúc xử lý — dùng chung 1 lần upload cho cả
      // việc đối chiếu (ở trên) lẫn lưu trữ xem lại sau, không bắt upload lại lần 2. Theo Năm/Tháng (của
      // ngày xử lý) để duyệt trong Storage theo Năm > Tháng > các chuyến trong tháng.
      const bienBanFiles = []
      if (bienBanFilesRaw.length > 0) {
        const { createStorageFilesRepository, monthFolder } = await import('../data/storageFiles')
        const { supabase } = await import('../supabase')
        const repo = createStorageFilesRepository(supabase)
        for (const file of bienBanFilesRaw) {
          try {
            // Dùng UUID làm TÊN FILE lưu trên Storage, không dùng file.name gốc — tên gốc có thể chứa
            // dấu tiếng Việt/khoảng trắng khiến Supabase Storage báo "Invalid key" và không lưu được (tên
            // gốc vẫn hiển thị đúng cho người dùng qua fileName riêng, không mất). Đồng thời try/catch
            // TỪNG file — 1 file lỗi không được chặn các file còn lại lưu thành công.
            const path = `goods-receipt/${monthFolder(processedAt)}/${batchId}/${crypto.randomUUID()}.pdf`
            await repo.writeFile(path, file)
            bienBanFiles.push({ fileName: file.name, storagePath: path })
          } catch (err) {
            fileErrors.push(`Lưu biên bản giao nhận "${file.name}" lên kho tệp: ${err.message || err}`)
          }
        }
      }

      const warnings = [
        ...fileErrors.map(m => `Không đọc được: ${m}`),
        ...warehouseWarnings.map(m => `Cảnh báo: ${m}`),
        ...(reconciliationWarnings || []).map(m => `Cảnh báo: ${m}`),
      ]

      const entry = addBatch({
        id: batchId,
        processedAt,
        khoCFileNames: pendingFiles.khoC.map(f => f.name),
        khoLgtFileNames: pendingFiles.khoLgt.map(f => f.name),
        usedSharedExcel,
        pdfMetadata,
        bienBanFiles,
        warnings,
        khoC,
        khoLgt,
        factoryReconciliation,
      })
      setBatches(readBatches())
      setActiveId(entry.id)
      setPendingFiles({ khoC: [], khoLgt: [], bienBan: [] })
      setEditing(false)
    } catch (err) {
      setError(err.message || 'Không xử lý được dữ liệu nhập hàng.')
    } finally {
      setProcessing(false)
    }
  }

  const saveEdits = () => {
    if (!active) return
    updateBatch(active.id, { khoC: active.khoC, khoLgt: active.khoLgt })
    setBatches(readBatches())
    setEditing(false)
    setUndoStack([])
    setHasUnsavedChanges(false)
  }

  const patchRows = (warehouse, index, field, value) => {
    if (!active) return
    pushUndo()
    const key = warehouse === 'C' ? 'khoC' : 'khoLgt'
    const nextRows = [...active[key]]
    nextRows[index] = { ...nextRows[index], [field]: value }
    if (field === 'hanDung' && value) nextRows[index].needsManual = false
    const next = { ...active, [key]: nextRows }
    setBatches(batches.map(batch => (batch.id === active.id ? next : batch)))
    setHasUnsavedChanges(true)
  }

  // Chèn ngay TẠI vị trí người dùng muốn (dấu + trên từng dòng, xem ReceiptTableRow) — dòng thêm tay
  // không đến từ Excel/PDF nào nên đánh dấu needsManual để tô vàng nhắc điền đủ Mã hàng/Hạn dùng, giống
  // các dòng "chỉ thấy trong PDF" trước đây. Chèn ngay dưới dòng vừa bấm.
  const insertRowAfter = (warehouse, index) => {
    if (!active) return
    pushUndo()
    const key = warehouse === 'C' ? 'khoC' : 'khoLgt'
    const newRow = { rowId: crypto.randomUUID(), maHang: '', tenHang: '', dvt: '', soLo: '', hanDung: null, kienNguyen: 0, kienLe: 0, slHoaDon: 0, slThucTe: null, ghiChu: '', needsManual: true }
    const currentRows = active[key] || []
    const nextRows = [...currentRows.slice(0, index + 1), newRow, ...currentRows.slice(index + 1)]
    const next = { ...active, [key]: nextRows }
    setBatches(batches.map(batch => (batch.id === active.id ? next : batch)))
    setHasUnsavedChanges(true)
  }

  const removeRow = (warehouse, index) => {
    if (!active) return
    pushUndo()
    const key = warehouse === 'C' ? 'khoC' : 'khoLgt'
    const next = { ...active, [key]: (active[key] || []).filter((_, i) => i !== index) }
    setBatches(batches.map(batch => (batch.id === active.id ? next : batch)))
    setHasUnsavedChanges(true)
  }

  // Đánh dấu "đã dò biên bản giao nhận" — lưu riêng vào checkedRowIds của batch (không đụng khoC/khoLgt)
  // nên ghi thẳng ngay mỗi lần bấm, không cần đợi "Lưu chỉnh sửa", cũng không kéo theo lưu nhầm các sửa
  // nội dung khác đang dở dang chưa lưu. Không đưa vào lịch sử Ctrl+Z (pushUndo) vì đây chỉ là công cụ
  // theo dõi cá nhân, không phải nội dung nhập hàng.
  const checkedRowIds = useMemo(() => new Set(active?.checkedRowIds || []), [active])

  const toggleChecked = (rowId) => {
    if (!active) return
    const current = new Set(active.checkedRowIds || [])
    if (current.has(rowId)) current.delete(rowId)
    else current.add(rowId)
    const nextIds = [...current]
    setBatches(batches.map(batch => (batch.id === active.id ? { ...batch, checkedRowIds: nextIds } : batch)))
    updateBatch(active.id, { checkedRowIds: nextIds })
  }

  const removeActive = () => {
    if (!active) return
    if (!window.confirm('Xoá lịch sử lần nhập hàng này?')) return
    const next = removeBatchEntry(active.id)
    setBatches(next)
    setActiveId(next[0]?.id || null)
  }

  const downloadExcel = async () => {
    if (!active) return
    setExporting(true)
    setError('')
    try {
      // Đang Chỉnh sửa thì bảng bỏ qua sắp xếp để không nhảy dòng khi gõ (xem ReceiptTable) — xuất file
      // cũng theo đúng quy tắc đó cho khớp với những gì đang hiển thị.
      await exportReceiptFromTemplate({
        khoC: sortRowsBy(active.khoC || [], editing ? null : khoCSort.key, khoCSort.dir),
        khoLgt: sortRowsBy(active.khoLgt || [], editing ? null : khoLgtSort.key, khoLgtSort.dir),
        metadata: active.pdfMetadata || {},
        processedAt: new Date(active.processedAt),
      })
    } catch (err) {
      setError(err.message || 'Không xuất được file Excel.')
    } finally {
      setExporting(false)
    }
  }

  // File Biên bản giao nhận đã được lưu lên Storage ngay lúc xử lý (xem processFiles) — các hàm dưới
  // đây chỉ để xem lại / xoá / thêm bổ sung sau đó, không phải luồng upload chính.
  const viewBienBanFile = async (storagePath) => {
    if (!storagePath) return
    try {
      const { createStorageFilesRepository } = await import('../data/storageFiles')
      const { supabase } = await import('../supabase')
      const signedUrl = new URL(await createStorageFilesRepository(supabase).getSignedUrl(storagePath))
      if (signedUrl.origin !== new URL(import.meta.env.VITE_SUPABASE_URL).origin) {
        throw new Error('Liên kết xem biên bản không hợp lệ.')
      }
      const a = document.createElement('a')
      a.href = signedUrl.href
      a.target = '_blank'
      a.rel = 'noopener'
      a.click()
    } catch (err) {
      setError(err.message || 'Không mở được biên bản giao nhận.')
    }
  }

  const removeBienBanFile = async (storagePath) => {
    if (!active) return
    if (!window.confirm('Xoá biên bản giao nhận này?')) return
    try {
      const { createStorageFilesRepository } = await import('../data/storageFiles')
      const { supabase } = await import('../supabase')
      await createStorageFilesRepository(supabase).remove(storagePath)
    } catch { /* xoá khỏi batch dù xoá file trên storage lỗi — tránh kẹt UI */ }
    const nextFiles = (active.bienBanFiles || []).filter(bb => bb.storagePath !== storagePath)
    updateBatch(active.id, { bienBanFiles: nextFiles })
    setBatches(readBatches())
  }

  const addMoreBienBanFiles = async (incoming) => {
    if (!active) return
    const pdfs = incoming.filter(isPdfFile)
    if (pdfs.length === 0) return
    setUploadingBienBan(true)
    setError('')
    try {
      const { createStorageFilesRepository } = await import('../data/storageFiles')
      const { supabase } = await import('../supabase')
      const repo = createStorageFilesRepository(supabase)
      const added = []
      for (const file of pdfs) {
        const fileName = file.name.replaceAll('..', '').replace(/[\\/]/g, '')
        if (!fileName) throw new Error('Tên tệp không hợp lệ.')
        const path = `goods-receipt/${crypto.randomUUID()}.pdf`
        await repo.writeFile(path, file)
        added.push({ fileName, storagePath: path })
      }
      updateBatch(active.id, { bienBanFiles: [...(active.bienBanFiles || []), ...added] })
      setBatches(readBatches())
    } catch (err) {
      setError(err.message || 'Không tải lên được biên bản giao nhận.')
    } finally {
      setUploadingBienBan(false)
    }
  }

  // Thêm file BỔ SUNG (Excel hoặc PDF phiếu xuất kho) vào chuyến đã xử lý xong — dùng khi phát hiện lúc
  // đầu quên upload thiếu file. KHÔNG xử lý lại từ đầu (sẽ mất mọi chỉnh sửa tay đã làm): đọc riêng (các)
  // file mới rồi chạy qua ĐÚNG buildReceiptFromFiles như lúc xử lý ban đầu để có dòng đã merge/enrich, sau
  // đó cộng dồn vào bảng hiện có theo Mã hàng+Số lô (mergeSupplementRows) — dòng đã sửa tay (Ghi chú, SL
  // TT...) được giữ nguyên. File Excel thuộc ĐÚNG vùng bấm nút (Kho C hay Kho LGT do người dùng chọn khi
  // thả file, không tự suy ra được); file PDF phiếu xuất kho tự route theo "Lý do xuất kho" ghi trong
  // chính nó — có thể route sang kho KHÁC với nút vừa bấm, giống hệt lúc xử lý lần đầu.
  const addMoreWarehouseFiles = async (warehouse, incoming) => {
    if (!active) return
    const excelFiles = incoming.filter(isExcelFile)
    const pdfFiles = incoming.filter(isPdfFile)
    if (excelFiles.length === 0 && pdfFiles.length === 0) return
    const key = warehouse === 'C' ? 'khoC' : 'khoLgt'
    const fileNamesKey = warehouse === 'C' ? 'khoCFileNames' : 'khoLgtFileNames'
    setUploadingSupplement(current => ({ ...current, [key]: true }))
    setError('')
    try {
      const fileErrors = []
      const newRawRows = await readWarehouseRowsFromFiles(excelFiles, fileErrors)
      const pdfItems = await readPdfTextsFromFiles(pdfFiles, fileErrors)
      if (fileErrors.length > 0) throw new Error(fileErrors.filter(Boolean).join('; ') || 'Có tệp không thể đọc.')
      const pdfTexts = pdfItems.map(item => item.text)
      const warehouseWarnings = warehouse === 'C'
        ? collectWarehouseWarnings(pdfItems, [])
        : collectWarehouseWarnings([], pdfItems)
      const { khoC: newKhoC, khoLgt: newKhoLgt, warnings: reconciliationWarnings } = buildReceiptFromFiles({
        khoCRows: warehouse === 'C' ? newRawRows : [],
        khoLgtRows: warehouse === 'LGT' ? newRawRows : [],
        pdfTexts,
      })
      const nextKhoC = mergeSupplementRows(active.khoC || [], newKhoC)
      const nextKhoLgt = mergeSupplementRows(active.khoLgt || [], newKhoLgt)
      const nextFileNames = [...(active[fileNamesKey] || []), ...incoming.map(f => f.name)]
      const newWarnings = [...warehouseWarnings, ...(reconciliationWarnings || [])].map(m => `Cảnh báo (bổ sung): ${m}`)
      const nextWarnings = [...(active.warnings || []), ...newWarnings]
      updateBatch(active.id, { khoC: nextKhoC, khoLgt: nextKhoLgt, [fileNamesKey]: nextFileNames, warnings: nextWarnings })
      setBatches(readBatches())
    } catch (err) {
      setError(err.message || 'Không đọc được file bổ sung.')
    } finally {
      setUploadingSupplement(current => ({ ...current, [key]: false }))
    }
  }

  // Đối chiếu lại RIÊNG tổng kiện — dùng sau khi người dùng dò tay và tự sửa Kiện nguyên/Kiện lẻ trong chế
  // độ Chỉnh sửa, để kiểm tra đã khớp với (các) biên bản giao nhận (Loại 2) đã lưu chưa, không cần xử lý
  // lại cả chuyến từ đầu. Tải lại đúng file PDF gốc từ Storage (chỉ lưu file, chưa lưu text đã trích) rồi
  // đọc lại text mỗi lần bấm — hơi tốn nhưng đơn giản, và chuyến hàng nào cũng chỉ vài file biên bản.
  const recheckKienReconciliation = async () => {
    if (!active) return
    const bienBan = active.bienBanFiles || []
    if (bienBan.length === 0) {
      setKienCheckResult({ matched: false, message: 'Chưa có biên bản giao nhận nào để đối chiếu lại.' })
      return
    }
    setCheckingKien(true)
    setKienCheckResult(null)
    setError('')
    try {
      const { createStorageFilesRepository } = await import('../data/storageFiles')
      const { supabase } = await import('../supabase')
      const repo = createStorageFilesRepository(supabase)
      const pdfTexts = []
      const readErrors = []
      for (const bb of bienBan) {
        try {
          const buf = await repo.downloadFile(bb.storagePath)
          pdfTexts.push(await extractPdfText(buf))
        } catch (err) {
          readErrors.push(`${bb.fileName}: ${err.message || err}`)
        }
      }
      const result = recheckKienTotal({ khoC: active.khoC, khoLgt: active.khoLgt, pdfTexts })
      setKienCheckResult(readErrors.length > 0
        ? { matched: false, message: `${result.message} (Không đọc được: ${readErrors.join('; ')})` }
        : { matched: result.matched, message: result.message })

      // Cập nhật luôn vào Cảnh báo đối chiếu đã lưu — khớp thì bỏ dòng cảnh báo tổng kiện cũ (nếu có),
      // lệch thì thay bằng số mới nhất, các cảnh báo khác (lệch SL từng dòng...) giữ nguyên.
      const otherWarnings = (active.warnings || []).filter(w => !w.includes('kiện nhưng bảng'))
      const nextWarnings = result.checked && !result.matched
        ? [...otherWarnings, `Cảnh báo: ${result.message}`]
        : otherWarnings
      updateBatch(active.id, { warnings: nextWarnings, factoryReconciliation: result.factoryReconciliation })
      setBatches(readBatches())
    } catch (err) {
      setKienCheckResult({ matched: false, message: err.message || 'Không đối chiếu lại được.' })
    } finally {
      setCheckingKien(false)
    }
  }

  const searchHistory = async () => {
    const q = normalizeHistoryQuery(historyQuery)
    if (!q) { setHistoryRows([]); return }
    setHistoryLoading(true)
    try {
      const { createGoodsReceiptBatchesRepository } = await import('../data/goodsReceiptBatches')
      const { supabase } = await import('../supabase')
      const repo = createGoodsReceiptBatchesRepository(supabase)
      const rows = await repo.searchByMaHangOrTenHang(q)
      setHistoryRows(rows)
    } catch (err) {
      setError(err.message || 'Không tra cứu được lịch sử.')
      setHistoryRows([])
    } finally {
      setHistoryLoading(false)
    }
  }

  const localHistoryMatches = useMemo(
    () => collectLocalHistoryMatches(batches, historyQuery),
    [batches, historyQuery],
  )

  const displayHistory = historyRows.length > 0 ? historyRows : localHistoryMatches

  if (!active) {
    return (
      <EmptyNhapHangState
        pendingFiles={pendingFiles}
        onAddFiles={addFiles}
        onRemoveFile={removeFile}
        canProcess={canProcess}
        processing={processing}
        onProcess={processFiles}
        error={error}
      />
    )
  }

  return (
    <div className="space-y-4">
      {batches.length > 1 && (
        <div className="space-y-1.5">
          <select
            value={effectiveMonthKey || ''}
            onChange={(e) => setSelectedMonthKey(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg text-xs font-medium border border-gray-200 bg-white text-gray-700 hover:border-blue-300 focus:outline-none focus:border-blue-400"
          >
            {monthGroups.map(([key, group]) => (
              <option key={key} value={key}>{monthLabelOf(key)} ({group.length} chuyến)</option>
            ))}
          </select>
          <div className="flex flex-wrap gap-1.5">
            {batchesInMonth.map(batch => (
              <button
                key={batch.id}
                type="button"
                onClick={() => { localStorage.setItem(ACTIVE_KEY, batch.id); setActiveId(batch.id) }}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                  batch.id === activeId ? 'bg-[#1e3a5f] text-white border-[#1e3a5f]' : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
                }`}
              >
                {batchLabelOf(batch.processedAt)}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div
          className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-sm"
          title={`Kho C: ${(active.khoCFileNames || []).join(', ')}\nKho LGT: ${(active.khoLgtFileNames || []).join(', ') || '(dùng chung Kho C)'}`}
        >
          <FileSpreadsheet size={15} className="text-green-600" />
          <span className="text-green-700 font-medium">Kho C: {(active.khoCFileNames || []).length} file</span>
          <span className="text-green-500 text-xs">
            · Kho LGT: {active.usedSharedExcel ? 'dùng chung Kho C' : `${(active.khoLgtFileNames || []).length} file`}
          </span>
          <button type="button" onClick={removeActive} className="ml-1 p-0.5 rounded hover:bg-green-100 text-green-400 hover:text-green-700" title="Xoá lần xử lý này">
            <X size={14} />
          </button>
        </div>
        {/* Bổ sung file (Excel hoặc PDF phiếu xuất kho) còn thiếu cho chuyến ĐÃ xử lý xong — không xử lý
            lại từ đầu (sẽ mất chỉnh sửa tay), chỉ đọc riêng file mới rồi cộng dồn vào bảng theo Mã hàng+Số
            lô. File PDF phiếu xuất kho tự route đúng kho theo nội dung, không phụ thuộc nút nào bấm. */}
        <label
          className={`flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm cursor-pointer
            ${uploadingSupplement.khoC ? 'opacity-60 pointer-events-none' : 'hover:border-blue-400 text-gray-600'}`}
          title="Thêm file Excel hoặc PDF phiếu xuất kho còn thiếu vào Kho C — cộng dồn vào bảng đã có, không xử lý lại từ đầu"
        >
          <Plus size={14} /> {uploadingSupplement.khoC ? 'Đang thêm...' : 'Thêm file Kho C'}
          <input
            type="file"
            multiple
            accept=".xlsx,.xls,.pdf"
            className="hidden"
            disabled={uploadingSupplement.khoC}
            onChange={(e) => { void addMoreWarehouseFiles('C', [...e.target.files]); e.target.value = '' }}
          />
        </label>
        <label
          className={`flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm cursor-pointer
            ${uploadingSupplement.khoLgt ? 'opacity-60 pointer-events-none' : 'hover:border-blue-400 text-gray-600'}`}
          title="Thêm file Excel hoặc PDF phiếu xuất kho còn thiếu vào Kho LGT — cộng dồn vào bảng đã có, không xử lý lại từ đầu"
        >
          <Plus size={14} /> {uploadingSupplement.khoLgt ? 'Đang thêm...' : 'Thêm file Kho LGT'}
          <input
            type="file"
            multiple
            accept=".xlsx,.xls,.pdf"
            className="hidden"
            disabled={uploadingSupplement.khoLgt}
            onChange={(e) => { void addMoreWarehouseFiles('LGT', [...e.target.files]); e.target.value = '' }}
          />
        </label>
        <button type="button" onClick={() => { setActiveId(null); setSelectedMonthKey(null); setBatches(readBatches()) }} className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm hover:border-blue-400 text-gray-600">
          <Upload size={14} /> Xử lý chuyến mới
        </button>
        <button
          type="button"
          onClick={() => setEditing(v => !v)}
          title={editing ? 'Ctrl+Z (Cmd+Z trên Mac) để hoàn tác sửa ô / thêm dòng / xoá dòng gần nhất' : undefined}
          className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm hover:border-blue-400 text-gray-600"
        >
          <Pencil size={14} /> {editing ? 'Đang sửa' : 'Chỉnh sửa'}
        </button>
        {editing && (
          <button type="button" onClick={saveEdits} className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm">
            <Save size={14} /> Lưu chỉnh sửa
          </button>
        )}
        {editing && hasUnsavedChanges && (
          <span className="text-xs text-gray-400">Đang tự lưu…</span>
        )}
        <button
          type="button"
          disabled={exporting}
          onClick={() => void downloadExcel()}
          className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm hover:border-blue-400 text-gray-600 disabled:opacity-50"
        >
          <Download size={14} /> {exporting ? 'Đang tạo file...' : 'Tải Excel (mẫu công ty)'}
        </button>
      </div>

      {active.usedSharedExcel && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
          Chưa có Excel riêng Kho LGT — đang hiển thị cùng dữ liệu với Kho C. Upload file LGT hoặc chỉnh sửa bảng Kho LGT nếu số liệu khác.
        </p>
      )}

      {(active.warnings || []).length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-amber-600 text-base leading-none">⚠️</span>
            <h3 className="font-semibold text-sm text-amber-800">Cảnh báo đối chiếu ({active.warnings.length})</h3>
          </div>
          <ul className="space-y-1 text-xs text-amber-800 list-disc list-inside">
            {active.warnings.map(w => <li key={w}>{w}</li>)}
          </ul>

          {active.factoryReconciliation?.conONhaMay?.length > 0 && (
            <div className="mt-2">
              <button
                type="button"
                onClick={() => setShowFactoryDetail(v => !v)}
                className="text-xs font-medium text-amber-800 underline hover:text-amber-900"
              >
                {showFactoryDetail ? 'Ẩn chi tiết theo mã hàng ▴' : 'Xem chi tiết theo mã hàng ▾'}
              </button>
              {showFactoryDetail && <FactoryReconciliationTable rows={active.factoryReconciliation.conONhaMay} tone="warn" />}
            </div>
          )}

          {active.factoryReconciliation?.khac?.length > 0 && (
            <div className="mt-2">
              <button
                type="button"
                onClick={() => setShowFactoryOther(v => !v)}
                className="text-xs text-gray-500 underline hover:text-gray-700"
              >
                {showFactoryOther
                  ? 'Ẩn mục khác ▴'
                  : `Khác (${active.factoryReconciliation.khac.length} mã, biên bản khai nhiều hơn — không phải hàng còn ở nhà máy) ▾`}
              </button>
              {showFactoryOther && <FactoryReconciliationTable rows={active.factoryReconciliation.khac} tone="neutral" />}
            </div>
          )}

          <p className="text-xs text-amber-700 mt-2">Kiểm tra và sửa trực tiếp bằng nút "Chỉnh sửa" ở trên nếu cần.</p>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <FileText size={16} className="text-gray-500" />
          <h3 className="font-semibold text-sm">Biên bản giao nhận</h3>
          <span className="text-xs text-gray-400">dùng để đối chiếu SL thực tế + tổng kiện — đã tải lên lúc xử lý</span>
          <button
            type="button"
            disabled={checkingKien}
            onClick={() => void recheckKienReconciliation()}
            className="ml-auto flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg text-xs hover:border-blue-400 text-gray-600 disabled:opacity-50"
            title="Kiểm tra lại xem tổng số kiện (sau khi dò tay/sửa) đã khớp biên bản giao nhận chưa"
          >
            <RefreshCw size={12} className={checkingKien ? 'animate-spin' : ''} />
            {checkingKien ? 'Đang đối chiếu...' : 'Đối chiếu lại số kiện'}
          </button>
        </div>
        <KienCheckResultBanner result={kienCheckResult} />
        {(active.bienBanFiles || []).length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {active.bienBanFiles.map((bb) => (
              <span key={bb.storagePath} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-green-50 border border-green-200 rounded-lg text-xs text-green-700">
                <FileText size={12} className="shrink-0" />
                <span className="max-w-40 truncate" title={bb.fileName}>{bb.fileName}</span>
                <button type="button" onClick={() => void viewBienBanFile(bb.storagePath)} className="text-blue-600 hover:underline shrink-0">Xem</button>
                <button type="button" onClick={() => void removeBienBanFile(bb.storagePath)} className="text-green-400 hover:text-red-500 shrink-0" title="Xoá">
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        )}
        <label
          className={`flex items-center justify-center gap-1.5 w-full min-h-11 rounded-lg border-2 border-dashed cursor-pointer transition-colors p-2 text-center
            ${uploadingBienBan ? 'opacity-60 pointer-events-none border-gray-300' : 'border-gray-300 hover:border-blue-400 hover:bg-blue-50/30'}`}
        >
          <FileUp size={14} className="text-gray-400" />
          <span className="text-xs text-gray-500">{uploadingBienBan ? 'Đang tải lên...' : 'Thêm biên bản giao nhận (PDF)'}</span>
          <input
            type="file"
            multiple
            accept=".pdf"
            className="hidden"
            disabled={uploadingBienBan}
            onChange={(e) => { void addMoreBienBanFiles([...e.target.files]); e.target.value = '' }}
          />
        </label>
      </div>

      <ReceiptTable
        title="Kho C"
        rows={active.khoC || []}
        editing={editing}
        onRowChange={(i, f, v) => patchRows('C', i, f, v)}
        onRemoveRow={(i) => removeRow('C', i)}
        onInsertRow={(i) => insertRowAfter('C', i)}
        sortKey={khoCSort.key}
        sortDir={khoCSort.dir}
        onToggleSort={toggleKhoCSort}
        checkedRowIds={checkedRowIds}
        onToggleChecked={toggleChecked}
      />
      <ReceiptTable
        title="Kho LGT"
        rows={active.khoLgt || []}
        editing={editing}
        onRowChange={(i, f, v) => patchRows('LGT', i, f, v)}
        onRemoveRow={(i) => removeRow('LGT', i)}
        onInsertRow={(i) => insertRowAfter('LGT', i)}
        sortKey={khoLgtSort.key}
        sortDir={khoLgtSort.dir}
        onToggleSort={toggleKhoLgtSort}
        checkedRowIds={checkedRowIds}
        onToggleChecked={toggleChecked}
      />

      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center gap-2 mb-3">
          <History size={16} className="text-gray-500" />
          <h3 className="font-semibold text-sm">Tra cứu lịch sử theo Mã hàng / Tên hàng</h3>
        </div>
        <div className="flex gap-2 mb-3">
          <div className="relative flex-1 max-w-sm">
            <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={historyQuery}
              maxLength={MAX_HISTORY_QUERY_LENGTH}
              onChange={(e) => setHistoryQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void searchHistory()}
              placeholder="Nhập mã hàng hoặc tên hàng..."
              className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg"
            />
          </div>
          <button type="button" onClick={() => void searchHistory()} disabled={historyLoading} className="px-3 py-2 text-sm border border-gray-200 rounded-lg hover:border-blue-300">
            {historyLoading ? 'Đang tìm...' : 'Tìm trên Supabase'}
          </button>
        </div>
        {displayHistory.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  {['Ngày', 'Kho', 'Mã hàng', 'Tên hàng', 'Số lô', 'Hạn dùng', 'SL HĐ'].map(h => (
                    <th key={h} className="px-2 py-2 text-left font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayHistory.map((row, i) => (
                  <tr key={`${row.ma_hang}-${row.so_lo}-${i}`} className="border-t border-gray-50">
                    <td className="px-2 py-1.5">{formatDateVi(row.goods_receipt_batches?.processed_at?.slice(0, 10))}</td>
                    <td className="px-2 py-1.5">{row.warehouse}</td>
                    <td className="px-2 py-1.5 font-medium">{row.ma_hang}</td>
                    <td className="px-2 py-1.5">{row.ten_hang}</td>
                    <td className="px-2 py-1.5">{row.so_lo}</td>
                    <td className="px-2 py-1.5">{formatDateVi(row.han_dung)}</td>
                    <td className="px-2 py-1.5 text-right">{row.sl_hoa_don}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  )
}
