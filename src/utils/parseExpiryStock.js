import * as XLSX from 'xlsx'

// File "Báo cáo tổng hợp nhập xuất tồn theo kho" xuất từ hệ thống kho có vài dòng tiêu đề phía trên
// bảng dữ liệu thật (tên báo cáo, khoảng ngày...) nên không thể coi dòng 1 là header như ExcelUpload.jsx —
// phải dò dòng chứa "Mã vật tư" để tìm đúng dòng tiêu đề cột.
const REQUIRED_HEADER = 'Mã vật tư'

// Hệ thống kho còn xuất file "Excel XML 2003" (đuôi .xml, mở bằng Excel được). SheetJS đọc được nhưng phải đưa vào dạng
// chữ UTF-8, nếu đưa mảng byte thì tiếng Việt bị đọc sai bảng mã và không tìm thấy cột "Mã vật tư".
function readWorkbook(arrayBuffer) {
  const bytes = arrayBuffer instanceof Uint8Array ? arrayBuffer : new Uint8Array(arrayBuffer)
  const head = new TextDecoder('utf-8').decode(bytes.slice(0, 200)).replace(/^\uFEFF/, '').trimStart()
  if (head.startsWith('<?xml') || head.startsWith('<Workbook')) {
    return XLSX.read(new TextDecoder('utf-8').decode(bytes), { type: 'string', cellDates: true })
  }
  return XLSX.read(arrayBuffer, { type: 'array', cellDates: true })
}

const COLUMN_MAP = {
  'Mã vật tư': 'maVatTu',
  'Tên vật tư': 'tenVatTu',
  'Mã kho': 'maKho',
  'Đvt': 'dvt',
  'Mã lô': 'maLo',
  'Tên lô': 'tenLo',
  'Hạn dùng': 'hanDung',
  'Tồn đầu': 'tonDau',
  'Sl nhập': 'slNhap',
  'Sl xuất': 'slXuat',
  'Tồn cuối': 'tonCuoi',
}

// Hàng cận date / chậm luân chuyển theo dõi 2 loại đơn, mỗi loại là 1 phần mềm kho riêng (mã kho có thể trùng nhau):
//  - Kho C: các kho 020101, 020102, 020105 (kho online miền Nam), 020106; các kho còn lại bị loại khỏi theo dõi.
//  - Kho DTP: chỉ kho 020105 (không liên quan kho 020105 của Kho C).
export const EXPIRY_ENTITIES = {
  donC: { label: 'Kho C', kho: ['020101', '020102', '020105', '020106'] },
  donDTP: { label: 'Kho DTP', kho: ['020105'] },
}

// File của Kho DTP có mã vật tư 2 chữ cái trước số (MP02295, TH00893...), Kho C 1 chữ cái (A01338, J00559...).
export function detectExpiryEntity(rows) {
  const codes = rows.map(r => r.maVatTu).filter(Boolean)
  if (codes.length === 0) return 'donC'
  const twoLetters = codes.filter(c => /^[A-Za-z]{2}\d/.test(c)).length
  return twoLetters / codes.length >= 0.8 ? 'donDTP' : 'donC'
}

export function filterByExpiryEntity(rows, entity) {
  const allowed = EXPIRY_ENTITIES[entity]?.kho
  return allowed ? rows.filter(r => allowed.includes(r.maKho)) : rows
}

function toNumber(v) {
  if (v === null || v === undefined || v === '') return 0
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

// Cột "Hạn dùng" đọc bằng raw:true + cellDates:true ra Date object thật — giống nguyên tắc ở
// ExcelUpload.jsx, không tin chuỗi hiển thị vì có thể lệch định dạng ngày Mỹ/Việt.
function toIsoDate(v) {
  if (!v) return null
  if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 10)
  if (typeof v === 'string') {
    const m = v.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
    if (m) {
      const [, d, mo, y] = m
      const dt = new Date(Number(y), Number(mo) - 1, Number(d))
      if (!isNaN(dt)) return dt.toISOString().slice(0, 10)
    }
  }
  return null
}

// Vài dòng đầu file có dòng dạng "Từ ngày 01/06/2026 đến ngày 10/09/2026..." khai khoảng thời gian báo cáo
// bao phủ — dùng để tính "hàng chậm luân chuyển" (Sl nhập/Sl xuất = 0 trong SUỐT khoảng này, xem
// isSlowMoving bên dưới): khoảng báo cáo càng dài, kết luận "không phát sinh > N ngày" càng đáng tin.
const DATE_RANGE_RE = /Từ ngày\s+(\d{1,2})\/(\d{1,2})\/(\d{4})\s+đến ngày\s+(\d{1,2})\/(\d{1,2})\/(\d{4})/i

// Dựng thẳng bằng Date.UTC (không qua giờ địa phương) — nếu dùng "new Date(y, m-1, d)" (giờ địa phương)
// rồi .toISOString(), múi giờ dương (vd Việt Nam +7, đúng múi giờ trình duyệt người dùng sẽ chạy) sẽ lùi
// lại đúng 1 ngày khi cắt về "yyyy-mm-dd" (nửa đêm giờ địa phương = chiều hôm trước theo UTC).
function toIsoFromParts(d, m, y) {
  return new Date(Date.UTC(Number(y), Number(m) - 1, Number(d))).toISOString().slice(0, 10)
}

// Trả về { tuNgay, denNgay (ISO yyyy-mm-dd), soNgay } đọc từ dòng "Từ ngày ... đến ngày ..." ở đầu file,
// hoặc null nếu không tìm thấy (file có thể xuất từ nguồn/đợt khác không có dòng này).
export function parseReportDateRange(arrayBuffer) {
  const wb = readWorkbook(arrayBuffer)
  const ws = wb.Sheets[wb.SheetNames[0]]
  const grid = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null })
  for (const row of grid) {
    for (const cell of row) {
      if (typeof cell !== 'string') continue
      const m = DATE_RANGE_RE.exec(cell)
      if (!m) continue
      const [, d1, mo1, y1, d2, mo2, y2] = m
      const tuNgay = toIsoFromParts(d1, mo1, y1)
      const denNgay = toIsoFromParts(d2, mo2, y2)
      const soNgay = Math.round((new Date(denNgay) - new Date(tuNgay)) / 86400000)
      return { tuNgay, denNgay, soNgay }
    }
  }
  return null
}

// "Hàng chậm luân chuyển" = còn tồn kho nhưng không phát sinh Sl nhập lẫn Sl xuất trong SUỐT khoảng thời
// gian file báo cáo (parseReportDateRange) — không tính hàng đã hết tồn (tonCuoi = 0, không còn gì để
// luân chuyển sang chi nhánh khác).
export function isSlowMoving(row) {
  return row.tonCuoi > 0 && row.slNhap === 0 && row.slXuat === 0
}

// Đọc toàn bộ workbook, trả về danh sách vật tư (kể cả tồn = 0) đã chuẩn hoá kiểu dữ liệu.
export function parseExpiryStockWorkbook(arrayBuffer) {
  const wb = readWorkbook(arrayBuffer)
  const ws = wb.Sheets[wb.SheetNames[0]]
  const grid = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null })

  const headerRowIndex = grid.findIndex(row =>
    row.some(cell => typeof cell === 'string' && cell.trim() === REQUIRED_HEADER)
  )
  if (headerRowIndex === -1) {
    throw new Error('Không tìm thấy cột "Mã vật tư" trong file. Vui lòng kiểm tra lại file xuất từ hệ thống kho.')
  }

  const fieldByCol = grid[headerRowIndex].map(cell => {
    const key = typeof cell === 'string' ? cell.trim() : cell
    return COLUMN_MAP[key] || null
  })

  const rows = []
  for (let i = headerRowIndex + 1; i < grid.length; i++) {
    const raw = grid[i]
    if (!raw || raw.every(cell => cell === null || cell === '')) continue
    const record = {}
    fieldByCol.forEach((field, col) => { if (field) record[field] = raw[col] })
    if (!record.maVatTu) continue
    rows.push({
      maVatTu: String(record.maVatTu).trim(),
      tenVatTu: record.tenVatTu ? String(record.tenVatTu).trim() : '',
      maKho: record.maKho ? String(record.maKho).trim() : '',
      dvt: record.dvt ? String(record.dvt).trim() : '',
      maLo: record.maLo ? String(record.maLo).trim() : '',
      tenLo: record.tenLo ? String(record.tenLo).trim() : '',
      hanDung: toIsoDate(record.hanDung),
      tonDau: toNumber(record.tonDau),
      slNhap: toNumber(record.slNhap),
      slXuat: toNumber(record.slXuat),
      tonCuoi: toNumber(record.tonCuoi),
    })
  }
  return rows
}

function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }
function addMonths(d, n) { const x = new Date(d); x.setMonth(x.getMonth() + n); return x }

// Phân loại 1 hạn dùng (chuỗi ISO yyyy-mm-dd) theo mốc "hôm nay": hết hạn / cận dưới 3 tháng /
// cận dưới 6 tháng / cận hạn 6 đến dưới 12 tháng (chỉ để cảnh báo luân chuyển, không vào sheet "Cận date"
// của báo cáo) / an toàn (từ 12 tháng) / không rõ hạn (thiếu dữ liệu hạn dùng trên file).
export function classifyExpiry(hanDung, referenceDate = new Date()) {
  if (!hanDung) return 'unknown'
  const today = startOfDay(referenceDate)
  const expiry = startOfDay(new Date(hanDung))
  if (expiry < today) return 'expired'
  if (expiry < addMonths(today, 3)) return 'near3'
  if (expiry < addMonths(today, 6)) return 'near6'
  if (expiry < addMonths(today, 12)) return 'near12'
  return 'safe'
}

// Sheet "Cận date" của báo cáo = hết hạn + cận dưới 3 tháng + cận dưới 6 tháng.
export const CAN_DATE_BUCKETS = ['expired', 'near3', 'near6']

// Số tháng tròn giữa 2 ngày, cùng cách tính với DATEDIF(from, to, "m") của Excel.
function wholeMonthsBetween(from, to) {
  let months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth())
  if (to.getDate() < from.getDate()) months -= 1
  return months
}

// "Tuổi thuốc (Tháng)" như file báo cáo mẫu: DATEDIF(TODAY(), Hạn dùng, "m"). Hàng đã hết hạn cho số âm
// (DATEDIF của Excel báo lỗi khi hạn dùng < hôm nay). null nếu không rõ hạn dùng.
export function drugAgeMonths(hanDung, referenceDate = new Date()) {
  if (!hanDung) return null
  const today = startOfDay(referenceDate)
  const expiry = startOfDay(new Date(hanDung))
  return expiry >= today ? wholeMonthsBetween(today, expiry) : -wholeMonthsBetween(expiry, today)
}

// Số ngày còn lại tới hạn dùng (âm nếu đã quá hạn), null nếu không rõ hạn dùng.
export function daysUntil(hanDung, referenceDate = new Date()) {
  if (!hanDung) return null
  const today = startOfDay(referenceDate)
  const expiry = startOfDay(new Date(hanDung))
  return Math.round((expiry - today) / 86400000)
}
