// "Lưu số liệu tuần này" cho tab Gộp kênh (Thử nghiệm) — đóng băng ĐÚNG số không thể tính lại được
// nữa sau khi rows thô của Đơn SO/Đơn truyền thống bị ghi đè bởi lần upload sau (tổng, breakdown
// theo shop, breakdown kênh...), giữ thành danh sách lịch sử riêng theo từng file upload, xem lại
// được. Storage riêng "unified_trial_reports_*", KHÔNG đụng "sheet_reports_*" của Đơn C/DTP/TMĐT.
//
// Panel Viettel/SPX (kể cả đối soát ngoại sàn 4 mốc) thì KHÔNG cần đóng băng số — ghim đúng weekId +
// bảng đối chiếu (carrierLookup) tại thời điểm lưu là đủ để xem lại y hệt giao diện trực tiếp, vì dữ
// liệu VTP/SPX tích luỹ nhiều tuần (không bị ghi đè) khác với rows Đơn SO/Đơn truyền thống.
//
// Khác 3 tab sản xuất: KHÔNG tự xoá rows thô sau khi lưu (tab này chỉ giữ 1 slot rows/kênh nên không
// cần cơ chế dọn bớt) — upload tuần mới vẫn ghi đè rows thô như trước giờ, không ảnh hưởng bản đã lưu.
import { opsStore as localStorage } from '../data/workspace'

function storageKey(kind) { return `unified_trial_reports_${kind}` }

export function readTrialReports(kind) {
  try {
    const list = JSON.parse(localStorage.getItem(storageKey(kind)) || '[]')
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

export function saveTrialReport(kind, entry) {
  const reports = readTrialReports(kind).filter(r => r.id !== entry.id)
  const next = [{ ...entry, createdAt: new Date().toISOString() }, ...reports].slice(0, 52)
  localStorage.setItem(storageKey(kind), JSON.stringify(next))
  return next
}

export function removeTrialReport(kind, id) {
  const next = readTrialReports(kind).filter(r => r.id !== id)
  localStorage.setItem(storageKey(kind), JSON.stringify(next))
  return next
}

// Đổi tên tuần đã lưu — mặc định label là "<tên file> · <ngày upload>", người dùng có thể sửa lại
// thành tên tuần báo cáo thật (vd "Tuần 12.09 - 18.09.2026") cho dễ nhận ra sau này.
export function renameTrialReport(kind, id, label) {
  const next = readTrialReports(kind).map(r => r.id === id ? { ...r, label } : r)
  localStorage.setItem(storageKey(kind), JSON.stringify(next))
  return next
}
