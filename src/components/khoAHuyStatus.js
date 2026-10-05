// Trạng thái hồ sơ huỷ Kho A (dùng chung giữa danh sách và màn làm biên bản).
export const KHO_A_STATUS = {
  draft: { label: 'Đang làm', cls: 'bg-blue-50 text-blue-700' },
  exported: { label: 'Đã xuất file', cls: 'bg-amber-50 text-amber-700' },
  done: { label: 'Đã ký đủ', cls: 'bg-green-100 text-green-700' },
}

// Hồ sơ lưu trước đây chỉ có processedAt: dựng phần form (ngày lập / xử lý / xác minh, giờ mặc định 08:30).
export function withKhoAForm(record) {
  if (record.form) return record
  const ngayLap = String(record.processedAt || '').slice(0, 10)
  return { ...record, form: { soBB: '', ngayLap, xlNgay: ngayLap, xlGio: '08:30', xmNgay: ngayLap, xmGio: '08:30' } }
}
