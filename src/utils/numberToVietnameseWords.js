const ONES = ['', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín']
const UNITS = ['', 'nghìn', 'triệu', 'tỷ', 'nghìn tỷ', 'triệu tỷ']

// Đọc 1 nhóm 3 chữ số (0-999) thành chữ. forceHundred: vẫn đọc "không trăm..." dù hàng trăm = 0
// (dùng cho các nhóm không phải nhóm đầu tiên, đúng cách đọc số tiền tiếng Việt — vd 1.005.000 = "một
// triệu không trăm linh năm nghìn").
function readThreeDigits(n, forceHundred) {
  const hundred = Math.floor(n / 100)
  const ten = Math.floor((n % 100) / 10)
  const one = n % 10
  const parts = []

  if (hundred > 0 || forceHundred) {
    parts.push(ONES[hundred] || 'không', 'trăm')
    if (ten === 0 && one > 0) parts.push('linh')
  }

  if (ten >= 2) {
    parts.push(ONES[ten], 'mươi')
    if (one === 1) parts.push('mốt')
    else if (one === 5) parts.push('lăm')
    else if (one > 0) parts.push(ONES[one])
  } else if (ten === 1) {
    parts.push('mười')
    if (one === 1) parts.push('một')
    else if (one === 5) parts.push('lăm')
    else if (one > 0) parts.push(ONES[one])
  } else if (one > 0) {
    parts.push(ONES[one])
  }

  return parts.join(' ')
}

// Đọc 1 số nguyên không âm thành chữ tiếng Việt (không kèm đơn vị tiền tệ).
export function numberToVietnameseWords(value) {
  const num = Math.floor(Math.abs(Number(value) || 0))
  if (num === 0) return 'không'

  const groups = []
  let n = num
  while (n > 0) {
    groups.unshift(n % 1000)
    n = Math.floor(n / 1000)
  }

  const parts = []
  groups.forEach((g, idx) => {
    if (g === 0) return
    const unitIndex = groups.length - 1 - idx
    parts.push(readThreeDigits(g, idx !== 0))
    if (UNITS[unitIndex]) parts.push(UNITS[unitIndex])
  })

  return parts.join(' ').replace(/\s+/g, ' ').trim()
}

function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s
}

// Đọc số tiền (VNĐ) thành chữ theo đúng văn phong biên bản: "Hai trăm bốn mươi lăm nghìn đồng chẵn".
export function soTienBangChu(amount) {
  const num = Math.floor(Math.abs(Number(amount) || 0))
  if (!num) return ''
  return `${capitalize(numberToVietnameseWords(num))} đồng chẵn`
}

// Parse chuỗi số tiền dạng "245 000" / "120,000" / "245000" thành số.
export function parseMoneyString(str) {
  const digits = String(str || '').replace(/[^\d]/g, '')
  return digits ? Number(digits) : 0
}
