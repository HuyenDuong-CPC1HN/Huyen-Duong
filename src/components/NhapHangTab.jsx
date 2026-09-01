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
  const [dragging, setDragging] = useState(false)
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

  const uploadRef = useRef(null)
  const [pendingFiles, setPendingFiles] = useState({ pdf: null, excelC: null, excelLgt: null })

  const active = batches.find(batch => batch.id === activeId) || null

  const canProcess = pendingFiles.pdf && pendingFiles.excelC

  const assignFile = (kind, file) => {
    if (!file) return
    const ext = file.name.split('.').pop().toLowerCase()
    if (kind === 'pdf' && ext !== 'pdf') { setError('File biên bản giao nhận phải là PDF.'); return }
    if (kind !== 'pdf' && !['xlsx', 'xls'].includes(ext)) { setError('File Excel kho phải là .xlsx hoặc .xls.'); return }
    setError('')
    setPendingFiles(current => ({ ...current, [kind]: file }))
  }

  const processFiles = async () => {
    if (!canProcess) return
    setProcessing(true)
    setError('')
    try {
      const [pdfBuffer, excelCBuffer, excelLgtBuffer] = await Promise.all([
        pendingFiles.pdf.arrayBuffer(),
        pendingFiles.excelC.arrayBuffer(),
        pendingFiles.excelLgt ? pendingFiles.excelLgt.arrayBuffer() : Promise.resolve(null),
      ])
      const pdfText = await extractPdfText(pdfBuffer)
      const pdfMetadata = parsePdfMetadata(pdfText)
      const { khoC, khoLgt } = buildReceiptFromFiles({
        excelCBuffer,
        excelLgtBuffer: excelLgtBuffer || undefined,
        pdfText,
        sharedExcelForBoth: !pendingFiles.excelLgt,
      })
      const usedSharedExcel = !pendingFiles.excelLgt
      const entry = addBatch({
        id: String(Date.now()),
        processedAt: new Date().toISOString(),
        pdfFileName: pendingFiles.pdf.name,
        excelCFileName: pendingFiles.excelC.name,
        excelLgtFileName: pendingFiles.excelLgt?.name || (usedSharedExcel ? pendingFiles.excelC.name : null),
        usedSharedExcel,
        pdfMetadata,
        khoC,
        khoLgt,
      })
      setBatches(readBatches())
      setActiveId(entry.id)
      setPendingFiles({ pdf: null, excelC: null, excelLgt: null })
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
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false) }}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            for (const file of e.dataTransfer.files) {
              const ext = file.name.split('.').pop().toLowerCase()
              if (ext === 'pdf') assignFile('pdf', file)
              else if (ext === 'xlsx' || ext === 'xls') {
                if (!pendingFiles.excelC) assignFile('excelC', file)
                else assignFile('excelLgt', file)
              }
            }
          }}
          className={`flex flex-col items-center justify-center gap-3 w-full min-h-56 rounded-2xl border-2 border-dashed cursor-pointer transition-all select-none p-6
            ${dragging ? 'border-blue-500 bg-blue-50 scale-[1.01]' : 'border-gray-300 bg-white hover:border-blue-400 hover:bg-blue-50/30'}`}
        >
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${dragging ? 'bg-blue-100' : 'bg-gray-100'}`}>
            {dragging ? <FileUp size={24} className="text-blue-500" /> : <PackagePlus size={24} className="text-gray-400" />}
          </div>
          <div className="text-center max-w-xl">
            <p className="text-gray-700 font-semibold text-sm">Upload PDF biên bản giao nhận + Excel xuất kho (Kho C)</p>
            <p className="text-gray-400 text-xs mt-1">Nếu chưa có Excel riêng cho Kho LGT, app sẽ dùng chung file Kho C — anh chỉnh lại số liệu Kho LGT sau nếu cần.</p>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-3">
          {[
            { key: 'pdf', label: 'PDF biên bản giao nhận', icon: FileText, file: pendingFiles.pdf },
            { key: 'excelC', label: 'Excel xuất kho (Kho C)', icon: FileSpreadsheet, file: pendingFiles.excelC, required: true },
            { key: 'excelLgt', label: 'Excel xuất kho (Kho LGT — tuỳ chọn)', icon: FileSpreadsheet, file: pendingFiles.excelLgt, required: false },
          ].map(({ key, label, icon: Icon, file, required }) => (
            <label key={key} className="flex items-center gap-2 p-3 border border-gray-200 rounded-xl cursor-pointer hover:border-blue-300 bg-white">
              <Icon size={18} className="text-gray-500" />
              <div className="min-w-0 flex-1">
                <div className="text-xs font-medium text-gray-700">{label}{required ? ' *' : ''}</div>
                <div className="text-xs text-gray-400 truncate">{file?.name || 'Chưa chọn file'}</div>
              </div>
              <input
                type="file"
                className="hidden"
                accept={key === 'pdf' ? '.pdf' : '.xlsx,.xls'}
                onChange={(e) => assignFile(key, e.target.files?.[0])}
              />
            </label>
          ))}
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

        {error && <p className="text-sm text-red-500">{error}</p>}
        <input ref={uploadRef} type="file" className="hidden" />
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
        <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-sm">
          <FileSpreadsheet size={15} className="text-green-600" />
          <span className="text-green-700 font-medium truncate max-w-48">{active.excelCFileName}</span>
          <span className="text-green-500 text-xs">+ {active.excelLgtFileName || active.excelCFileName}</span>
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

      {!active.excelLgtFileName && active.usedSharedExcel && (
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
