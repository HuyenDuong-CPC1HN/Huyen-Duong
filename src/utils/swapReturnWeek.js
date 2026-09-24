// Logic thuần (không đụng DOM/Storage) cho tab "Đổi trả hàng": nhận diện cùng/khác lô và gom đợt đổi trả
// theo tuần (Thứ 2 → Chủ nhật) để xuất bộ huỷ cuối tuần.

export const SWAP_RETURN_ACCOUNTANTS = ['Phạm Thị Tuyết Trinh', 'Trần Thị Ái Lâm', 'Lưu Thị Thuỳ', 'Võ Thị Ly', 'Nguyễn Thị Tú Anh', 'Đỗ Thị Bông']
export const DEFAULT_WEEKLY_ACCOUNTANT = 'Lưu Thị Thuỳ'

export function lotStatus(item) {
  const loi = String(item?.loLoi || '').trim()
  const doi = String(item?.loDoi || '').trim()
  if (!loi || !doi) return 'empty'
  return loi === doi ? 'same' : 'diff'
}

function parseIso(iso) {
  const [y, m, d] = String(iso).split('-').map(Number)
  return new Date(y, m - 1, d)
}
export function toIsoDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
export function addDays(iso, days) {
  const d = parseIso(iso)
  d.setDate(d.getDate() + days)
  return toIsoDate(d)
}
export function mondayOf(iso) {
  const d = parseIso(iso)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return toIsoDate(d)
}
export function isoWeekNumber(iso) {
  const d = parseIso(iso)
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7))
  const week1 = new Date(d.getFullYear(), 0, 4)
  return 1 + Math.round(((d - week1) / 864e5 - 3 + ((week1.getDay() + 6) % 7)) / 7)
}
export function isInWeek(iso, weekStart) {
  return Boolean(iso) && iso >= weekStart && iso <= addDays(weekStart, 6)
}
export function formatDmy(iso) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

export function recordsOfWeek(records, weekStart) {
  return records
    .filter(r => isInWeek(r.date, weekStart))
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date) || String(a.createdAt || '').localeCompare(String(b.createdAt || '')))
}

// Bộ huỷ cuối tuần gồm MỌI mặt hàng lỗi trong tuần, cả cùng lô lẫn khác lô.
export function weeklyItems(records, weekStart) {
  return recordsOfWeek(records, weekStart).flatMap(r =>
    (r.items || []).map(item => ({ ...item, customerName: r.customerName, date: r.date })),
  )
}

// BB xác minh nhập lại kho chỉ cần cho các dòng khác lô, mỗi khách hàng 1 biên bản.
export function nhapLaiItems(record) {
  return (record?.items || []).filter(item => lotStatus(item) === 'diff')
}
