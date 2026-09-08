import { X, FileDown, Pencil } from 'lucide-react'

function InfoField({ label, value }) {
  return (
    <div>
      <div className="text-xs font-medium text-gray-500 mb-1">{label}</div>
      <div className="text-sm text-gray-800">{value || '—'}</div>
    </div>
  )
}

function formatDateVi(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('vi-VN')
}

export default function DamagedGoodsRecordView({ record, onClose, onEdit, onExport, exportingId }) {
  return (
    <div className="sheet-tab">
      <div className="sheet-tab-shell">
        <header className="sheet-tab-context">
          <span>Xem biên bản hàng huỷ — {formatDateVi(record.processedAt)}</span>
          <div className="flex items-center gap-2 ml-auto">
            <button type="button" onClick={() => onExport(record, 'xuLy')} disabled={exportingId === `${record.id}_xuLy`} className="sheet-tab-action">
              <FileDown size={13} /> Xuất Xử lý
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
              <InfoField label="Ngày lập biên bản" value={formatDateVi(record.processedAt)} />
              <InfoField label="Địa điểm lập biên bản" value={record.location} />
              <InfoField label="Lý do" value={record.reason} />
              <InfoField label="Đại diện kho" value={record.repWarehouse} />
              <InfoField label="Đại diện kế toán" value={record.repAccounting} />
            </div>
          </div>

          <div className="report-section">
            <div className="report-section-trigger" style={{ cursor: 'default' }}>
              <span className="report-section-title">Hàng hoá lỗi, bể vỡ</span>
              <span className="report-section-count">{(record.items || []).length} mặt hàng</span>
            </div>
            <div className="report-section-content" style={{ overflowX: 'auto' }}>
              {(record.items || []).length === 0 ? (
                <div className="text-sm text-gray-400">Chưa có mặt hàng nào</div>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      {['Mã hàng', 'Tên hàng', 'Số lô', 'Hạn dùng', 'Kho', 'ĐVT', 'Số lượng', 'Quy cách', 'Nguyên nhân / Ghi chú'].map(h => (
                        <th key={h} className="px-2 py-2 text-left text-gray-500 font-semibold whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {record.items.map((it, i) => (
                      <tr key={i} className="border-b border-gray-50">
                        <td className="px-2 py-1.5">{it.maHang || '—'}</td>
                        <td className="px-2 py-1.5">{it.tenHang || '—'}</td>
                        <td className="px-2 py-1.5">{it.soLo || '—'}</td>
                        <td className="px-2 py-1.5">{it.hanDung || '—'}</td>
                        <td className="px-2 py-1.5">{it.kho || '—'}</td>
                        <td className="px-2 py-1.5">{it.dvt || '—'}</td>
                        <td className="px-2 py-1.5">{it.soLuong || '—'}</td>
                        <td className="px-2 py-1.5">{it.quyCach || '—'}</td>
                        <td className="px-2 py-1.5">{it.ghiChu || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
