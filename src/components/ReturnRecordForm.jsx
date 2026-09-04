import { useState } from 'react'
import { Plus, Trash2, X } from 'lucide-react'
import { soTienBangChu, parseMoneyString } from '../utils/numberToVietnameseWords'

const DEFAULT_RETURN_REASON = 'Hàng hóa thất lạc trong quá trình vận chuyển. Bộ phận kế toán và kho đã kiểm tra lại thông tin, phát hiện sai sót, tại thời điểm phát hiện hàng hóa chưa giao cho khách hàng.'
const DEFAULT_VERIFY_RESULT = 'Kiểm tra hàng đúng lô, đúng hạn dùng, đúng số lượng.'
const DEFAULT_VERIFY_LOCATION = 'CN.Hồ Chí Minh'

const EMPTY_INVOICE = { mauSo: '', kyHieu: '', soHoaDon: '', ngayLapHD: '', khachHangMua: '', diaChi: '', mst: '', tenHangHoa: '', soLuong: '', giaTri: '' }
const EMPTY_PRODUCT = { tenHang: '', soLo: '', hanDung: '', donViTinh: '', soLuong: '', quyCach: '', tinhTrang: 'Hàng nguyên vẹn' }

function Field({ label, children, className = '' }) {
  return (
    <label className={`flex flex-col gap-1 text-sm ${className}`}>
      <span className="text-xs font-medium text-gray-500">{label}</span>
      {children}
    </label>
  )
}

const inputCls = 'px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400'

function RowTable({ title, columns, rows, onChange, emptyRow }) {
  const updateCell = (i, key, value) => {
    const next = rows.map((r, idx) => (idx === i ? { ...r, [key]: value } : r))
    onChange(next)
  }
  const addRow = () => onChange([...rows, typeof emptyRow === 'function' ? emptyRow() : { ...emptyRow }])
  const removeRow = (i) => onChange(rows.filter((_, idx) => idx !== i))

  return (
    <div className="report-section">
      <div className="report-section-trigger" style={{ cursor: 'default' }}>
        <span className="report-section-title">{title}</span>
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

// dt: 'YYYY-MM-DDTHH:mm' cho input type=datetime-local
function toLocalInputValue(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function ReturnRecordForm({ type, year, month, record, defaultReps, onSave, onCancel }) {
  const [customerName, setCustomerName] = useState(record?.customerName || '')
  const [customerAddress, setCustomerAddress] = useState(record?.customerAddress || '')
  const [customerPhone, setCustomerPhone] = useState(record?.customerPhone || '')
  const [customerMst, setCustomerMst] = useState(record?.customerMst || '')
  const [returnReason, setReturnReason] = useState(record?.returnReason ?? DEFAULT_RETURN_REASON)
  // Tự động tính "Giá trị hóa đơn bằng chữ" theo tổng cột Giá trị (VNĐ) của các hóa đơn — null nghĩa là
  // đang ở chế độ tự động; chỉ chuyển sang giá trị cố định ngay khi người dùng tự gõ vào ô này (để không
  // ghi đè lên nội dung họ đã sửa tay). Bản ghi đã có sẵn giá trị lưu trước đó được coi như đã tự sửa tay.
  const [giaTriBangChuManual, setGiaTriBangChuManual] = useState(record?.giaTriBangChu || null)
  const [verifyDatetime, setVerifyDatetime] = useState(toLocalInputValue(record?.verifyDatetime) || toLocalInputValue(new Date().toISOString()))
  const [verifyLocation, setVerifyLocation] = useState(record?.verifyLocation ?? DEFAULT_VERIFY_LOCATION)
  const [verifyResult, setVerifyResult] = useState(record?.verifyResult ?? DEFAULT_VERIFY_RESULT)
  const [repAccounting, setRepAccounting] = useState(record?.repAccounting || defaultReps?.repAccounting || '')
  const [repSales, setRepSales] = useState(record?.repSales || '')
  const [invoices, setInvoices] = useState(record?.invoices?.length ? record.invoices : [{ ...EMPTY_INVOICE }])
  const [products, setProducts] = useState(record?.products?.length ? record.products : [{ ...EMPTY_PRODUCT }])

  // Đồng bộ 1 trường trong tất cả dòng hóa đơn theo giá trị tự động mới nhất — chỉ cập nhật dòng nào đang
  // trống HOẶC vẫn đang khớp với giá trị tự động lần trước (nghĩa là chưa bị người dùng tự sửa riêng);
  // dòng nào đã có nội dung khác (do người dùng tự gõ) thì giữ nguyên, không ghi đè.
  const syncInvoiceField = (field, prevValue, nextValue) => {
    setInvoices(prev => prev.map(inv => (
      !inv[field] || inv[field] === prevValue ? { ...inv, [field]: nextValue } : inv
    )))
  }

  const handleCustomerNameChange = (value) => {
    syncInvoiceField('khachHangMua', customerName, value)
    setCustomerName(value)
  }
  const handleCustomerAddressChange = (value) => {
    syncInvoiceField('diaChi', customerAddress, value)
    setCustomerAddress(value)
  }
  const handleCustomerMstChange = (value) => {
    syncInvoiceField('mst', customerMst, value)
    setCustomerMst(value)
  }

  const summarizeProducts = (list) => list.map(p => p.tenHang.trim()).filter(Boolean).join(' / ')
  const handleProductsChange = (next) => {
    syncInvoiceField('tenHangHoa', summarizeProducts(products), summarizeProducts(next))
    setProducts(next)
  }

  const makeEmptyInvoiceRow = () => ({
    ...EMPTY_INVOICE,
    khachHangMua: customerName,
    diaChi: customerAddress,
    mst: customerMst,
    tenHangHoa: summarizeProducts(products),
  })

  const giaTriBangChuAuto = giaTriBangChuManual === null
  const giaTriBangChuComputed = invoices.reduce((sum, inv) => sum + parseMoneyString(inv.giaTri), 0)
  const giaTriBangChu = giaTriBangChuAuto
    ? (giaTriBangChuComputed ? soTienBangChu(giaTriBangChuComputed) : '')
    : giaTriBangChuManual

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!customerName.trim()) return
    onSave({
      id: record?.id || `return_${type}_${Date.now()}`,
      entity: type,
      year, month,
      customerName: customerName.trim(),
      customerAddress, customerPhone, customerMst,
      returnReason, giaTriBangChu,
      verifyDatetime: verifyDatetime ? new Date(verifyDatetime).toISOString() : null,
      verifyLocation, verifyResult,
      repAccounting, repSales,
      status: record?.status || 'draft',
      createdAt: record?.createdAt || new Date().toISOString(),
      invoices: invoices.filter(inv => Object.values(inv).some(v => String(v || '').trim())),
      products: products.filter(p => Object.values(p).some(v => String(v || '').trim())),
    })
  }

  return (
    <div className="sheet-tab-shell">
      <header className="sheet-tab-context">
        <span>{record ? 'Sửa đơn trả hàng' : 'Thêm đơn trả hàng mới'} — Tháng {month}/{year}</span>
        <div className="flex items-center gap-2 ml-auto">
          <button type="button" onClick={onCancel} className="sheet-tab-action">
            <X size={13} /> Huỷ
          </button>
        </div>
      </header>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3" style={{ paddingTop: 12 }}>
        <div className="report-section">
          <div className="report-section-content" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 12 }}>
            <Field label="Khách hàng *" className="col-span-1">
              <input required value={customerName} onChange={e => handleCustomerNameChange(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Địa chỉ">
              <input value={customerAddress} onChange={e => handleCustomerAddressChange(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Số điện thoại">
              <input value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} className={inputCls} />
            </Field>
            <Field label="MST (nếu có)">
              <input value={customerMst} onChange={e => handleCustomerMstChange(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Đại diện kế toán (Bên A)">
              <input value={repAccounting} onChange={e => setRepAccounting(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Đại diện kinh doanh (Bên C)">
              <input value={repSales} onChange={e => setRepSales(e.target.value)} className={inputCls} />
            </Field>
          </div>
        </div>

        <RowTable
          title="Hóa đơn cần trả (mỗi hóa đơn 1 dòng)"
          rows={invoices}
          onChange={setInvoices}
          emptyRow={makeEmptyInvoiceRow}
          columns={[
            { key: 'mauSo', label: 'Mẫu số' },
            { key: 'kyHieu', label: 'Ký hiệu' },
            { key: 'soHoaDon', label: 'Số hóa đơn' },
            { key: 'ngayLapHD', label: 'Ngày lập' },
            { key: 'khachHangMua', label: 'Khách hàng mua' },
            { key: 'diaChi', label: 'Địa chỉ' },
            { key: 'mst', label: 'MST' },
            { key: 'tenHangHoa', label: 'Tên hàng hóa' },
            { key: 'soLuong', label: 'Số lượng' },
            { key: 'giaTri', label: 'Giá trị (VNĐ)' },
          ]}
        />

        <div className="report-section">
          <div className="report-section-content" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 12 }}>
            <Field label={`Giá trị hóa đơn bằng chữ${giaTriBangChuAuto ? ' (tự động theo tổng hóa đơn)' : ''}`}>
              <input value={giaTriBangChu} onChange={e => setGiaTriBangChuManual(e.target.value)} className={inputCls} placeholder="VD: Một trăm nghìn đồng chẵn" />
            </Field>
            <Field label="Lý do trả hàng / huỷ hóa đơn">
              <textarea value={returnReason} onChange={e => setReturnReason(e.target.value)} className={inputCls} rows={2} />
            </Field>
          </div>
        </div>

        <RowTable
          title="Xác minh tình trạng hàng hoá (mỗi sản phẩm 1 dòng)"
          rows={products}
          onChange={handleProductsChange}
          emptyRow={EMPTY_PRODUCT}
          columns={[
            { key: 'tenHang', label: 'Tên hàng hoá' },
            { key: 'soLo', label: 'Số lô' },
            { key: 'hanDung', label: 'Hạn dùng' },
            { key: 'donViTinh', label: 'Đơn vị tính' },
            { key: 'soLuong', label: 'Số lượng' },
            { key: 'quyCach', label: 'Quy cách' },
            { key: 'tinhTrang', label: 'Tình trạng' },
          ]}
        />

        <div className="report-section">
          <div className="report-section-content" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 12 }}>
            <Field label="Ngày giờ xác minh">
              <input type="datetime-local" value={verifyDatetime} onChange={e => setVerifyDatetime(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Địa điểm xác minh">
              <input value={verifyLocation} onChange={e => setVerifyLocation(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Kết quả xác minh">
              <input value={verifyResult} onChange={e => setVerifyResult(e.target.value)} className={inputCls} />
            </Field>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button type="submit" className="sheet-tab-action is-primary">Lưu đơn trả hàng</button>
          <button type="button" onClick={onCancel} className="sheet-tab-action">Huỷ</button>
        </div>
      </form>
    </div>
  )
}
