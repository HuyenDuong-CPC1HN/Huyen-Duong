import { useLayoutEffect, useRef, useState } from 'react'
import { CalendarDays, Plus, Trash2, X } from 'lucide-react'
import { SWAP_RETURN_ACCOUNTANTS, formatDmy, isoWeekNumber, isValidDateText, lotStatus, mondayOf, addDays, normalizeDateText } from '../utils/swapReturnWeek'
import LotBadge from './SwapReturnLotBadge'

const EMPTY_ITEM = { maHang: '', tenHang: '', loLoi: '', loDoi: '', hanDungLoi: '', hanDungDoi: '', dvt: '', soLuong: '', quyCach: '', lyDo: '' }

function dmyToIso(value) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(value || ''))
  return m ? `${m[3]}-${m[2]}-${m[1]}` : ''
}

// Ô <input type="date"> của trình duyệt không cho dán chữ, nên hạn dùng là ô chữ dd/mm/yyyy (gõ hoặc dán
// từ Excel/PDF, tự chuẩn hoá) kèm nút lịch mở bộ chọn ngày gốc của trình duyệt.
function DateTextField({ value, onChange, disabled, label, className }) {
  const pickerRef = useRef(null)
  const invalid = Boolean(value) && !isValidDateText(value)
  const openPicker = () => {
    const picker = pickerRef.current
    if (!picker) return
    try { picker.showPicker() } catch { picker.focus(); picker.click() }
  }
  return (
    <div className="relative flex items-center gap-1">
      <input
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        onBlur={e => onChange(normalizeDateText(e.target.value))}
        onPaste={e => {
          e.preventDefault()
          onChange(normalizeDateText(e.clipboardData.getData('text')))
        }}
        placeholder="dd/mm/yyyy"
        inputMode="numeric"
        disabled={disabled}
        aria-label={label}
        aria-invalid={invalid || undefined}
        title={invalid ? 'Chưa đúng ngày dd/mm/yyyy' : undefined}
        className={`${className} ${invalid ? 'border-red-400 bg-red-50' : ''}`}
      />
      <button type="button" onClick={openPicker} disabled={disabled} aria-label={`Chọn ngày ${label}`}
        className="p-1 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 disabled:opacity-40 disabled:cursor-not-allowed">
        <CalendarDays size={14} />
      </button>
      <input
        ref={pickerRef}
        type="date"
        tabIndex={-1}
        aria-hidden="true"
        value={dmyToIso(value)}
        onChange={e => { const [y, m, d] = e.target.value.split('-'); if (d) onChange(`${d}/${m}/${y}`) }}
        className="absolute left-0 bottom-0 w-px h-px opacity-0 pointer-events-none"
      />
    </div>
  )
}

// Ô chữ dài (Tên hàng, Lý do) tự xuống dòng và cao theo nội dung để nhìn hết khi nhập; Enter không tạo dòng mới vì
// nội dung được ghi vào 1 ô của biên bản.
function WrapTextField({ value, onChange, label, className }) {
  const ref = useRef(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight + 2}px`
  }, [value])
  return (
    <textarea
      ref={ref}
      rows={1}
      value={value ?? ''}
      onChange={e => onChange(e.target.value.replace(/\s*\n\s*/g, ' '))}
      onKeyDown={e => { if (e.key === 'Enter') e.preventDefault() }}
      aria-label={label}
      className={`${className} resize-none overflow-hidden leading-snug block`}
    />
  )
}

const cellCls = 'w-full px-1.5 py-1 text-xs border border-gray-200 rounded focus:border-blue-400 focus:outline-none bg-white disabled:opacity-50 disabled:cursor-not-allowed'
const inputCls = 'px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400'

const COLUMNS = [
  { key: 'maHang', label: 'Mã hàng', width: 90 },
  { key: 'tenHang', label: 'Tên hàng', width: 220, wrap: true },
  { key: 'loLoi', label: 'Số lô hàng lỗi', width: 100 },
  { key: 'loDoi', label: 'Số lô hàng đổi', width: 100 },
  { key: 'status', label: 'Lô' },
  { key: 'hanDungLoi', label: 'HD lô lỗi', width: 140, date: true },
  { key: 'hanDungDoi', label: 'HD lô đổi', width: 140, date: true },
  { key: 'dvt', label: 'ĐVT', width: 60 },
  { key: 'soLuong', label: 'SL', width: 60 },
  { key: 'quyCach', label: 'Quy cách', width: 100 },
  { key: 'lyDo', label: 'Lý do', width: 220, wrap: true },
]

export default function SwapReturnRecordForm({ entity, defaultDate, record, onSave, onCancel }) {
  const [date, setDate] = useState(record?.date || defaultDate)
  const [customerName, setCustomerName] = useState(record?.customerName || '')
  const [accountantNhapLai, setAccountantNhapLai] = useState(record?.accountantNhapLai || '')
  const [items, setItems] = useState(record?.items?.length ? record.items : [{ ...EMPTY_ITEM }])
  const [error, setError] = useState('')

  const filled = items.filter(it => String(it.maHang || '').trim())
  const diffCount = filled.filter(it => lotStatus(it) === 'diff').length
  const weekStart = date ? mondayOf(date) : null

  // Cùng lô = cùng 1 lô vật lý -> hạn dùng bắt buộc giống nhau: HD lô đổi đi theo HD lô lỗi và bị khoá.
  const updateItem = (index, key, value) => {
    setItems(prev => prev.map((it, i) => {
      if (i !== index) return it
      const next = { ...it, [key]: value }
      if (lotStatus(next) === 'same') next.hanDungDoi = next.hanDungLoi
      return next
    }))
  }
  const addItem = () => setItems(prev => [...prev, { ...EMPTY_ITEM }])
  const removeItem = (index) => setItems(prev => (prev.length === 1 ? [{ ...EMPTY_ITEM }] : prev.filter((_, i) => i !== index)))

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!date) return setError('Chưa chọn ngày đổi trả.')
    if (!customerName.trim()) return setError('Chưa nhập tên khách hàng.')
    if (filled.length === 0) return setError('Chưa có mặt hàng nào — nhập ít nhất Mã hàng.')
    const badDate = filled.findIndex(it => [it.hanDungLoi, it.hanDungDoi].some(v => v && !isValidDateText(v)))
    if (badDate >= 0) return setError(`Hạn dùng của mặt hàng ${filled[badDate].maHang} chưa đúng dạng dd/mm/yyyy.`)
    if (diffCount > 0 && !accountantNhapLai) return setError('Có hàng khác lô — chọn kế toán cho BB xác minh nhập lại kho.')
    onSave({
      id: record?.id || `swap_${entity}_${Date.now()}`,
      entity,
      date,
      customerName: customerName.trim(),
      accountantNhapLai: diffCount > 0 ? accountantNhapLai : '',
      items: filled.map(it => ({ ...it, maHang: it.maHang.trim() })),
      nhapLaiExportedAt: record?.nhapLaiExportedAt || null,
      createdAt: record?.createdAt || new Date().toISOString(),
    })
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center overflow-y-auto p-4 sm:p-10" onMouseDown={e => { if (e.target === e.currentTarget) onCancel() }}>
      <form onSubmit={handleSubmit} role="dialog" aria-modal="true" aria-labelledby="swap-form-title"
        className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl flex flex-col">
        <div className="px-5 pt-5 flex items-start gap-3">
          <div>
            <h2 id="swap-form-title" className="text-base font-bold text-gray-900">
              {record ? 'Sửa đợt đổi trả' : 'Thêm đợt đổi trả'} — {entity === 'donC' ? 'Đơn C' : 'Đơn DTP'}
            </h2>
            <p className="text-xs text-gray-500 mt-1">Thường chỉ 1 mặt hàng — cần thêm thì bấm "Thêm dòng". Cột "Lô" tự nhận theo 2 số lô.</p>
          </div>
          <button type="button" onClick={onCancel} className="ml-auto p-1.5 rounded hover:bg-gray-100 text-gray-400" aria-label="Đóng"><X size={16} /></button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-4">
          <div className="grid gap-3" style={{ gridTemplateColumns: 'minmax(150px, 180px) minmax(220px, 1fr)' }}>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-xs font-medium text-gray-500">Ngày đổi trả *</span>
              <input type="date" required value={date} onChange={e => setDate(e.target.value)} className={inputCls} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-xs font-medium text-gray-500">Tên khách hàng *</span>
              <input autoFocus value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="VD: Nhà thuốc ..." className={inputCls} />
            </label>
          </div>

          <div className="overflow-x-auto border border-gray-100 rounded-lg">
            <table className="w-full text-xs" style={{ minWidth: 1180 }}>
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {COLUMNS.map(c => <th key={c.key} className="px-2 py-2 text-left text-gray-500 font-semibold whitespace-nowrap">{c.label}</th>)}
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {items.map((it, i) => {
                  const status = lotStatus(it)
                  return (
                    <tr key={i} className="border-b border-gray-50">
                      {COLUMNS.map(c => (
                        <td key={c.key} className="px-1.5 py-1.5 align-top" style={c.width ? { minWidth: c.width } : undefined}>
                          {c.key === 'status' && <div className="pt-1"><LotBadge status={status} /></div>}
                          {c.date && (
                            <DateTextField value={it[c.key]} onChange={v => updateItem(i, c.key, v)}
                              label={`${c.label} dòng ${i + 1}`}
                              disabled={c.key === 'hanDungDoi' && status === 'same'}
                              className={cellCls} />
                          )}
                          {c.wrap && (
                            <WrapTextField value={it[c.key]} onChange={v => updateItem(i, c.key, v)}
                              label={`${c.label} dòng ${i + 1}`} className={cellCls} />
                          )}
                          {c.key !== 'status' && !c.date && !c.wrap && (
                            <input value={it[c.key] ?? ''} onChange={e => updateItem(i, c.key, e.target.value)}
                              aria-label={`${c.label} dòng ${i + 1}`}
                              inputMode={c.key === 'soLuong' ? 'numeric' : undefined} className={cellCls} />
                          )}
                        </td>
                      ))}
                      <td className="px-1.5 py-1.5 align-top">
                        <button type="button" onClick={() => removeItem(i)} className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500" title="Xoá dòng" aria-label="Xoá dòng">
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div>
            <button type="button" onClick={addItem} className="sheet-tab-action" style={{ minHeight: 28, padding: '0 10px' }}>
              <Plus size={13} /> Thêm dòng
            </button>
          </div>

          {diffCount > 0 && (
            <label className="flex flex-col gap-1 text-sm" style={{ maxWidth: 320 }}>
              <span className="text-xs font-medium text-gray-500">Kế toán — BB xác minh nhập lại kho *</span>
              <select value={accountantNhapLai} onChange={e => setAccountantNhapLai(e.target.value)} className={inputCls}>
                <option value="">— Chọn kế toán —</option>
                {SWAP_RETURN_ACCOUNTANTS.map(name => <option key={name} value={name}>{name}</option>)}
              </select>
            </label>
          )}

          <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-3 text-xs text-gray-600 flex flex-col gap-1.5">
            <div className="font-semibold text-gray-800">Sau khi lưu:</div>
            <div>
              • {filled.length || 'Các'} mặt hàng tự vào <b>Bộ xuất huỷ cuối tuần {weekStart ? isoWeekNumber(weekStart) : ''}</b>
              {weekStart && <> ({formatDmy(weekStart)} – {formatDmy(addDays(weekStart, 6))})</>} — không xuất file gì ngay.
            </div>
            <div>
              • {diffCount > 0
                ? <>Có <b>{diffCount} dòng khác lô</b> → cần 1 <b>BB xác minh nhập lại kho</b> cho khách này (xuất ở danh sách đợt).</>
                : <>Không có dòng khác lô → <b>không cần</b> BB xác minh nhập lại kho.</>}
            </div>
          </div>

          {error && <div className="text-sm text-red-600" role="alert">{error}</div>}
        </div>

        <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="sheet-tab-action">Huỷ</button>
          <button type="submit" className="sheet-tab-action is-primary">Lưu đợt đổi trả</button>
        </div>
      </form>
    </div>
  )
}
