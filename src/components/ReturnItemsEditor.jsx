import { Plus, Trash2 } from 'lucide-react'
import { emptyManualItem, recalcManualPdf } from '../utils/returnSlips'
import { handCls } from './workspaceStyles'

const money = n => (Number(n) || 0).toLocaleString('en-US')
const num = raw => (raw === '' ? 0 : Number(raw))

// Bảng hàng hoá sửa được (tên, ĐVT, số lượng, đơn giá) kèm nút thêm / xoá dòng, dùng cho mọi phiếu: đơn nhập tay và
// cả đơn đọc từ file PDF khi app đọc nhầm hàng. Mỗi lần sửa dựng lại thành tiền / tổng tiền / số tiền bằng chữ
// (recalcManualPdf) và giữ form.items (số lô, hạn dùng, quy cách) khớp số dòng hàng.
export default function ReturnItemsEditor({ slip, onChange }) {
  const { pdf, form: f } = slip
  const commit = (nextPdf, formItems = f.items) => onChange({ ...slip, pdf: recalcManualPdf(nextPdf), form: { ...f, items: formItems } })
  const setItem = (i, k, v) => commit({ ...pdf, items: pdf.items.map((it, idx) => (idx === i ? { ...it, [k]: v } : it)) })
  const addItem = () => commit(
    { ...pdf, items: [...pdf.items, emptyManualItem()] },
    [...(f.items || []), { soLo: '', hanDung: '', quyCach: '' }],
  )
  const removeItem = (i) => {
    if (pdf.items.length <= 1) return
    commit({ ...pdf, items: pdf.items.filter((_, idx) => idx !== i) }, (f.items || []).filter((_, idx) => idx !== i))
  }

  return (
    <>
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
    </>
  )
}
