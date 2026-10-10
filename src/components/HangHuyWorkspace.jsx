import { useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, FileDown, Check, AlertTriangle, CheckCircle, Printer, Trash2, Plus, PencilLine } from 'lucide-react'
import { missingHuyFields, newHuyItem } from '../utils/hangHuy'
import { exportHangHuyPhieu } from '../utils/exportDamagedGoods'
import { KhoTag, HuyStagePill } from './HangHuyBadges'
import { XuLyPaper, XacMinhPaper } from './HangHuyPapers'
import { Field, Step } from './WorkspaceParts'
import { handCls, presetCls, grid, wrapStyle } from './workspaceStyles'

const fmtDate = iso => { const [y, m, d] = String(iso || '').split('-'); return d ? `${d}/${m}/${y}` : '' }

// Màn làm bộ biên bản cho 1 phiếu xuất kho hàng huỷ: kiểm tra dữ liệu đọc từ phiếu, điền phần kho tự điền
// (Tình trạng để trống cho kho diễn giải), xem trước + in, xuất Excel (xử lý) + Word (xác minh).
export default function HangHuyWorkspace({ phieu, onChange, onBack }) {
  const [doc, setDoc] = useState('xuLy')
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState('')
  const f = phieu.form
  const items = phieu.items || []

  const setForm = (k, v) => onChange({ ...phieu, form: { ...f, [k]: v } })
  const setItem = (i, k, v) => onChange({ ...phieu, items: items.map((it, idx) => (idx === i ? { ...it, [k]: v } : it)) })
  const setQty = (i, raw) => setItem(i, 'thucHuy', raw === '' ? null : Number(raw))
  const manual = Boolean(phieu.manual)
  const setPhieu = (k, v) => onChange({ ...phieu, [k]: v })
  // Thêm tay: "SL phiếu" gõ trực tiếp, Thực huỷ đi theo cho tới khi kho sửa riêng.
  const setSoLuong = (i, raw) => {
    const n = raw === '' ? null : Number(raw)
    onChange({ ...phieu, items: items.map((it, idx) => (idx === i ? { ...it, soLuong: n, thucHuy: it.thucHuy === it.soLuong ? n : it.thucHuy } : it)) })
  }
  const addItem = () => onChange({ ...phieu, items: [...items, newHuyItem()] })
  const removeItem = (i) => {
    const it = items[i]
    const blank = !it.maHang && !it.tenHang && !it.soLo
    if (!blank && !window.confirm(`Bỏ dòng "${it.tenHang || it.maHang}" khỏi bộ biên bản?${manual ? '' : ' Phiếu xuất kho gốc không bị ảnh hưởng.'}`)) return
    onChange({ ...phieu, items: items.filter((_, idx) => idx !== i) })
  }

  const exportDocs = async () => {
    setError('')
    setExporting(true)
    try {
      await exportHangHuyPhieu(phieu)
      if (phieu.stage !== 'done') onChange({ ...phieu, stage: 'exported', exportedAt: new Date().toISOString() })
    } catch (err) {
      setError(err.message || 'Xuất file thất bại.')
    } finally {
      setExporting(false)
    }
  }

  const noQty = items.filter(it => it.soLuong === null)
  const missing = missingHuyFields(phieu)
  const Paper = doc === 'xuLy' ? XuLyPaper : XacMinhPaper

  return (
    <div className="sheet-tab">
      <div className="sheet-tab-shell flex flex-col gap-3">
        <header className="sheet-tab-context flex-wrap gap-2">
          <button type="button" onClick={onBack} className="sheet-tab-action"><ArrowLeft size={13} /> Danh sách phiếu</button>
          <span className="font-mono text-xs">{phieu.soPhieu || (manual ? 'Phiếu thêm tay' : '')}</span>
          <HuyStagePill stage={phieu.stage} />
          <KhoTag kho={phieu.kho} />
        </header>
        {error && <p className="text-sm text-red-500">{error}</p>}

        <div className="grid gap-4 items-start" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))' }}>
          <div className="rounded-xl border border-gray-200 bg-white">
            <Step n={1} title={manual ? 'Thông tin phiếu xuất kho (thêm tay)' : 'Phiếu xuất kho đã tải lên'}>
              {manual ? (
                <>
                  <div className="flex items-start gap-2 rounded-lg px-3 py-2 text-sm bg-blue-50 text-blue-800">
                    <PencilLine size={16} className="shrink-0 mt-0.5" />
                    <span>Phiếu {phieu.kho === 'C' ? 'Kho C (CPC1HN)' : 'Kho DTP (UPHARMA)'} thêm tay, không có file PDF. Gõ thông tin phiếu và từng dòng hàng ở bước 2.</span>
                  </div>
                  <div style={grid(170)}>
                    <Field label="Số phiếu xuất kho" kind="hand"><input value={phieu.soPhieu} onChange={e => setPhieu('soPhieu', e.target.value)} className={handCls} placeholder={phieu.kho === 'C' ? 'VD: XT2621/00810' : 'VD: XK2621/00104'} aria-label="Số phiếu xuất kho" /></Field>
                    <Field label="Ngày phiếu" kind="hand"><input type="date" value={phieu.ngayPhieu || ''} onChange={e => setPhieu('ngayPhieu', e.target.value)} className={handCls} aria-label="Ngày phiếu" /></Field>
                    <Field label="Kho xuất" kind="preset"><input value={phieu.khoXuat} onChange={e => setPhieu('khoXuat', e.target.value)} className={presetCls} aria-label="Kho xuất" /></Field>
                    <Field label="Lý do xuất kho" kind="hand"><input value={phieu.lyDo} onChange={e => setPhieu('lyDo', e.target.value)} className={handCls} placeholder="VD: Xuất huỷ hàng lỗi" aria-label="Lý do xuất kho" /></Field>
                  </div>
                </>
              ) : (<>
              <div className="flex items-start gap-2 rounded-lg px-3 py-2 text-sm bg-green-50 text-green-800">
                <CheckCircle size={16} className="shrink-0 mt-0.5" />
                <span>
                  Đã đọc <b>{phieu.fileName}</b> · {phieu.kho === 'C' ? 'CPC1HN' : 'UPHARMA'} · phiếu <b>{phieu.soPhieu}</b> ngày {fmtDate(phieu.ngayPhieu)} · xuất tại kho {phieu.khoXuat}
                  {phieu.lyDo && <> · lý do: {phieu.lyDo}</>}
                </span>
              </div>
              {noQty.length > 0 && (
                <div className="flex items-start gap-2 rounded-lg px-3 py-2 text-sm bg-amber-50 text-amber-800">
                  <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                  <span>Không đọc được số lượng của <b>{noQty.map(it => it.tenHang).join(', ')}</b> trên phiếu. Nhập tay ở ô "Thực huỷ" bên dưới (ô đỏ).</span>
                </div>
              )}
              </>)}
            </Step>

            <Step n={2} title="Hàng huỷ">
              {manual
                ? <span className="text-xs text-gray-400">Gõ mã hàng, tên hàng, số lô, hạn dùng, ĐVT và số lượng cho từng dòng; bấm <b>Thêm dòng</b> để thêm hàng. <b>Tình trạng</b> dùng cho cả cột Ghi chú (biên bản xử lý) lẫn cột Tình trạng (biên bản xác minh).</span>
                : <span className="text-xs text-gray-400">Chữ xám lấy từ phiếu. Ô vàng là phần kho điền. <b>Tình trạng</b> để trống cho anh diễn giải hàng thực tế, dùng cho cả cột Ghi chú (biên bản xử lý) lẫn cột Tình trạng (biên bản xác minh).</span>}
              <div style={{ overflowX: 'auto' }}>
                <table className="w-full text-xs">
                  <thead><tr className="text-gray-500">{['Hàng hoá', 'Lô · Hạn dùng', manual ? 'SL · ĐVT' : 'SL phiếu', 'Thực huỷ', 'Quy cách', 'Tình trạng', ''].map(h => <th key={h} className="px-1.5 py-1.5 text-left font-semibold">{h}</th>)}</tr></thead>
                  <tbody>
                    {items.map((it, i) => (
                      <tr key={`${it.maHang}-${it.soLo}-${i}`} className="border-t border-gray-100 align-top">
                        {manual ? (<>
                          <td className="px-1.5 py-1.5" style={{ minWidth: 170 }}>
                            <input value={it.maHang} onChange={e => setItem(i, 'maHang', e.target.value)} className={handCls} placeholder="Mã hàng" aria-label={`Mã hàng dòng ${i + 1}`} />
                            <textarea rows={2} value={it.tenHang} onChange={e => setItem(i, 'tenHang', e.target.value)} className={`${handCls} mt-1`} style={wrapStyle} placeholder="Tên hàng" aria-label={`Tên hàng dòng ${i + 1}`} />
                          </td>
                          <td className="px-1.5 py-1.5" style={{ minWidth: 130 }}>
                            <input value={it.soLo} onChange={e => setItem(i, 'soLo', e.target.value)} className={handCls} placeholder="Số lô" aria-label={`Số lô dòng ${i + 1}`} />
                            <input type="date" value={it.hanDung || ''} onChange={e => setItem(i, 'hanDung', e.target.value)} className={`${handCls} mt-1`} aria-label={`Hạn dùng dòng ${i + 1}`} />
                          </td>
                          <td className="px-1.5 py-1.5" style={{ minWidth: 90 }}>
                            <input type="number" min="0" value={it.soLuong ?? ''} onChange={e => setSoLuong(i, e.target.value)} className={handCls} placeholder="SL" aria-label={`Số lượng dòng ${i + 1}`} />
                            <input value={it.dvt} onChange={e => setItem(i, 'dvt', e.target.value)} className={`${handCls} mt-1`} placeholder="ĐVT" aria-label={`ĐVT dòng ${i + 1}`} />
                          </td>
                        </>) : (<>
                        <td className="px-1.5 py-1.5"><span className="font-mono">{it.maHang}</span><br />{it.tenHang}</td>
                        <td className="px-1.5 py-1.5 whitespace-nowrap">{it.soLo}<br /><span className="text-gray-400">{fmtDate(it.hanDung)}</span></td>
                        <td className="px-1.5 py-1.5 whitespace-nowrap">{it.soLuong === null ? <span className="px-1.5 py-0.5 rounded-full bg-red-50 text-red-700 font-semibold">không có</span> : `${it.soLuong} ${it.dvt}`}</td>
                        </>)}
                        <td className="px-1.5 py-1.5" style={{ minWidth: 76 }}>
                          <input type="number" min="0" value={it.thucHuy ?? ''} onChange={e => setQty(i, e.target.value)} aria-label={`Thực huỷ ${it.maHang || `dòng ${i + 1}`}`}
                            className={it.thucHuy === null || it.thucHuy === '' ? 'w-full px-2 py-1.5 border rounded-lg text-sm bg-red-50 border-red-400 text-red-800' : handCls} />
                        </td>
                        <td className="px-1.5 py-1.5" style={{ minWidth: 110 }}><textarea rows={2} value={it.quyCach} onChange={e => setItem(i, 'quyCach', e.target.value)} className={handCls} style={wrapStyle} placeholder="VD: Hộp 20 ống" aria-label={`Quy cách ${it.maHang}`} /></td>
                        <td className="px-1.5 py-1.5" style={{ minWidth: 180 }}><textarea rows={2} value={it.tinhTrang} onChange={e => setItem(i, 'tinhTrang', e.target.value)} className={handCls} style={wrapStyle} placeholder="VD: Hàng gãy, vỡ ống" aria-label={`Tình trạng ${it.maHang}`} /></td>
                        <td className="px-1.5 py-1.5">
                          <button type="button" onClick={() => removeItem(i)} className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500" title="Bỏ dòng này khỏi bộ biên bản" aria-label={`Xoá dòng ${it.maHang}`}><Trash2 size={13} /></button>
                        </td>
                      </tr>
                    ))}
                    {items.length === 0 && <tr><td colSpan={7} className="text-center py-6 text-gray-400">{manual ? 'Chưa có dòng hàng nào. Bấm "Thêm dòng" để thêm.' : 'Đã xoá hết dòng hàng, không còn gì để lập biên bản.'}</td></tr>}
                  </tbody>
                </table>
              </div>
              {manual && (
                <button type="button" onClick={addItem} className="sheet-tab-action self-start"><Plus size={13} /> Thêm dòng</button>
              )}
            </Step>

            <Step n={3} title="Biên bản xử lý sản phẩm (Excel)">
              <div style={grid(170)}>
                <Field label="Số biên bản (…../2026/BC-CPC1HN)" kind="preset"><input value={f.soBB} onChange={e => setForm('soBB', e.target.value)} className={presetCls} /></Field>
                <Field label="Ngày lập biên bản" kind="hand"><input type="date" value={f.ngayLap} onChange={e => setForm('ngayLap', e.target.value)} className={handCls} /></Field>
                <Field label="Ngày xử lý" kind="hand"><input type="date" value={f.xlNgay} onChange={e => setForm('xlNgay', e.target.value)} className={handCls} /></Field>
                <Field label="Giờ xử lý" kind="hand"><input type="time" value={f.xlGio} onChange={e => setForm('xlGio', e.target.value)} className={handCls} /></Field>
                <Field label="Địa điểm xử lý" kind="preset"><input value={f.diaDiem} onChange={e => setForm('diaDiem', e.target.value)} className={presetCls} /></Field>
                <Field label="Phương pháp xử lý" kind="preset"><input value={f.phuongPhap} onChange={e => setForm('phuongPhap', e.target.value)} className={presetCls} /></Field>
              </div>
              <span className="text-xs text-gray-400">Số biên bản app gợi ý theo số kế tiếp trong năm, sửa được nếu khác. Dòng "Căn cứ : Quyết định số" giữ nguyên như file mẫu.</span>
            </Step>

            <Step n={4} title="Biên bản xác minh tình trạng hàng hoá (Word)">
              <div style={grid(170)}>
                <Field label="Ngày xác minh" kind="hand"><input type="date" value={f.xmNgay} onChange={e => setForm('xmNgay', e.target.value)} className={handCls} /></Field>
                <Field label="Giờ" kind="hand"><input type="time" value={f.xmGio} onChange={e => setForm('xmGio', e.target.value)} className={handCls} /></Field>
              </div>
              <span className="text-xs text-gray-400">Căn cứ, địa điểm, kết quả xác minh và Thành phần giữ đúng chữ trong file mẫu Word của từng kho.</span>
            </Step>

            <Step n={5} title="Xuất bộ file">
              {missing.length > 0
                ? <div className="rounded-lg bg-amber-50 text-amber-800 px-3 py-2 text-sm">Còn thiếu: {missing.join(', ')}. Vẫn xuất được, chỗ thiếu để trống trong file để anh điền sau.</div>
                : <div className="rounded-lg bg-green-50 text-green-800 px-3 py-2 text-sm">Đã điền đủ các chỗ trống.</div>}
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => void exportDocs()} disabled={exporting || items.length === 0} className="sheet-tab-action is-primary">
                  <FileDown size={13} /> {exporting ? 'Đang tạo file…' : 'Xuất BB xử lý (Excel) + BB xác minh (Word)'}
                </button>
                <button type="button" onClick={() => onChange({ ...phieu, stage: 'done', doneAt: new Date().toISOString() })}
                  disabled={phieu.stage === 'done'} className="sheet-tab-action">
                  <Check size={13} /> Đã ký đủ, huỷ xong
                </button>
              </div>
            </Step>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white sticky top-3">
            <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-gray-100">
              <span className="font-semibold text-sm text-gray-800">Xem trước</span>
              {[['xuLy', 'Biên bản xử lý'], ['xacMinh', 'Biên bản xác minh']].map(([k, label]) => (
                <button key={k} type="button" onClick={() => setDoc(k)} aria-pressed={doc === k}
                  className={`px-2.5 py-1 rounded-md text-xs border ${doc === k ? 'border-[#1e3a5f] text-[#1e3a5f] font-semibold' : 'border-gray-200 text-gray-500'}`}>{label}</button>
              ))}
              <button type="button" onClick={() => window.print()} className="ml-auto px-2.5 py-1 rounded-md text-xs border border-gray-200 text-gray-600 hover:border-blue-400 hover:text-blue-600 flex items-center gap-1"
                title="In trực tiếp đúng biên bản đang xem (mở hộp thoại in của trình duyệt)">
                <Printer size={12} /> In
              </button>
              <span className="w-full text-[11px] text-amber-700" data-testid="print-hint">
                Khi in: mục <b>Layout</b> chọn <b>{doc === 'xacMinh' ? 'Landscape (ngang)' : 'Portrait (dọc)'}</b>, <b>Pages per sheet</b> chọn <b>1</b>.
              </span>
              <span className="w-full text-[11px] text-gray-400">
                <span className="bg-yellow-100 border-b-2 border-yellow-500 px-1">vàng</span> kho điền trên app ·{' '}
                <span className="bg-red-50 text-red-700 px-1">đỏ</span> còn thiếu · chữ thường lấy từ phiếu xuất kho hoặc file mẫu
              </span>
            </div>
            <div className="bg-gray-100 p-4 rounded-b-xl" style={{ overflowX: 'auto' }}><Paper phieu={phieu} /></div>
          </div>
        </div>
      </div>

      {/* Portal thẳng ra <body> chỉ để in (xem .rsw-print-root trong index.css): bấm "In" là in đúng biên bản đang xem. */}
      {createPortal(<div className="rsw-print-root"><Paper phieu={phieu} /></div>, document.body)}
    </div>
  )
}
