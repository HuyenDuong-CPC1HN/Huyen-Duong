import { useMemo, useRef, useState } from 'react'
import {
  Upload, FileUp, FileSpreadsheet, X, Download, Search, PackagePlus,
  Pencil, Save, History, FileText, Plus, Trash2,
} from 'lucide-react'
import { opsStore as localStorage } from '../data/workspace'
import {
  buildReceiptFromFiles,
  calcChenhLech,
  detectPhieuXuatKhoWarehouse,
  extractPdfText,
  parsePdfMetadata,
  readWarehouseExportRows,
} from '../utils/parseGoodsReceipt'
import { exportReceiptFromTemplate } from '../utils/exportGoodsReceipt'

const STORAGE_KEY = 'goods_receipt_batches'
const ACTIVE_KEY = 'goods_receipt_active'

function readBatches() {
  try {
    const batches = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    return Array.isArray(batches) ? batches : []
  } catch { return [] }
}

function writeBatches(batches) { localStorage.setItem(STORAGE_KEY, JSON.stringify(batches)) }

function addBatch(entry) {
  const batches = readBatches()
  const withId = { id: entry.id || String(Date.now()), ...entry }
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

function EditableCell({ value, onChange, type = 'text', className = '' }) {
  const handleChange = (e) => {
    if (type === 'number') {
      onChange(e.target.value === '' ? null : Number(e.target.value))
    } else {
      onChange(e.target.value)
    }
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
  const inputRef = useRef(null)
  const [dragging, setDragging] = useState(false)

  return (
    <div className="border border-gray-200 rounded-xl p-3 bg-white">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false) }}
        onDrop={(e) => { e.preventDefault(); setDragging(false); onAddFiles([...e.dataTransfer.files]) }}
        onClick={() => inputRef.current?.click()}
        className={`flex flex-col items-center justify-center gap-2 w-full min-h-28 rounded-xl border-2 border-dashed cursor-pointer transition-all select-none p-4
          ${dragging ? 'border-blue-500 bg-blue-50 scale-[1.01]' : 'border-gray-300 hover:border-blue-400 hover:bg-blue-50/30'}`}
      >
        <FileUp size={20} className={dragging ? 'text-blue-500' : 'text-gray-400'} />
        <div className="text-center">
          <p className="text-sm font-semibold text-gray-700">{label}</p>
          <p className="text-xs text-gray-400 mt-0.5">{hint}</p>
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={accept}
        className="hidden"
        onChange={(e) => { onAddFiles([...e.target.files]); e.target.value = '' }}
      />
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

function ReceiptTableRow({ row, index, editing, onRowChange, onRemoveRow }) {
  const chenh = calcChenhLech(row)
  const highlight = row.needsManual || !row.hanDung

  return (
    <tr className={highlight ? 'bg-amber-50/70' : 'border-t border-gray-50'}>
      <td className="px-2 py-1.5 text-gray-500">{index + 1}</td>
      <td className="px-2 py-1.5 font-medium">
        {editing ? <EditableCell value={row.maHang} onChange={(v) => onRowChange(index, 'maHang', v)} /> : row.maHang}
      </td>
      <td className="px-2 py-1.5">
        {editing ? <EditableCell value={row.tenHang} onChange={(v) => onRowChange(index, 'tenHang', v)} /> : row.tenHang}
      </td>
      <td className="px-2 py-1.5">
        {editing ? <EditableCell value={row.dvt} onChange={(v) => onRowChange(index, 'dvt', v)} /> : row.dvt}
      </td>
      <td className="px-2 py-1.5">
        {editing ? <EditableCell value={row.soLo} onChange={(v) => onRowChange(index, 'soLo', v)} /> : row.soLo}
      </td>
      <td className="px-2 py-1.5">
        {editing ? (
          <EditableCell
            value={row.hanDung ? row.hanDung.split('-').reverse().join('/') : ''}
            onChange={(v) => onRowChange(index, 'hanDung', parseVietnameseDate(v))}
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
          <button type="button" onClick={() => onRemoveRow(index)} className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500" title="Xoá dòng này">
            <Trash2 size={14} />
          </button>
        </td>
      )}
    </tr>
  )
}

function ReceiptTable({ title, rows, editing, onRowChange, onRemoveRow }) {
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
                <th key={h} className="px-2 py-2 text-left font-medium whitespace-nowrap">{h}</th>
              ))}
              {editing && <th className="px-2 py-2 w-8" />}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <ReceiptTableRow
                // Dùng index làm key, KHÔNG ghép Mã hàng/Số lô vào key — 2 ô đó chính là ô người dùng
                // gõ tay khi Chỉnh sửa, nên key đổi theo từng ký tự khiến React coi dòng là component
                // mới, unmount rồi mount lại <input> ngay sau mỗi ký tự -> mất focus, phải bấm lại liên
                // tục. ReceiptTableRow không giữ state nội bộ (mọi giá trị đến từ prop row) nên key theo
                // index là an toàn.
                key={index}
                row={row}
                index={index}
                editing={editing}
                onRowChange={onRowChange}
                onRemoveRow={onRemoveRow}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
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
  const [activeId, setActiveId] = useState(() => {
    const saved = localStorage.getItem(ACTIVE_KEY)
    const all = readBatches()
    if (all.some(batch => batch.id === saved)) return saved
    return all[0]?.id || null
  })

  const [pendingFiles, setPendingFiles] = useState({ khoC: [], khoLgt: [], bienBan: [] })

  const active = batches.find(batch => batch.id === activeId) || null

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

      // Cảnh báo (không chặn) nếu lỡ thả nhầm vùng thói quen — không ảnh hưởng kết quả phân kho.
      const warehouseWarnings = []
      for (const item of khoCPdfItems) {
        const detected = detectPhieuXuatKhoWarehouse(item.text)
        if (detected && detected !== 'C') warehouseWarnings.push(`${item.name}: nội dung PDF ghi Kho ${detected} nhưng đang ở vùng Kho C`)
      }
      for (const item of khoLgtPdfItems) {
        const detected = detectPhieuXuatKhoWarehouse(item.text)
        if (detected && detected !== 'LGT') warehouseWarnings.push(`${item.name}: nội dung PDF ghi Kho ${detected} nhưng đang ở vùng Kho LGT`)
      }

      const pdfMetadata = parsePdfMetadata(pdfTexts[0] || '')
      const { khoC, khoLgt, warnings: reconciliationWarnings } = buildReceiptFromFiles({ khoCRows, khoLgtRows, pdfTexts })

      const batchId = String(Date.now())
      const processedAt = new Date().toISOString()

      // Lưu (các) file Biên bản giao nhận lên Storage ngay lúc xử lý — dùng chung 1 lần upload cho cả
      // việc đối chiếu (ở trên) lẫn lưu trữ xem lại sau, không bắt upload lại lần 2. Theo Năm/Tháng (của
      // ngày xử lý) để duyệt trong Storage theo Năm > Tháng > các chuyến trong tháng.
      const bienBanFiles = []
      if (bienBanFilesRaw.length > 0) {
        try {
          const { createStorageFilesRepository, monthFolder } = await import('../data/storageFiles')
          const { supabase } = await import('../supabase')
          const repo = createStorageFilesRepository(supabase)
          for (const file of bienBanFilesRaw) {
            const path = `goods-receipt/${monthFolder(processedAt)}/${batchId}/${file.name}`
            await repo.writeFile(path, file)
            bienBanFiles.push({ fileName: file.name, storagePath: path })
          }
        } catch (err) {
          fileErrors.push(`Lưu biên bản giao nhận lên kho tệp: ${err.message || err}`)
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
  }

  const patchRows = (warehouse, index, field, value) => {
    if (!active) return
    const key = warehouse === 'C' ? 'khoC' : 'khoLgt'
    const nextRows = [...active[key]]
    nextRows[index] = { ...nextRows[index], [field]: value }
    if (field === 'hanDung' && value) nextRows[index].needsManual = false
    const next = { ...active, [key]: nextRows }
    setBatches(batches.map(batch => (batch.id === active.id ? next : batch)))
  }

  // Dòng thêm tay không đến từ Excel/PDF nào — cần điền đủ Mã hàng/Hạn dùng nên đánh dấu needsManual để
  // được tô vàng nhắc kiểm tra, giống các dòng "chỉ thấy trong PDF" trước đây. Chèn lên ĐẦU bảng (không
  // phải cuối) vì nút bấm nằm ở thanh công cụ trên cùng — bảng có thể dài hàng chục dòng, chèn cuối sẽ
  // phải cuộn xuống mới thấy để điền.
  const addRow = (warehouse) => {
    if (!active) return
    const key = warehouse === 'C' ? 'khoC' : 'khoLgt'
    const newRow = { maHang: '', tenHang: '', dvt: '', soLo: '', hanDung: null, kienNguyen: 0, kienLe: 0, slHoaDon: 0, slThucTe: null, ghiChu: '', needsManual: true }
    const next = { ...active, [key]: [newRow, ...(active[key] || [])] }
    setBatches(batches.map(batch => (batch.id === active.id ? next : batch)))
  }

  const removeRow = (warehouse, index) => {
    if (!active) return
    const key = warehouse === 'C' ? 'khoC' : 'khoLgt'
    const next = { ...active, [key]: (active[key] || []).filter((_, i) => i !== index) }
    setBatches(batches.map(batch => (batch.id === active.id ? next : batch)))
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
      await exportReceiptFromTemplate({
        khoC: active.khoC,
        khoLgt: active.khoLgt,
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
      const url = await createStorageFilesRepository(supabase).getSignedUrl(storagePath)
      window.open(url, '_blank', 'noopener')
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
      const { createStorageFilesRepository, monthFolder } = await import('../data/storageFiles')
      const { supabase } = await import('../supabase')
      const repo = createStorageFilesRepository(supabase)
      const added = []
      for (const file of pdfs) {
        const path = `goods-receipt/${monthFolder(active.processedAt)}/${active.id}/${file.name}`
        await repo.writeFile(path, file)
        added.push({ fileName: file.name, storagePath: path })
      }
      updateBatch(active.id, { bienBanFiles: [...(active.bienBanFiles || []), ...added] })
      setBatches(readBatches())
    } catch (err) {
      setError(err.message || 'Không tải lên được biên bản giao nhận.')
    } finally {
      setUploadingBienBan(false)
    }
  }

  const searchHistory = async () => {
    const q = historyQuery.trim()
    if (!q) { setHistoryRows([]); return }
    setHistoryLoading(true)
    try {
      const { createGoodsReceiptBatchesRepository } = await import('../data/goodsReceiptBatches')
      const { supabase } = await import('../supabase')
      const repo = createGoodsReceiptBatchesRepository(supabase)
      const rows = await repo.searchByMaHang(q)
      setHistoryRows(rows)
    } catch (err) {
      setError(err.message || 'Không tra cứu được lịch sử.')
      setHistoryRows([])
    } finally {
      setHistoryLoading(false)
    }
  }

  const localHistoryMatches = useMemo(() => {
    const q = historyQuery.trim().toLowerCase()
    if (!q) return []
    const hits = []
    for (const batch of batches) {
      for (const row of (batch.khoC || [])) {
        if (String(row.maHang).toLowerCase().includes(q)) {
          hits.push({
            ma_hang: row.maHang,
            ten_hang: row.tenHang,
            so_lo: row.soLo,
            sl_hoa_don: row.slHoaDon,
            han_dung: row.hanDung,
            warehouse: 'C',
            goods_receipt_batches: { processed_at: batch.processedAt },
          })
        }
      }
      for (const row of (batch.khoLgt || [])) {
        if (String(row.maHang).toLowerCase().includes(q)) {
          hits.push({
            ma_hang: row.maHang,
            ten_hang: row.tenHang,
            so_lo: row.soLo,
            sl_hoa_don: row.slHoaDon,
            han_dung: row.hanDung,
            warehouse: 'LGT',
            goods_receipt_batches: { processed_at: batch.processedAt },
          })
        }
      }
    }
    return hits
  }, [batches, historyQuery])

  const displayHistory = historyRows.length > 0 ? historyRows : localHistoryMatches

  if (!active) {
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
            onAddFiles={(files) => addFiles('khoC', files)}
            onRemoveFile={(i) => removeFile('khoC', i)}
          />
          <FileZone
            label="Kho LGT (DTP) — tuỳ chọn"
            hint="Nếu chưa có file riêng, app sẽ dùng chung dữ liệu Kho C"
            files={pendingFiles.khoLgt}
            onAddFiles={(files) => addFiles('khoLgt', files)}
            onRemoveFile={(i) => removeFile('khoLgt', i)}
          />
        </div>

        <FileZone
          label="Biên bản giao nhận — tuỳ chọn"
          hint="Chỉ nhận .pdf — dùng để đối chiếu SL thực tế + tổng kiện, không phải nguồn tách kho"
          accept=".pdf"
          files={pendingFiles.bienBan}
          onAddFiles={(files) => addFiles('bienBan', files)}
          onRemoveFile={(i) => removeFile('bienBan', i)}
        />

        <div className="flex gap-2">
          <button
            type="button"
            disabled={!canProcess || processing}
            onClick={() => void processFiles()}
            className="px-4 py-2 rounded-lg bg-[#1e3a5f] text-white text-sm disabled:opacity-50"
          >
            {processing ? 'Đang xử lý...' : 'Tách kho & tạo biên bản'}
          </button>
        </div>

        {error && <p className="text-sm text-red-500 whitespace-pre-line">{error}</p>}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {batches.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {batches.map(batch => (
            <button
              key={batch.id}
              type="button"
              onClick={() => { localStorage.setItem(ACTIVE_KEY, batch.id); setActiveId(batch.id) }}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                batch.id === activeId ? 'bg-[#1e3a5f] text-white border-[#1e3a5f]' : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
              }`}
            >
              {new Date(batch.processedAt).toLocaleDateString('vi-VN')}
            </button>
          ))}
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
        <button type="button" onClick={() => { setActiveId(null); setBatches(readBatches()) }} className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm hover:border-blue-400 text-gray-600">
          <Upload size={14} /> Xử lý chuyến mới
        </button>
        <button type="button" onClick={() => setEditing(v => !v)} className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm hover:border-blue-400 text-gray-600">
          <Pencil size={14} /> {editing ? 'Đang sửa' : 'Chỉnh sửa'}
        </button>
        {editing && (
          <button type="button" onClick={saveEdits} className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm">
            <Save size={14} /> Lưu chỉnh sửa
          </button>
        )}
        {editing && (
          <>
            <button type="button" onClick={() => addRow('C')} className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm hover:border-blue-400 text-gray-600">
              <Plus size={14} /> Thêm dòng Kho C
            </button>
            <button type="button" onClick={() => addRow('LGT')} className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm hover:border-blue-400 text-gray-600">
              <Plus size={14} /> Thêm dòng Kho LGT
            </button>
          </>
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
            {active.warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
          <p className="text-xs text-amber-700 mt-2">Kiểm tra và sửa trực tiếp bằng nút "Chỉnh sửa" ở trên nếu cần.</p>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center gap-2 mb-3">
          <FileText size={16} className="text-gray-500" />
          <h3 className="font-semibold text-sm">Biên bản giao nhận</h3>
          <span className="text-xs text-gray-400">dùng để đối chiếu SL thực tế + tổng kiện — đã tải lên lúc xử lý</span>
        </div>
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
      />
      <ReceiptTable
        title="Kho LGT"
        rows={active.khoLgt || []}
        editing={editing}
        onRowChange={(i, f, v) => patchRows('LGT', i, f, v)}
        onRemoveRow={(i) => removeRow('LGT', i)}
      />

      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center gap-2 mb-3">
          <History size={16} className="text-gray-500" />
          <h3 className="font-semibold text-sm">Tra cứu lịch sử theo Mã hàng</h3>
        </div>
        <div className="flex gap-2 mb-3">
          <div className="relative flex-1 max-w-sm">
            <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={historyQuery}
              onChange={(e) => setHistoryQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void searchHistory()}
              placeholder="Nhập mã hàng..."
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
