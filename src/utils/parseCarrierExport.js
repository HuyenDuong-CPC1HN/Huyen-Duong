import * as XLSX from 'xlsx'
import { parseDate } from './deliveryDays'

// Các cột cần giữ lại từ file xuất Viettel Post / SPX Express
const KEEP_COLUMNS = [
  'Mã Vận Đơn', 'Mã đơn hàng', 'Ngày tạo', 'Người nhận', 'Địa chỉ nhận',
  'ĐT Nhận', 'Trạng Thái', 'Lý do', 'Đơn chuyển hoàn', 'Ngày chuyển trạng thái',
]

const REQUIRED_HEADER_CELL = 'Mã Vận Đơn'

// Đọc file Excel xuất từ Viettel Post/SPX — tự tìm dòng tiêu đề thật (bỏ qua phần đầu là tên công ty)
export function parseCarrierFile(arrayBuffer) {
  const wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: true })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false, dateNF: 'dd/mm/yyyy HH:mm:ss' })

  const headerIdx = rows.findIndex(r => r.some(cell => String(cell).trim() === REQUIRED_HEADER_CELL))
  if (headerIdx === -1) throw new Error('Không tìm thấy dòng tiêu đề "Mã Vận Đơn" trong file.')

  const header = rows[headerIdx].map(h => String(h).trim())
  const colIdx = Object.fromEntries(KEEP_COLUMNS.map(c => [c, header.indexOf(c)]))

  const data = rows.slice(headerIdx + 1)
    .filter(r => r[colIdx['Mã Vận Đơn']])
    .map(r => Object.fromEntries(KEEP_COLUMNS.map(c => [c, colIdx[c] >= 0 ? String(r[colIdx[c]] ?? '').trim() : ''])))

  return data
}

const GIAO_LAI_STATUSES = ['Chờ phát lại', 'Phát tiếp']
const DELIVERED_STATUS = 'Giao thành công'

function diffDaysBetween(fromStr, toStr) {
  const d1 = parseDate(fromStr)
  const d2 = parseDate(toStr)
  if (!d1 || !d2) return null
  return Math.round((d2 - d1) / (1000 * 60 * 60 * 24))
}

// Thống kê: 24h / 48h / 72h / Đang vận chuyển / Giao lại lần 2 / Hoàn hàng
export function computeCarrierStats(rows) {
  const result = { total: rows.length, '24h': 0, '48h': 0, '72h': 0, dangVanChuyen: 0, giaoLai: 0, hoanHang: 0 }

  for (const row of rows) {
    const chuyenHoan = row['Đơn chuyển hoàn'].toLowerCase() === 'x'
    if (chuyenHoan) { result.hoanHang++; continue }

    const status = row['Trạng Thái']
    if (GIAO_LAI_STATUSES.includes(status)) { result.giaoLai++; continue }

    if (status !== DELIVERED_STATUS) { result.dangVanChuyen++; continue }

    const diff = diffDaysBetween(row['Ngày tạo'], row['Ngày chuyển trạng thái'])
    if (diff === 0 || diff === 1) result['24h']++
    else if (diff === 2) result['48h']++
    else result['72h']++ // >= 3 ngày hoặc không xác định được ngày
  }

  return result
}
