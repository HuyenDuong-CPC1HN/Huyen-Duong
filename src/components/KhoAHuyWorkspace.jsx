import { useRef, useState } from 'react'
import { ArrowLeft, FileUp, FileDown, Check, CheckCircle, Loader2, Plus, Trash2 } from 'lucide-react'
import { extractPdfText } from '../utils/parseGoodsReceipt'
import { parsePhieuXuatKhoHangHuyPdf, parsePhieuXuatKhoNgayLap } from '../utils/parsePhieuXuatKhoHangHuy'
import { exportDamagedGoodsKhoAXuLy, exportDamagedGoodsKhoAXacMinh } from '../utils/exportDamagedGoods'
import { KhoAXuLyPaper, KhoAXacMinhPaper } from './KhoAHuyPapers'
import PreviewPrintPanel from './PreviewPrintPanel'
import { KHO_A_STATUS } from './khoAHuyStatus'
import { Field, Step } from './WorkspaceParts'
import { handCls, presetCls, grid, wrapStyle } from './workspaceStyles'

const fmtDate = iso => { const [y, m, d] = String(iso || '').split('-'); return d ? `${d}/${m}/${y}` : '' }
const EMPTY_ITEM = { maHang: '', tenHang: '', soLo: '', hanDung: '', dvt: '', soLuong: null, quyCach: '', ghiChu: 'Hàng cận date' }

// Màn làm hồ sơ huỷ Kho A cho kế toán (giống màn làm biên bản ở Theo dõi nhập trả lại): tải phiếu xuất kho PDF →
// kiểm tra/sửa hàng huỷ → điền ngày giờ → xem trước 2 biên bản và in ngay. Xuất file Excel/Word chỉ khi cần.
export default function KhoAHuyWorkspace({ record, onChange, onBack }) {
  const inputRef = useRef(null)
  const [parsing, setParsing] = useState(false)
  const [error, setError] = useState('')
  const [exporting, setExporting] = useState('')
  const f = record.form || {}
  const items = record.items || []

  const setForm = (k, v) => onChange({ ...record, form: { ...f, [k]: v } })
  const setItem = (i, k, v) => onChange({ ...record, items: items.map((it, idx) => (idx === i ? { ...it, [k]: v } : it)) })
  const removeItem = (i) => {
    if (!window.confirm(`Bỏ dòng "${items[i].tenHang || items[i].maHang}" khỏi biên bản?`)) return
    onChange({ ...record, items: items.filter((_, idx) => idx !== i) })
  }

  const readPdf = async (file) => {
    if (!file) return
    if (items.length > 0 && !window.confirm('Đọc phiếu mới sẽ thay danh sách hàng đang có. Tiếp tục?')) return
    setParsing(true)
    setError('')
    try {
      const text = await extractPdfText(await file.arrayBuffer())
      const rows = parsePhieuXuatKhoHangHuyPdf(text)
      if (rows.length === 0) setError('Không đọc được dòng hàng nào từ file này — kiểm tra lại file hoặc thêm dòng tay.')
      const ngayLap = parsePhieuXuatKhoNgayLap(text) || f.ngayLap
      onChange({
        ...record,
        sourceFileName: file.name,
        items: rows.map(r => ({ ...EMPTY_ITEM, maHang: r.maHang, tenHang: r.tenHang, soLo: r.soLo, hanDung: r.hanDung, dvt: r.dvt, soLuong: r.soLuong })),
        form: { ...f, ngayLap, xlNgay: f.xlNgay || ngayLap, xmNgay: f.xmNgay || ngayLap },
      })
    } catch (err) {
      setError(err.message || 'Đọc file PDF thất bại.')
    } finally {
      setParsing(false)
    }
  }

  const exportFile = async (kind) => {
    setError('')
    setExporting(kind)
    try {
      if (kind === 'xuLy') await exportDamagedGoodsKhoAXuLy(record)
      else await exportDamagedGoodsKhoAXacMinh(record)
    } catch (err) {
      setError(err.message || 'Xuất file thất bại.')
    } finally {
      setExporting('')
    }
  }

  const status = KHO_A_STATUS[record.status] || KHO_A_STATUS.draft

  return (
    <div className="sheet-tab">
      <div className="sheet-tab-shell flex flex-col gap-3">
        <header className="sheet-tab-context flex-wrap gap-2">
          <button type="button" onClick={onBack} className="sheet-tab-action"><ArrowLeft size={13} /> Danh sách hồ sơ</button>
          <span className="text-sm font-semibold">Hồ sơ huỷ Kho A · ngày lập {fmtDate(f.ngayLap) || '—'}</span>
          <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${status.cls}`}>{status.label}</span>
        </header>
        {error && <p className="text-sm text-red-500">{error}</p>}

        <div className="grid gap-4 items-start" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))' }}>
          <div className="rounded-xl border border-gray-200 bg-white">
            <Step n={1} title="Phiếu xuất kho (PDF)">
              <button type="button" onClick={() => inputRef.current?.click()} disabled={parsing}
                className="flex items-center justify-center gap-2 w-full min-h-16 rounded-xl border-2 border-dashed border-gray-300 hover:border-blue-400 hover:bg-blue-50/30 text-sm text-gray-600">
                {parsing ? <Loader2 size={16} className="animate-spin" /> : <FileUp size={16} />}
                {parsing ? 'Đang đọc file…' : (record.sourceFileName ? 'Tải lại phiếu xuất kho khác' : 'Tải phiếu xuất kho (PDF) — app tự điền danh sách hàng')}
              </button>
              <input ref={inputRef} type="file" accept=".pdf" className="hidden" aria-label="Tải phiếu xuất kho" onChange={e => { void readPdf(e.target.files[0]); e.target.value = '' }} />
              {record.sourceFileName && (
                <div className="flex items-start gap-2 rounded-lg px-3 py-2 text-sm bg-green-50 text-green-800">
                  <CheckCircle size={16} className="shrink-0 mt-0.5" />
                  <span>Đã đọc <b>{record.sourceFileName}</b> · {items.length} mặt hàng</span>
                </div>
              )}
            </Step>

            <Step n={2} title="Hàng huỷ">
              <span className="text-xs text-gray-400">Lấy từ phiếu xuất kho, sửa được. Ô vàng là phần kho điền (Quy cách). Ghi chú mặc định "Hàng cận date".</span>
              <div style={{ overflowX: 'auto' }}>
                <table className="w-full text-xs">
                  <thead><tr className="text-gray-500">{['Hàng hoá', 'Lô · Hạn dùng', 'SL', 'Quy cách', 'Ghi chú', ''].map(h => <th key={h} className="px-1.5 py-1.5 text-left font-semibold">{h}</th>)}</tr></thead>
                  <tbody>
                    {items.map((it, i) => (
                      <tr key={i} className="border-t border-gray-100 align-top">
                        <td className="px-1.5 py-1.5" style={{ minWidth: 170 }}>
                          <input value={it.maHang} onChange={e => setItem(i, 'maHang', e.target.value)} className={`${presetCls} font-mono mb-1`} placeholder="Mã" aria-label={`Mã hàng dòng ${i + 1}`} />
                          <textarea rows={2} value={it.tenHang} onChange={e => setItem(i, 'tenHang', e.target.value)} className={presetCls} style={wrapStyle} placeholder="Tên hàng" aria-label={`Tên hàng dòng ${i + 1}`} />
                        </td>
                        <td className="px-1.5 py-1.5" style={{ minWidth: 120 }}>
                          <input value={it.soLo} onChange={e => setItem(i, 'soLo', e.target.value)} className={`${presetCls} mb-1`} placeholder="Số lô" aria-label={`Số lô dòng ${i + 1}`} />
                          <input type="date" value={it.hanDung || ''} onChange={e => setItem(i, 'hanDung', e.target.value)} className={presetCls} aria-label={`Hạn dùng dòng ${i + 1}`} />
                        </td>
                        <td className="px-1.5 py-1.5" style={{ minWidth: 90 }}>
                          <input type="number" min="0" value={it.soLuong ?? ''} onChange={e => setItem(i, 'soLuong', e.target.value === '' ? null : Number(e.target.value))}
                            className={it.soLuong === null || it.soLuong === '' ? 'w-full px-2 py-1.5 border rounded-lg text-sm bg-red-50 border-red-400 text-red-800 mb-1' : `${presetCls} mb-1`} aria-label={`Số lượng dòng ${i + 1}`} />
                          <input value={it.dvt} onChange={e => setItem(i, 'dvt', e.target.value)} className={presetCls} placeholder="ĐVT" aria-label={`Đơn vị tính dòng ${i + 1}`} />
                        </td>
                        <td className="px-1.5 py-1.5" style={{ minWidth: 110 }}><textarea rows={2} value={it.quyCach || ''} onChange={e => setItem(i, 'quyCach', e.target.value)} className={handCls} style={wrapStyle} placeholder="VD: Hộp 10 lọ" aria-label={`Quy cách dòng ${i + 1}`} /></td>
                        <td className="px-1.5 py-1.5" style={{ minWidth: 120 }}><textarea rows={2} value={it.ghiChu ?? 'Hàng cận date'} onChange={e => setItem(i, 'ghiChu', e.target.value)} className={presetCls} style={wrapStyle} aria-label={`Ghi chú dòng ${i + 1}`} /></td>
                        <td className="px-1.5 py-1.5">
                          <button type="button" onClick={() => removeItem(i)} className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500" title="Bỏ dòng này" aria-label={`Xoá dòng ${i + 1}`}><Trash2 size={13} /></button>
                        </td>
                      </tr>
                    ))}
                    {items.length === 0 && <tr><td colSpan={6} className="text-center py-6 text-gray-400">Chưa có dòng nào — tải phiếu xuất kho ở bước 1 hoặc thêm dòng tay.</td></tr>}
                  </tbody>
                </table>
              </div>
              <button type="button" onClick={() => onChange({ ...record, items: [...items, { ...EMPTY_ITEM }] })} className="sheet-tab-action w-fit"><Plus size={13} /> Thêm dòng</button>
            </Step>

            <Step n={3} title="Biên bản xử lý sản phẩm">
              <div style={grid(170)}>
                <Field label="Số biên bản (…../năm/BC-CPC1HN)" kind="hand"><input value={f.soBB || ''} onChange={e => setForm('soBB', e.target.value)} className={handCls} /></Field>
                <Field label="Ngày lập biên bản" kind="hand"><input type="date" value={f.ngayLap || ''} onChange={e => setForm('ngayLap', e.target.value)} className={handCls} /></Field>
                <Field label="Ngày xử lý" kind="hand"><input type="date" value={f.xlNgay || ''} onChange={e => setForm('xlNgay', e.target.value)} className={handCls} /></Field>
                <Field label="Giờ xử lý" kind="hand"><input type="time" value={f.xlGio || ''} onChange={e => setForm('xlGio', e.target.value)} className={handCls} /></Field>
              </div>
              <span className="text-xs text-gray-400">Địa điểm xử lý: Kho 020110 · Phương pháp: Xuất xử lý (giữ như file mẫu).</span>
            </Step>

            <Step n={4} title="Biên bản xác minh tình trạng hàng hoá">
              <div style={grid(170)}>
                <Field label="Ngày xác minh" kind="hand"><input type="date" value={f.xmNgay || ''} onChange={e => setForm('xmNgay', e.target.value)} className={handCls} /></Field>
                <Field label="Giờ" kind="hand"><input type="time" value={f.xmGio || ''} onChange={e => setForm('xmGio', e.target.value)} className={handCls} /></Field>
              </div>
            </Step>

            <Step n={5} title="In / xuất file khi cần">
              <span className="text-xs text-gray-400">In thẳng ở khung Xem trước bên phải. Chỉ xuất file Excel/Word khi cần gửi file.</span>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => void exportFile('xuLy')} disabled={!!exporting || items.length === 0} className="sheet-tab-action">
                  <FileDown size={13} /> {exporting === 'xuLy' ? 'Đang tạo…' : 'Xuất BB xử lý (Excel)'}
                </button>
                <button type="button" onClick={() => void exportFile('xacMinh')} disabled={!!exporting || items.length === 0} className="sheet-tab-action">
                  <FileDown size={13} /> {exporting === 'xacMinh' ? 'Đang tạo…' : 'Xuất BB xác minh (Word)'}
                </button>
                <button type="button" onClick={() => onChange({ ...record, status: 'done', doneAt: new Date().toISOString() })}
                  disabled={record.status === 'done'} className="sheet-tab-action is-primary">
                  <Check size={13} /> Đã ký đủ, gửi kế toán
                </button>
              </div>
            </Step>
          </div>

          <PreviewPrintPanel docs={[
            { key: 'xuLy', label: 'Biên bản xử lý', landscape: false, node: <KhoAXuLyPaper record={record} /> },
            { key: 'xacMinh', label: 'Biên bản xác minh', landscape: true, node: <KhoAXacMinhPaper record={record} /> },
          ]} />
        </div>
      </div>
    </div>
  )
}
