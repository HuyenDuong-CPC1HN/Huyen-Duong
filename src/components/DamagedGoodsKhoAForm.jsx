import { useRef, useState } from 'react'
import { FileUp, FileText, X, Trash2, Loader2 } from 'lucide-react'
import { extractPdfText } from '../utils/parseGoodsReceipt'
import { parsePhieuXuatKhoHangHuyPdf, parsePhieuXuatKhoNgayLap } from '../utils/parsePhieuXuatKhoHangHuy'

// Kho A khác Kho C/Kho DTP: không nhập tay từng dòng mà upload thẳng file "Phiếu xuất kho" PDF (đã có sẵn
// toàn bộ dữ liệu), app tự đọc rồi cho xem lại/sửa trước khi lưu thành biên bản. Mỗi dòng map đúng theo yêu
// cầu: Mã sản phẩm=Mã vật tư, Tên hàng hoá=Tên vật tư, Số lô=Lô, Hạn dùng=Hạn dùng, Đơn vị tính=ĐVT, Số
// lượng theo chứng từ=Số lượng thực huỷ=Số lượng trên phiếu; "Kho" mặc định 020110 và "Tình trạng" cố định
// "Hàng cận date" không nằm trong bảng người dùng sửa - được điền cứng khi xuất (xem exportDamagedGoods.js).
const EMPTY_ITEM = { maHang: '', tenHang: '', soLo: '', hanDung: '', dvt: '', soLuong: '', quyCach: '' }

function parseVietnameseDate(val) {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(val).trim())
  if (!match) return null
  return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`
}
function toDisplayDate(iso) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  if (!y || !m || !d) return iso
  return `${d}/${m}/${y}`
}

function Field({ label, children, className = '' }) {
  return (
    <label className={`flex flex-col gap-1 text-sm ${className}`}>
      <span className="text-xs font-medium text-gray-500">{label}</span>
      {children}
    </label>
  )
}
const inputCls = 'px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400'

function DateCell({ value, onChange }) {
  const display = toDisplayDate(value)
  const [draft, setDraft] = useState(display)
  const [prevDisplay, setPrevDisplay] = useState(display)
  if (display !== prevDisplay) { setPrevDisplay(display); setDraft(display) }
  const handleChange = (e) => {
    const text = e.target.value
    setDraft(text)
    const parsed = parseVietnameseDate(text)
    if (parsed) onChange(parsed)
    else if (text.trim() === '') onChange('')
  }
  return (
    <input
      type="text"
      value={draft}
      onChange={handleChange}
      onBlur={() => setDraft(display)}
      placeholder="dd/mm/yyyy"
      className="w-full min-w-24 px-1.5 py-1 text-xs border border-transparent rounded hover:border-gray-300 focus:border-blue-400 focus:outline-none bg-transparent"
    />
  )
}

function ItemsPreviewTable({ rows, onChange }) {
  const columns = [
    { key: 'maHang', label: 'Mã sản phẩm' },
    { key: 'tenHang', label: 'Tên hàng hoá' },
    { key: 'soLo', label: 'Số lô' },
    { key: 'hanDung', label: 'Hạn dùng', date: true },
    { key: 'dvt', label: 'Đơn vị tính' },
    { key: 'soLuong', label: 'Số lượng', number: true },
    { key: 'quyCach', label: 'Quy cách (tự điền)' },
  ]
  const updateCell = (i, key, value) => onChange(rows.map((r, idx) => (idx === i ? { ...r, [key]: value } : r)))
  const removeRow = (i) => onChange(rows.filter((_, idx) => idx !== i))
  const addRow = () => onChange([...rows, { ...EMPTY_ITEM }])

  return (
    <div className="report-section">
      <div className="report-section-trigger" style={{ cursor: 'default' }}>
        <span className="report-section-title">Danh sách hàng huỷ (đọc từ phiếu xuất kho)</span>
        <button type="button" onClick={addRow} className="sheet-tab-action" style={{ minHeight: 28, padding: '0 10px' }}>
          Thêm dòng
        </button>
      </div>
      <div className="report-section-content" style={{ overflowX: 'auto' }}>
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              {columns.map(c => <th key={c.key} className="px-2 py-2 text-left text-gray-500 font-semibold whitespace-nowrap">{c.label}</th>)}
              <th className="px-2 py-2 w-8" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={columns.length + 1} className="px-2 py-4 text-center text-gray-400">Chưa có dòng nào — upload file phiếu xuất kho ở trên</td></tr>
            )}
            {rows.map((row, i) => (
              <tr key={i} className="border-b border-gray-50">
                {columns.map(c => (
                  <td key={c.key} className="px-1.5 py-1.5">
                    {c.date ? (
                      <DateCell value={row[c.key]} onChange={(v) => updateCell(i, c.key, v)} />
                    ) : (
                      <input
                        type={c.number ? 'number' : 'text'}
                        value={row[c.key] ?? ''}
                        onChange={e => updateCell(i, c.key, e.target.value)}
                        className="w-full min-w-24 px-1.5 py-1 text-xs border border-transparent rounded hover:border-gray-300 focus:border-blue-400 focus:outline-none bg-transparent"
                        placeholder={c.label}
                      />
                    )}
                  </td>
                ))}
                <td className="px-1.5 py-1.5">
                  <button type="button" onClick={() => removeRow(i)} className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500" title="Xoá dòng">
                    <Trash2 size={13} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function DamagedGoodsKhoAForm({ year, month, record, onSave, onCancel }) {
  const inputRef = useRef(null)
  const [dragging, setDragging] = useState(false)
  const [fileName, setFileName] = useState(record?.sourceFileName || '')
  const [parsing, setParsing] = useState(false)
  const [parseError, setParseError] = useState('')
  const [processedAt, setProcessedAt] = useState(record?.processedAt?.slice(0, 10) || new Date().toISOString().slice(0, 10))
  const [items, setItems] = useState(record?.items?.length ? record.items : [])

  const handleFile = async (file) => {
    if (!file) return
    setParsing(true)
    setParseError('')
    setFileName(file.name)
    try {
      const buffer = await file.arrayBuffer()
      const text = await extractPdfText(buffer)
      const rows = parsePhieuXuatKhoHangHuyPdf(text)
      if (rows.length === 0) {
        setParseError('Không đọc được dòng hàng nào từ file này — kiểm tra lại file hoặc thêm dòng thủ công bên dưới.')
      }
      setItems(rows.map(r => ({ maHang: r.maHang, tenHang: r.tenHang, soLo: r.soLo, hanDung: r.hanDung, dvt: r.dvt, soLuong: r.soLuong, quyCach: '' })))
      const ngayLap = parsePhieuXuatKhoNgayLap(text)
      if (ngayLap) setProcessedAt(ngayLap)
    } catch (err) {
      setParseError(err.message || 'Đọc file PDF thất bại.')
    } finally {
      setParsing(false)
    }
  }

  const handleAddFiles = (files) => { if (files[0]) handleFile(files[0]) }

  const handleSubmit = (e) => {
    e.preventDefault()
    const cleanItems = items.filter(it => Object.values(it).some(v => String(v || '').trim()))
    if (cleanItems.length === 0) return
    onSave({
      id: record?.id || `damaged_khoA_${Date.now()}`,
      entity: 'khoA',
      year, month,
      processedAt: processedAt ? new Date(processedAt).toISOString() : new Date().toISOString(),
      sourceFileName: fileName,
      status: record?.status || 'draft',
      createdAt: record?.createdAt || new Date().toISOString(),
      items: cleanItems,
    })
  }

  return (
    <div className="sheet-tab-shell">
      <header className="sheet-tab-context">
        <span>{record ? 'Sửa biên bản hàng huỷ — Kho A' : 'Thêm biên bản hàng huỷ — Kho A'} — Tháng {month}/{year}</span>
        <div className="flex items-center gap-2 ml-auto">
          <button type="button" onClick={onCancel} className="sheet-tab-action">
            <X size={13} /> Huỷ
          </button>
        </div>
      </header>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3" style={{ paddingTop: 12 }}>
        <div className="report-section">
          <div className="report-section-content" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
              onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false) }}
              onDrop={(e) => { e.preventDefault(); setDragging(false); handleAddFiles([...e.dataTransfer.files]) }}
              onClick={() => inputRef.current?.click()}
              className={`flex flex-col items-center justify-center gap-2 w-full min-h-28 rounded-xl border-2 border-dashed cursor-pointer transition-all select-none p-4
                ${dragging ? 'border-blue-500 bg-blue-50 scale-[1.01]' : 'border-gray-300 hover:border-blue-400 hover:bg-blue-50/30'}`}
            >
              {parsing ? <Loader2 size={20} className="text-blue-500 animate-spin" /> : <FileUp size={20} className={dragging ? 'text-blue-500' : 'text-gray-400'} />}
              <div className="text-center">
                <p className="text-sm font-semibold text-gray-700">{parsing ? 'Đang đọc file...' : 'Upload phiếu xuất kho (PDF)'}</p>
                <p className="text-xs text-gray-400 mt-0.5">Kéo thả hoặc bấm để chọn file — app sẽ tự điền bảng bên dưới</p>
              </div>
            </div>
            <input
              ref={inputRef}
              type="file"
              accept=".pdf"
              className="hidden"
              onChange={(e) => { handleAddFiles([...e.target.files]); e.target.value = '' }}
            />
            {fileName && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700 w-fit">
                <FileText size={12} />
                <span className="max-w-64 truncate" title={fileName}>{fileName}</span>
              </span>
            )}
            {parseError && <p className="text-xs text-red-500">{parseError}</p>}

            <Field label="Ngày lập biên bản *" className="max-w-56">
              <input required type="date" value={processedAt} onChange={e => setProcessedAt(e.target.value)} className={inputCls} />
            </Field>
          </div>
        </div>

        <ItemsPreviewTable rows={items} onChange={setItems} />

        <div className="flex items-center gap-2">
          <button type="submit" className="sheet-tab-action is-primary">Lưu biên bản</button>
          <button type="button" onClick={onCancel} className="sheet-tab-action">Huỷ</button>
        </div>
      </form>
    </div>
  )
}
