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

// Tuần đã lưu bị hỏng do lỗi cũ: lúc lưu đọc nhầm nguyên khối { sessionKey, value } của ô nhập tay → số chưa
// giao theo khách hàng thành 0, số chưa gửi chành thành NaN (lưu ra null) kéo theo Chành xe / Tổng đơn = null.
// Dựng lại các số tổng từ phần còn lại (số chưa gửi chành đã mất thì tính 0).
export function repairChannelSnapshot(snap) {
  if (!snap || typeof snap !== 'object') return snap
  const kh = snap.khValues
  const wrapped = kh && typeof kh === 'object' && 'sessionKey' in kh && 'value' in kh
  const broken = wrapped || !Number.isFinite(snap.total) || !Number.isFinite(snap.chanhXeBadge)
  if (!broken) return snap
  const khValues = wrapped ? (kh.value && typeof kh.value === 'object' ? kh.value : {}) : (kh || {})
  const khBreakdownSum = Object.values(khValues).reduce((s, v) => s + (Number(v) || 0), 0)
  const oldKhSum = Number.isFinite(snap.khBreakdownSum) ? snap.khBreakdownSum : 0
  const trucTiepBadge = (Number(snap.trucTiepBadge) || 0) - (wrapped ? oldKhSum : 0) + (wrapped ? khBreakdownSum : 0)
  const chuaGuiChanh = Number.isFinite(snap.chuaGuiChanh) ? snap.chuaGuiChanh : 0
  const chanhXeBadge = Number.isFinite(snap.chanhXeBadge) ? snap.chanhXeBadge : (Number(snap.chanhXeCount) || 0) + chuaGuiChanh
  const doitacTotal = Number(snap.doitacTotal) || 0
  return {
    ...snap, khValues, khBreakdownSum: wrapped ? khBreakdownSum : oldKhSum, trucTiepBadge, chuaGuiChanh, chanhXeBadge,
    total: trucTiepBadge + chanhXeBadge + doitacTotal,
  }
}

function storageKey(kind) { return `unified_trial_reports_${kind}` }

export function readTrialReports(kind) {
  try {
    const list = JSON.parse(localStorage.getItem(storageKey(kind)) || '[]')
    if (!Array.isArray(list)) return []
    // Tuần Đơn truyền thống lưu bằng bản lỗi (số tổng null) — dựng lại số khi đọc, xem repairChannelSnapshot.
    return kind === 'donTruyenThong'
      ? list.map(r => (r && (r.donC || r.donDTP) ? { ...r, donC: repairChannelSnapshot(r.donC), donDTP: repairChannelSnapshot(r.donDTP) } : r))
      : list
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

// Sửa 1 phần báo cáo đã lưu (vd gắn lại file VTP/SPX của tuần đó khi file cũ không còn) — giữ nguyên createdAt.
export function updateTrialReport(kind, id, patch) {
  const next = readTrialReports(kind).map(r => (r.id === id ? patch(r) : r))
  localStorage.setItem(storageKey(kind), JSON.stringify(next))
  return next
}
