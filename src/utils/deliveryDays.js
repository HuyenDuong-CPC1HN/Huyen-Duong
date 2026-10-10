// Parse ngày dd/mm/yyyy hoặc dd/mm/yyyy HH:mm → Date (chỉ lấy ngày)
export function parseDate(str) {
  if (!str) return null
  const s = String(str).trim()
  const re = /(\d{1,2})[/-](\d{1,2})[/-](\d{4})/
  const m = re.exec(s)
  if (!m) return null
  return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]))
}

// Số ngày chênh lệch giữa Ngày tạo kiện và Ngày giao hàng (chỉ tính ngày, bỏ qua giờ)
function diffDays(row) {
  const d1 = parseDate(row['Ngày tạo kiện'])
  const d2 = parseDate(row['Ngày giao hàng'])
  if (!d1 || !d2) return null
  return Math.round((d2 - d1) / (1000 * 60 * 60 * 24))
}

const hasTanThinh = v => /t(â|a)n th(ị|i)nh/.test(String(v || '').normalize('NFC').toLowerCase())

// Đối tác vận chuyển "Tân Thịnh" là đơn Giao hàng trực tiếp, luôn tính ≤ 24 giờ. Chỉ áp dụng cho đơn có Ngày tạo
// kiện từ tuần 05/10/2026 trở đi — các tuần trước giữ nguyên cách tính cũ (khi đó đơn Tân Thịnh nằm trong Chành xe).
export const TAN_THINH_DOI_TAC_FROM = new Date(2026, 9, 5)
export function isTanThinhDoiTac(row) {
  if (!hasTanThinh(row['Đối tác vận chuyển'])) return false
  const d = parseDate(row['Ngày tạo kiện'])
  return !d || d >= TAN_THINH_DOI_TAC_FROM
}

// Người đặt hàng chứa "Tân Thịnh" (hoặc đối tác Tân Thịnh, xem trên) luôn tính là giao 24 giờ, bất kể chênh lệch ngày thực tế
function isTanThinh(row) {
  return hasTanThinh(row['Người đặt hàng']) || isTanThinhDoiTac(row)
}

// Phân loại mốc giao hàng trực tiếp: '24' | '48' | '72' | 'khac'
export function deliveryBucket(row) {
  if (isTanThinh(row)) return '24'

  const diff = diffDays(row)
  if (diff === 0 || diff === 1) return '24'
  if (diff === 2) return '48'
  if (diff !== null && diff >= 3) return '72'
  return 'khac'
}
