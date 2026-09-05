import { useMemo, useRef, useState } from 'react'
import {
  Upload, FileUp, FileSpreadsheet, X, Download, Search, PackagePlus,
  Pencil, Save, History, FileText,
} from 'lucide-react'
import { opsStore as localStorage } from '../data/workspace'
import {
  buildReceiptFromFiles,
  calcChenhLech,
  extractPdfText,
  parsePdfMetadata,
  readWarehouseExportRows,
} from '../utils/parseGoodsReceipt'
import { exportReceiptFromTemplate, loadReceiptTemplate } from '../utils/exportGoodsReceipt'

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
function FileZone({ label, hint, files, onAddFiles, onRemoveFile }) {
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
        accept=".xlsx,.xls,.pdf"
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

function ReceiptTableRow({ row, index, editing, onRowChange }) {
  const chenh = calcChenhLech(row)
  const highlight = row.needsManual || !row.hanDung

  return (
    <tr className={highlight ? 'bg-amber-50/70' : 'border-t border-gray-50'}>
      <td className="px-2 py-1.5 text-gray-500">{index + 1}</td>
      <td className="px-2 py-1.5 font-medium">{row.maHang}</td>
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
      <td className="px-2 py-1.5 text-right">{row.slHoaDon}</td>
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
    </tr>
  )
}

function ReceiptTable({ title, rows, editing, onRowChange }) {
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
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <ReceiptTableRow
                key={`${row.maHang}-${row.soLo}-${index}`}
                row={row}
                index={index}
                editing={editing}
                onRowChange={onRowChange}
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
  const [activeId, setActiveId] = useState(() => {
    const saved = localStorage.getItem(ACTIVE_KEY)
    const all = readBatches()
    if (all.some(batch => batch.id === saved)) return saved
    return all[0]?.id || null
  })

  const [pendingFiles, setPendingFiles] = useState({ khoC: [], khoLgt: [] })

  const active = batches.find(batch => batch.id === activeId) || null

  const canProcess = pendingFiles.khoC.some(isExcelFile)

  const addFiles = (warehouse, incoming) => {
    const valid = incoming.filter(isSupportedFile)
    setError(valid.length < incoming.length ? 'Chỉ nhận file .xlsx, .xls hoặc .pdf — các file khác đã bị bỏ qua.' : '')
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

  const readPdfTextsFromFiles = async (files, fileErrors) => {
    const results = await Promise.allSettled(files.map(async file => extractPdfText(await file.arrayBuffer())))
    const texts = []
    results.forEach((res, i) => {
      if (res.status === 'fulfilled') texts.push(res.value)
      else fileErrors.push(`${files[i].name}: ${res.reason?.message || 'không đọc được file'}`)
    })
    return texts
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
      const usedSharedExcel = khoLgtExcelFilesRaw.length === 0

      const fileErrors = []
      const khoCRows = await readWarehouseRowsFromFiles(khoCExcelFiles, fileErrors)
      const khoLgtRows = usedSharedExcel ? khoCRows : await readWarehouseRowsFromFiles(khoLgtExcelFilesRaw, fileErrors)
      const pdfTexts = await readPdfTextsFromFiles([...khoCPdfFiles, ...khoLgtPdfFiles], fileErrors)

      const pdfMetadata = parsePdfMetadata(pdfTexts[0] || '')
      const { khoC, khoLgt } = buildReceiptFromFiles({ khoCRows, khoLgtRows, pdfTexts })

      const entry = addBatch({
        id: String(Date.now()),
        processedAt: new Date().toISOString(),
        khoCFileNames: pendingFiles.khoC.map(f => f.name),
        khoLgtFileNames: pendingFiles.khoLgt.map(f => f.name),
        usedSharedExcel,
        pdfMetadata,
        khoC,
        khoLgt,
      })
      setBatches(readBatches())
      setActiveId(entry.id)
      setPendingFiles({ khoC: [], khoLgt: [] })
      setEditing(false)
      if (fileErrors.length > 0) setError(`Một số file không đọc được, các file còn lại vẫn xử lý bình thường:\n${fileErrors.join('\n')}`)
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
      const templateBuffer = await loadReceiptTemplate()
      await exportReceiptFromTemplate({
        templateBuffer,
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
            Mỗi kho vật lý có thể nhận nhiều file (nhiều phiếu xuất kho + PDF nếu có) — thả tất cả file của kho nào vào đúng vùng của kho đó.
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

      <ReceiptTable title="Kho C" rows={active.khoC || []} editing={editing} onRowChange={(i, f, v) => patchRows('C', i, f, v)} />
      <ReceiptTable title="Kho LGT" rows={active.khoLgt || []} editing={editing} onRowChange={(i, f, v) => patchRows('LGT', i, f, v)} />

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
