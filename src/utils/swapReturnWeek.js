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

function isRealDate(d, m, y) {
  const date = new Date(y, m - 1, d)
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d
}
function dmy(d, m, y) { return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}` }

// Hạn dùng gõ tay hoặc dán từ Excel/PDF về đúng dd/mm/yyyy. Nhận: 26/05/2029, 26-5-2029, 26.05.29,
// 2029-05-26, 26052029, có kèm giờ phía sau. Không đọc được thì trả lại nguyên chữ để người dùng tự sửa.
export function normalizeDateText(text) {
  const raw = String(text ?? '').trim().split(/\s+/)[0] || ''
  if (!raw) return ''
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(raw)
  if (m) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
    return isRealDate(d, mo, y) ? dmy(d, mo, y) : raw
  }
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/.exec(raw) || /^(\d{2})(\d{2})(\d{4})$/.exec(raw)
  if (!m) return raw
  let [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])]
  if (y < 100) y += 2000
  if (mo > 12 && d <= 12) [d, mo] = [mo, d] // dán từ Excel để định dạng Mỹ (tháng/ngày)
  return isRealDate(d, mo, y) ? dmy(d, mo, y) : raw
}
export function isValidDateText(text) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(text || ''))
  return Boolean(m) && isRealDate(Number(m[1]), Number(m[2]), Number(m[3]))
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
