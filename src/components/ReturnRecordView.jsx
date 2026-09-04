import { X, FileDown, Pencil } from 'lucide-react'

function InfoField({ label, value }) {
  return (
    <div>
      <div className="text-xs font-medium text-gray-500 mb-1">{label}</div>
      <div className="text-sm text-gray-800">{value || '—'}</div>
    </div>
  )
}

function formatDatetime(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('vi-VN')
}

export default function ReturnRecordView({ record, onClose, onEdit, onExport, exportingId }) {
  return (
    <div className="sheet-tab">
      <div className="sheet-tab-shell">
        <header className="sheet-tab-context">
          <span>Xem đơn trả hàng — {record.customerName}</span>
          <div className="flex items-center gap-2 ml-auto">
            <button type="button" onClick={() => onExport(record, 'traHang')} disabled={exportingId === `${record.id}_traHang`} className="sheet-tab-action">
              <FileDown size={13} /> Xuất Trả hàng
            </button>
            <button type="button" onClick={() => onExport(record, 'xacMinh')} disabled={exportingId === `${record.id}_xacMinh`} className="sheet-tab-action">
              <FileDown size={13} /> Xuất Xác minh
            </button>
            <button type="button" onClick={onEdit} className="sheet-tab-action">
              <Pencil size={13} /> Sửa
            </button>
            <button type="button" onClick={onClose} className="sheet-tab-action">
              <X size={13} /> Đóng
            </button>
          </div>
        </header>

        <div className="flex flex-col gap-3" style={{ paddingTop: 12 }}>
          <div className="report-section">
            <div className="report-section-content" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 16 }}>
              <InfoField label="Khách hàng" value={record.customerName} />
              <InfoField label="Địa chỉ" value={record.customerAddress} />
              <InfoField label="Số điện thoại" value={record.customerPhone} />
              <InfoField label="MST" value={record.customerMst} />
              <InfoField label="Đại diện kế toán (Bên A)" value={record.repAccounting} />
              <InfoField label="Đại diện kinh doanh (Bên C)" value={record.repSales} />
            </div>
          </div>

          <div className="report-section">
            <div className="report-section-trigger" style={{ cursor: 'default' }}>
              <span className="report-section-title">Hóa đơn cần trả</span>
              <span className="report-section-count">{(record.invoices || []).length} hóa đơn</span>
            </div>
            <div className="report-section-content" style={{ overflowX: 'auto' }}>
              {(record.invoices || []).length === 0 ? (
                <div className="text-sm text-gray-400">Chưa có hóa đơn nào</div>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      {['Mẫu số', 'Ký hiệu', 'Số hóa đơn', 'Ngày lập', 'Khách hàng mua', 'Địa chỉ', 'MST', 'Tên hàng hóa', 'Số lượng', 'Giá trị (VNĐ)'].map(h => (
                        <th key={h} className="px-2 py-2 text-left text-gray-500 font-semibold whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {record.invoices.map((inv, i) => (
                      <tr key={i} className="border-b border-gray-50">
                        <td className="px-2 py-1.5">{inv.mauSo || '—'}</td>
                        <td className="px-2 py-1.5">{inv.kyHieu || '—'}</td>
                        <td className="px-2 py-1.5">{inv.soHoaDon || '—'}</td>
                        <td className="px-2 py-1.5">{inv.ngayLapHD || '—'}</td>
                        <td className="px-2 py-1.5">{inv.khachHangMua || '—'}</td>
                        <td className="px-2 py-1.5">{inv.diaChi || '—'}</td>
                        <td className="px-2 py-1.5">{inv.mst || '—'}</td>
                        <td className="px-2 py-1.5">{inv.tenHangHoa || '—'}</td>
                        <td className="px-2 py-1.5">{inv.soLuong || '—'}</td>
                        <td className="px-2 py-1.5">{inv.giaTri || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div className="report-section">
            <div className="report-section-content" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 16 }}>
              <InfoField label="Giá trị hóa đơn bằng chữ" value={record.giaTriBangChu} />
              <InfoField label="Lý do trả hàng / huỷ hóa đơn" value={record.returnReason} />
            </div>
          </div>

          <div className="report-section">
            <div className="report-section-trigger" style={{ cursor: 'default' }}>
              <span className="report-section-title">Xác minh tình trạng hàng hoá</span>
              <span className="report-section-count">{(record.products || []).length} sản phẩm</span>
            </div>
            <div className="report-section-content" style={{ overflowX: 'auto' }}>
              {(record.products || []).length === 0 ? (
                <div className="text-sm text-gray-400">Chưa có sản phẩm nào</div>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      {['Tên hàng hoá', 'Số lô', 'Hạn dùng', 'Đơn vị tính', 'Số lượng', 'Quy cách', 'Tình trạng'].map(h => (
                        <th key={h} className="px-2 py-2 text-left text-gray-500 font-semibold whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {record.products.map((p, i) => (
                      <tr key={i} className="border-b border-gray-50">
                        <td className="px-2 py-1.5">{p.tenHang || '—'}</td>
                        <td className="px-2 py-1.5">{p.soLo || '—'}</td>
                        <td className="px-2 py-1.5">{p.hanDung || '—'}</td>
                        <td className="px-2 py-1.5">{p.donViTinh || '—'}</td>
                        <td className="px-2 py-1.5">{p.soLuong || '—'}</td>
                        <td className="px-2 py-1.5">{p.quyCach || '—'}</td>
                        <td className="px-2 py-1.5">{p.tinhTrang || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div className="report-section">
            <div className="report-section-content" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 16 }}>
              <InfoField label="Ngày giờ xác minh" value={formatDatetime(record.verifyDatetime)} />
              <InfoField label="Địa điểm xác minh" value={record.verifyLocation} />
              <InfoField label="Kết quả xác minh" value={record.verifyResult} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
