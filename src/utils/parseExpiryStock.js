import * as XLSX from 'xlsx'

// File "Báo cáo tổng hợp nhập xuất tồn theo kho" xuất từ hệ thống kho có vài dòng tiêu đề phía trên
// bảng dữ liệu thật (tên báo cáo, khoảng ngày...) nên không thể coi dòng 1 là header như ExcelUpload.jsx —
// phải dò dòng chứa "Mã vật tư" để tìm đúng dòng tiêu đề cột.
const REQUIRED_HEADER = 'Mã vật tư'

const COLUMN_MAP = {
  'Mã vật tư': 'maVatTu',
  'Tên vật tư': 'tenVatTu',
  'Mã kho': 'maKho',
  'Đvt': 'dvt',
  'Mã lô': 'maLo',
  'Hạn dùng': 'hanDung',
  'Tồn đầu': 'tonDau',
  'Sl nhập': 'slNhap',
  'Sl xuất': 'slXuat',
  'Tồn cuối': 'tonCuoi',
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

// Đọc toàn bộ workbook, trả về danh sách vật tư (kể cả tồn = 0) đã chuẩn hoá kiểu dữ liệu.
export function parseExpiryStockWorkbook(arrayBuffer) {
  const wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: true })
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
// cận dưới 6 tháng / an toàn (>6 tháng) / không rõ hạn (thiếu dữ liệu hạn dùng trên file).
export function classifyExpiry(hanDung, referenceDate = new Date()) {
  if (!hanDung) return 'unknown'
  const today = startOfDay(referenceDate)
  const expiry = startOfDay(new Date(hanDung))
  if (expiry < today) return 'expired'
  if (expiry < addMonths(today, 3)) return 'near3'
  if (expiry < addMonths(today, 6)) return 'near6'
  return 'safe'
}

// Số ngày còn lại tới hạn dùng (âm nếu đã quá hạn), null nếu không rõ hạn dùng.
export function daysUntil(hanDung, referenceDate = new Date()) {
  if (!hanDung) return null
  const today = startOfDay(referenceDate)
  const expiry = startOfDay(new Date(hanDung))
  return Math.round((expiry - today) / 86400000)
}
