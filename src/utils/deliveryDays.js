// Parse ngày dd/mm/yyyy hoặc dd/mm/yyyy HH:mm → Date (chỉ lấy ngày)
export function parseDate(str) {
  if (!str) return null
  const s = String(str).trim()
  const m = s.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/)
  if (!m) return null
  return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]))
}

// Số ngày chênh lệch giữa Ngày tạo kiện và Ngày giao hàng (chỉ tính ngày, bỏ qua giờ)
export function diffDays(row) {
  const d1 = parseDate(row['Ngày tạo kiện'])
  const d2 = parseDate(row['Ngày giao hàng'])
  if (!d1 || !d2) return null
  return Math.round((d2 - d1) / (1000 * 60 * 60 * 24))
}

// Người đặt hàng chứa "Tân Thịnh" luôn tính là giao 24 giờ, bất kể chênh lệch ngày thực tế
function isTanThinh(row) {
  return (row['Người đặt hàng'] || '').toLowerCase().includes('tân thịnh')
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
