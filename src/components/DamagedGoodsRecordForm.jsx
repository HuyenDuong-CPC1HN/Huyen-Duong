import { useState } from 'react'
import { Plus, Trash2, X } from 'lucide-react'

const DEFAULT_REASON = 'Hàng lỗi, bể vỡ trong quá trình vận chuyển.'
const DEFAULT_LOCATION = 'Kho CN Hồ Chí Minh'
const DEFAULT_REP_WAREHOUSE = 'Dương Thị Ngọc Huyền'
const DEFAULT_REP_ACCOUNTING = 'Lưu Thị Thuỳ'

const EMPTY_ITEM = { maHang: '', tenHang: '', soLo: '', hanDung: '', kho: '', dvt: '', soLuong: '', quyCach: '', ghiChu: '' }

function Field({ label, children, className = '' }) {
  return (
    <label className={`flex flex-col gap-1 text-sm ${className}`}>
      <span className="text-xs font-medium text-gray-500">{label}</span>
      {children}
    </label>
  )
}

const inputCls = 'px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400'

function ItemsTable({ rows, onChange }) {
  const columns = [
    { key: 'maHang', label: 'Mã hàng' },
    { key: 'tenHang', label: 'Tên hàng' },
    { key: 'soLo', label: 'Số lô' },
    { key: 'hanDung', label: 'Hạn dùng' },
    { key: 'kho', label: 'Kho' },
    { key: 'dvt', label: 'ĐVT' },
    { key: 'soLuong', label: 'Số lượng' },
    { key: 'quyCach', label: 'Quy cách' },
    { key: 'ghiChu', label: 'Nguyên nhân / Ghi chú' },
  ]
  const updateCell = (i, key, value) => onChange(rows.map((r, idx) => (idx === i ? { ...r, [key]: value } : r)))
  const addRow = () => onChange([...rows, { ...EMPTY_ITEM }])
  const removeRow = (i) => onChange(rows.filter((_, idx) => idx !== i))

  return (
    <div className="report-section">
      <div className="report-section-trigger" style={{ cursor: 'default' }}>
        <span className="report-section-title">Hàng hoá lỗi, bể vỡ (mỗi mặt hàng 1 dòng)</span>
        <button type="button" onClick={addRow} className="sheet-tab-action is-primary" style={{ minHeight: 28, padding: '0 10px' }}>
          <Plus size={13} /> Thêm dòng
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
              <tr><td colSpan={columns.length + 1} className="px-2 py-4 text-center text-gray-400">Chưa có dòng nào</td></tr>
            )}
            {rows.map((row, i) => (
              <tr key={i} className="border-b border-gray-50">
                {columns.map(c => (
                  <td key={c.key} className="px-1.5 py-1.5">
                    <input
                      value={row[c.key] ?? ''}
                      onChange={e => updateCell(i, c.key, e.target.value)}
                      className="w-full min-w-24 px-1.5 py-1 text-xs border border-transparent rounded hover:border-gray-300 focus:border-blue-400 focus:outline-none bg-transparent"
                      placeholder={c.label}
                    />
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

export default function DamagedGoodsRecordForm({ type, year, month, record, onSave, onCancel }) {
  const [processedAt, setProcessedAt] = useState(record?.processedAt?.slice(0, 10) || new Date().toISOString().slice(0, 10))
  const [location, setLocation] = useState(record?.location ?? DEFAULT_LOCATION)
  const [reason, setReason] = useState(record?.reason ?? DEFAULT_REASON)
  const [repWarehouse, setRepWarehouse] = useState(record?.repWarehouse || DEFAULT_REP_WAREHOUSE)
  const [repAccounting, setRepAccounting] = useState(record?.repAccounting || DEFAULT_REP_ACCOUNTING)
  const [items, setItems] = useState(record?.items?.length ? record.items : [{ ...EMPTY_ITEM }])

  const handleSubmit = (e) => {
    e.preventDefault()
    const cleanItems = items.filter(it => Object.values(it).some(v => String(v || '').trim()))
    if (cleanItems.length === 0) return
    onSave({
      id: record?.id || `damaged_${type}_${Date.now()}`,
      entity: type,
      year, month,
      processedAt: processedAt ? new Date(processedAt).toISOString() : new Date().toISOString(),
      location, reason,
      repWarehouse, repAccounting,
      status: record?.status || 'draft',
      createdAt: record?.createdAt || new Date().toISOString(),
      items: cleanItems,
    })
  }

  return (
    <div className="sheet-tab-shell">
      <header className="sheet-tab-context">
        <span>{record ? 'Sửa biên bản hàng huỷ' : 'Thêm biên bản hàng huỷ'} — Tháng {month}/{year}</span>
        <div className="flex items-center gap-2 ml-auto">
          <button type="button" onClick={onCancel} className="sheet-tab-action">
            <X size={13} /> Huỷ
          </button>
        </div>
      </header>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3" style={{ paddingTop: 12 }}>
        <div className="report-section">
          <div className="report-section-content" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 12 }}>
            <Field label="Ngày lập biên bản *">
              <input required type="date" value={processedAt} onChange={e => setProcessedAt(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Địa điểm lập biên bản">
              <input value={location} onChange={e => setLocation(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Lý do" className="col-span-1">
              <input value={reason} onChange={e => setReason(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Đại diện kho">
              <input value={repWarehouse} onChange={e => setRepWarehouse(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Đại diện kế toán">
              <input value={repAccounting} onChange={e => setRepAccounting(e.target.value)} className={inputCls} />
            </Field>
          </div>
        </div>

        <ItemsTable rows={items} onChange={setItems} />

        <div className="flex items-center gap-2">
          <button type="submit" className="sheet-tab-action is-primary">Lưu biên bản</button>
          <button type="button" onClick={onCancel} className="sheet-tab-action">Huỷ</button>
        </div>
      </form>
    </div>
  )
}
