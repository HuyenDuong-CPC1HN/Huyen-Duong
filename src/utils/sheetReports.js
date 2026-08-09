import { opsStore as localStorage } from '../data/workspace'

// ---- Số liệu đã "chốt" theo tuần cho tab Đơn C / Đơn DTP ----
// Khi người dùng bấm "Lưu số liệu tuần này", các số tính được từ file Excel gốc (mốc giao 24h/48h/72h
// của Giao hàng trực tiếp, số đơn Chành xe) được đóng băng vào đây — sau đó file Excel gốc có thể xoá
// mà vẫn giữ được số liệu để xem lại/tổng hợp (dùng chung ở tab Tổng đơn).
// id của bản lưu = chính id tuần Excel gốc, để các số liệu nhập tay khác (chưa giao, chưa gửi chành...)
// vốn lưu theo weekId vẫn tiếp tục đọc đúng chỗ sau khi file gốc đã bị xoá.

function storageKey(type) { return `sheet_reports_${type}` }

export function readSheetReports(type) {
  try { return JSON.parse(localStorage.getItem(storageKey(type)) || '[]') } catch { return [] }
}

export function saveSheetReport(type, weekId, label, { b24, b48, b72, chanhXeCount, viettelWeekId, spxWeekId, carrierLookup, viettelFrozen, spxFrozen }) {
  const reports = readSheetReports(type).filter(r => r.id !== weekId)
  const entry = {
    id: weekId, createdAt: new Date().toISOString(), label, b24, b48, b72, chanhXeCount,
    viettelWeekId, spxWeekId, carrierLookup, viettelFrozen, spxFrozen,
  }
  const next = [entry, ...reports].slice(0, 52)
  localStorage.setItem(storageKey(type), JSON.stringify(next))
  return next
}

// Nối/cập nhật lại liên kết file VTP/SPX cho 1 bản đã lưu — dùng khi lần lưu trước bị lệch file
// (vd do đổi cách khớp tuần) mà không cần Excel gốc, vì chỉ sửa tham chiếu, không đụng tới b24/b48/b72 đã đóng băng.
export function relinkSheetReportCarrier(type, weekId, { viettelWeekId, spxWeekId, viettelFrozen, spxFrozen }) {
  const reports = readSheetReports(type)
  const next = reports.map(r => r.id === weekId ? {
    ...r,
    viettelWeekId, spxWeekId,
    // Chỉ ghi đè nếu có truyền vào — tránh xoá mất số liệu đã đóng băng trước đó khi chỉ nối lại tham chiếu
    viettelFrozen: viettelFrozen !== undefined ? viettelFrozen : r.viettelFrozen,
    spxFrozen: spxFrozen !== undefined ? spxFrozen : r.spxFrozen,
  } : r)
  localStorage.setItem(storageKey(type), JSON.stringify(next))
  return next
}

export function renameSheetReport(type, id, label) {
  const next = readSheetReports(type).map(r => r.id === id ? { ...r, label } : r)
  localStorage.setItem(storageKey(type), JSON.stringify(next))
  return next
}

export function removeSheetReport(type, id) {
  const next = readSheetReports(type).filter(r => r.id !== id)
  localStorage.setItem(storageKey(type), JSON.stringify(next))
  return next
}
