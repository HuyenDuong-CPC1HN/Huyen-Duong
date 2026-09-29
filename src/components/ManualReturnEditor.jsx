import { Plus, Trash2 } from 'lucide-react'
import { emptyManualItem, recalcManualPdf, switchManualMau, TEMPLATE_LABEL } from '../utils/returnSlips'
import { Field, Step } from './WorkspaceParts'
import { handCls, presetCls, grid } from './workspaceStyles'

const money = n => (Number(n) || 0).toLocaleString('en-US')

// Phần nhập tay của đơn không có PDF website: bên mua, bên bán, lý do và các dòng hàng. Mỗi lần sửa dựng lại
// thành tiền / tổng tiền / số tiền bằng chữ (recalcManualPdf) và giữ form.items (số lô, hạn dùng, quy cách) khớp
// số dòng hàng.
export default function ManualReturnEditor({ n, slip, onChange }) {
  const { pdf, form: f } = slip
  const noiBo = pdf.mau === 'NOIBO'

  const commit = (nextPdf, formItems = f.items) => {
    const recalced = recalcManualPdf(nextPdf)
    onChange({ ...slip, pdf: recalced, form: { ...f, items: formItems } })
  }
  const setMau = (mau) => commit(switchManualMau(pdf, mau))
  const setParty = (who, k, v) => commit({ ...pdf, [who]: { ...pdf[who], [k]: v } })
  const setItem = (i, k, v) => commit({ ...pdf, items: pdf.items.map((it, idx) => (idx === i ? { ...it, [k]: v } : it)) })
  const addItem = () => commit(
    { ...pdf, items: [...pdf.items, emptyManualItem()] },
    [...(f.items || []), { soLo: '', hanDung: '', quyCach: '' }],
  )
  const removeItem = (i) => {
    if (pdf.items.length <= 1) return
    commit({ ...pdf, items: pdf.items.filter((_, idx) => idx !== i) }, (f.items || []).filter((_, idx) => idx !== i))
  }
  const num = raw => (raw === '' ? 0 : Number(raw))

  return (
    <Step n={n} title="Thông tin đơn nhập tay">
      <span className="text-xs text-gray-400">Đơn không có file PDF từ website: anh chọn mẫu, nhập bên mua và hàng hoá, app tính thành tiền, tổng tiền và số tiền bằng chữ.</span>
      <div style={grid(190)}>
        <Field label="Mẫu biên bản trả lại hàng" kind="hand">
          <select value={pdf.mau} onChange={e => setMau(e.target.value)} className={handCls} aria-label="Mẫu biên bản">
            {['NOIBO', 'CPC1HN', 'UPHARMA'].map(m => <option key={m} value={m}>{TEMPLATE_LABEL[m]}{m === 'NOIBO' ? ' (khách chưa nhận)' : m === 'CPC1HN' ? ' (Đơn C, khách đã nhận)' : ' (Đơn DTP, khách đã nhận)'}</option>)}
          </select>
        </Field>
      </div>
      {noiBo ? (
        <div style={grid(170)}>
          <Field label="Bên C · Kinh doanh — đại diện" kind="hand"><input value={pdf.benC?.daiDien || ''} onChange={e => setParty('benC', 'daiDien', e.target.value)} className={handCls} /></Field>
          <Field label="Bên C · Chức vụ" kind="hand"><input value={pdf.benC?.chucVu || ''} onChange={e => setParty('benC', 'chucVu', e.target.value)} className={handCls} /></Field>
        </div>
      ) : (
        <>
          <div style={grid(190)}>
            <Field label="Bên mua" kind="hand" full><input value={pdf.benMua.ten} onChange={e => setParty('benMua', 'ten', e.target.value)} className={handCls} /></Field>
            <Field label="Địa chỉ bên mua" kind="hand" full><input value={pdf.benMua.diaChi} onChange={e => setParty('benMua', 'diaChi', e.target.value)} className={handCls} /></Field>
            <Field label="Đại diện bên mua" kind="hand"><input value={pdf.benMua.daiDien} onChange={e => setParty('benMua', 'daiDien', e.target.value)} className={handCls} /></Field>
            <Field label="Chức vụ bên mua" kind="hand"><input value={pdf.benMua.chucVu} onChange={e => setParty('benMua', 'chucVu', e.target.value)} className={handCls} /></Field>
          </div>
          <div style={grid(190)}>
            <Field label="Bên bán" kind="preset" full><input value={pdf.benBan.ten} onChange={e => setParty('benBan', 'ten', e.target.value)} className={presetCls} /></Field>
            <Field label="Địa chỉ bên bán" kind="preset" full><input value={pdf.benBan.diaChi} onChange={e => setParty('benBan', 'diaChi', e.target.value)} className={presetCls} /></Field>
            <Field label="MST bên bán" kind="preset"><input value={pdf.benBan.mst} onChange={e => setParty('benBan', 'mst', e.target.value)} className={presetCls} /></Field>
            <Field label="Đại diện bên bán" kind="preset"><input value={pdf.benBan.daiDien} onChange={e => setParty('benBan', 'daiDien', e.target.value)} className={presetCls} /></Field>
            <Field label="Chức vụ bên bán" kind="preset"><input value={pdf.benBan.chucVu} onChange={e => setParty('benBan', 'chucVu', e.target.value)} className={presetCls} /></Field>
          </div>
        </>
      )}
      <Field label="Lý do xuất trả" kind="hand" full><input value={pdf.lyDo} onChange={e => commit({ ...pdf, lyDo: e.target.value })} className={handCls} /></Field>
      <div style={{ overflowX: 'auto' }}>
        <table className="w-full text-xs">
          <thead><tr className="text-gray-500">{['Tên hàng hoá', 'ĐVT', 'Số lượng', 'Đơn giá (gồm VAT)', 'Thành tiền', ''].map(h => <th key={h} className="px-1.5 py-1.5 text-left font-semibold">{h}</th>)}</tr></thead>
          <tbody>
            {pdf.items.map((it, i) => (
              <tr key={i} className="border-t border-gray-100 align-top">
                <td className="px-1.5 py-1.5" style={{ minWidth: 170 }}><input value={it.ten} onChange={e => setItem(i, 'ten', e.target.value)} className={handCls} aria-label={`Tên hàng dòng ${i + 1}`} /></td>
                <td className="px-1.5 py-1.5" style={{ minWidth: 64 }}><input value={it.dvt} onChange={e => setItem(i, 'dvt', e.target.value)} className={handCls} aria-label={`ĐVT dòng ${i + 1}`} /></td>
                <td className="px-1.5 py-1.5" style={{ minWidth: 76 }}><input type="number" min="0" value={it.soLuong || ''} onChange={e => setItem(i, 'soLuong', num(e.target.value))} className={handCls} aria-label={`Số lượng dòng ${i + 1}`} /></td>
                <td className="px-1.5 py-1.5" style={{ minWidth: 96 }}><input type="number" min="0" value={it.donGia || ''} onChange={e => setItem(i, 'donGia', num(e.target.value))} className={handCls} aria-label={`Đơn giá dòng ${i + 1}`} /></td>
                <td className="px-1.5 py-2 whitespace-nowrap text-right">{money(it.thanhTien)}</td>
                <td className="px-1.5 py-1.5">
                  <button type="button" onClick={() => removeItem(i)} disabled={pdf.items.length <= 1} className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 disabled:opacity-30" title="Xoá dòng" aria-label={`Xoá dòng ${i + 1}`}><Trash2 size={13} /></button>
                </td>
              </tr>
            ))}
            <tr className="border-t border-gray-200 font-semibold"><td className="px-1.5 py-2" colSpan={4}>Tổng cộng tiền thanh toán</td><td className="px-1.5 py-2 text-right whitespace-nowrap">{money(pdf.tongTien)} đ</td><td /></tr>
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={addItem} className="sheet-tab-action"><Plus size={13} /> Thêm dòng hàng</button>
        {pdf.bangChu && <span className="text-xs text-gray-500">Bằng chữ: <b>{pdf.bangChu}</b></span>}
      </div>
    </Step>
  )
}
