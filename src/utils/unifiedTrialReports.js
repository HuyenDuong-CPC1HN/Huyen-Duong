// "Lưu số liệu tuần này" cho tab Gộp kênh (Thử nghiệm) — đóng băng ĐÚNG số đã tính ra màn hình
// (không lưu lại rows thô, đỡ tốn chỗ), giữ thành danh sách lịch sử riêng theo từng file upload
// (Đơn SO / Đơn truyền thống), xem lại được. Storage riêng "unified_trial_reports_*", KHÔNG đụng
// "sheet_reports_*" của Đơn C/DTP/TMĐT — khác 3 tab sản xuất, ở đây KHÔNG tự xoá rows thô sau khi
// lưu: upload tuần mới vẫn ghi đè rows thô như trước giờ, không ảnh hưởng bản đã lưu.
import { opsStore as localStorage } from '../data/workspace'
import { pickCarrierWeekIdByDate, getCarrierWeekRows, computeFrozenNgoaiSan } from '../components/carrierUtils'

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

// Đóng băng kết quả đối soát "đơn ngoại sàn" (4 mốc) tại đúng thời điểm bấm lưu — dùng lại hạ tầng
// đã có sẵn cho Đơn C production (carrierUtils.js), không viết lại logic đối soát.
export function computeNgoaiSanReportStats(carrierKey, referenceDate) {
  const weekId = pickCarrierWeekIdByDate(carrierKey, referenceDate)
  if (!weekId) return null
  const spxRows = getCarrierWeekRows(carrierKey, weekId)
  if (spxRows.length === 0) return null
  return computeFrozenNgoaiSan(carrierKey, spxRows).stats
}
