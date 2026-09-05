import * as XLSX from 'xlsx'
import { parseDate as parseDateDMY } from './deliveryDays'

// SPX xuất ngày theo yyyy-mm-dd HH:mm, Viettel xuất theo dd/mm/yyyy — parse cả 2 (chỉ lấy ngày)
function parseDate(str) {
  if (!str) return null
  const s = String(str).trim()
  const ymd = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (ymd) return new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]))
  return parseDateDMY(s)
}

// Parse đầy đủ ngày + giờ:phút, dùng để tính chênh lệch chính xác theo giờ (cho SPX)
function parseDateTime(str) {
  if (!str) return null
  const s = String(str).trim()
  const ymd = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})[ T]?(\d{1,2}):(\d{1,2})/)
  if (ymd) return new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]), Number(ymd[4]), Number(ymd[5]))
  const dmy = s.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})[ T]?(\d{1,2}):(\d{1,2})/)
  if (dmy) return new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]), Number(dmy[4]), Number(dmy[5]))
  return parseDate(str)
}

const VIETTEL_COLUMNS = [
  'Mã Vận Đơn', 'Mã đơn hàng', 'Ngày tạo', 'Người nhận', 'Địa chỉ nhận',
  'ĐT Nhận', 'Tên hàng', 'Trạng Thái', 'Lý do', 'Đơn chuyển hoàn', 'Ngày chuyển trạng thái',
]

const SPX_COLUMNS = [
  'Mã vận đơn', 'Thời gian tạo đơn', 'Thời gian lấy hàng/gửi hàng', 'Thời gian giao hàng', 'Trạng thái hiện tại',
  'Tên người nhận', 'Số điện thoại người nhận', 'Mã khách hàng',
  'Thu COD (Có/Không)', 'Số tiền COD', 'Giá trị đơn hàng',
]

// Viettel: đối chiếu "Mã Vận Đơn" (file VTP xuất) với cột "Mã vận đơn" của dữ liệu nội bộ (Đơn C/DTP)
// — cả 2 đều là mã tracking number do Viettel Post cấp, khớp trực tiếp 1-1.
// Nếu nhiều dòng nội bộ dùng chung 1 Mã vận đơn (đơn CB gộp), số dòng khớp = số đơn thật sự.
// Không đối chiếu được (chưa có trong dữ liệu nội bộ) thì dùng phỏng đoán cũ dựa vào "Mã đơn hàng" (CB = 2).
function viettelOrderCount(row, config, lookupMap) {
  const trackingCode = String(row[config.requiredHeaderCell] || '').trim().toUpperCase()
  const matched = lookupMap?.get(trackingCode)
  if (matched) return matched

  const raw = row[config.orderKey] || ''
  const parts = raw.split(',').map(s => s.trim()).filter(Boolean)
  if (parts.length === 0) return 1
  return parts.reduce((sum, p) => sum + (p.toUpperCase().includes('CB') ? 2 : 1), 0)
}

// SPX: số lần xuất hiện "FB" trong Mã khách hàng = số đơn ghép trong dòng đó
function spxOrderCount(row, config) {
  const raw = row[config.orderKey] || ''
  const matches = raw.match(/FB/gi)
  return matches ? matches.length : 1
}

// Xây bảng đối chiếu: mỗi giá trị cột "Mã vận đơn" trong dữ liệu nội bộ xuất hiện bao nhiêu dòng
// (mỗi dòng nội bộ = 1 đơn nhỏ thật sự, dùng để biết chính xác 1 mã CB gộp bao nhiêu đơn)
export function buildInternalOrderLookup(internalData, internalKey = 'Mã vận đơn') {
  const map = new Map()
  for (const row of internalData || []) {
    const code = String(row[internalKey] || '').trim().toUpperCase()
    if (!code) continue
    map.set(code, (map.get(code) || 0) + 1)
  }
  return map
}

// Đối soát: so khớp "Mã Vận Đơn" (file VTP) với "Mã vận đơn" (nội bộ) — cùng là mã tracking number
// missingInVtp: đơn nội bộ đã gán Viettel Post nhưng KHÔNG thấy trong file VTP (chưa gửi / chưa cập nhật)
// extraInVtp: mã trong file VTP nhưng KHÔNG khớp bất kỳ đơn nội bộ nào (sai mã / dữ liệu tuần khác)
export function reconcileViettelOrders(vtpRows, internalData, trackingKey = 'Mã Vận Đơn', internalKey = 'Mã vận đơn') {
  const vtpCodes = new Set()
  for (const row of vtpRows || []) {
    const code = String(row[trackingKey] || '').trim().toUpperCase()
    if (code) vtpCodes.add(code)
  }

  const missingInVtp = []
  const seenInternal = new Set()
  for (const row of internalData || []) {
    const code = String(row[internalKey] || '').trim().toUpperCase()
    if (!code || seenInternal.has(code)) continue
    seenInternal.add(code)
    if (!vtpCodes.has(code)) missingInVtp.push({ code, row })
  }

  const extraInVtp = [...vtpCodes].filter(c => !seenInternal.has(c))

  return {
    internalTotal: internalData?.length || 0,
    vtpUniqueCodes: vtpCodes.size,
    missingInVtp,
    extraInVtp,
  }
}

const CARRIER_CONFIG = {
  viettel: {
    columns: VIETTEL_COLUMNS,
    requiredHeaderCell: 'Mã Vận Đơn',
    orderKey: 'Mã đơn hàng',
    statusKey: 'Trạng Thái',
    createdKey: 'Ngày tạo',
    deliveredAtKey: 'Ngày chuyển trạng thái',
    deliveredStatus: 'Giao thành công',
    // "Chờ xử lý" kèm cờ Đơn chuyển hoàn=x: đơn mới được đánh dấu chuyển hoàn, CHƯA thực sự hoàn — tính
    // vào Đang giao hàng (chờ xử lý tiếp), không phải Hoàn hàng.
    giaoLaiStatuses: ['Chờ phát lại', 'Phát tiếp', 'Chờ xử lý'],
    hoanHangStatuses: [],
    // Đơn shop tự huỷ lấy — không phải đơn thực sự cần giao, loại hẳn khỏi tổng
    cancelStatuses: ['Shop hủy lấy', 'Shop huỷ lấy'],
    // "Tồn - Lấy không thành công": vẫn là đơn thật, chỉ là chưa lấy được — tính vào Chờ lấy, không loại khỏi tổng
    pickupFailStatuses: ['Tồn - Lấy không thành công'],
    // "Đang lấy hàng": đối chiếu Mã Vận Đơn (file VTP) với cột "Mã vận đơn VT" trong file
    // "Chờ giao Logistics" upload thêm — khớp thì tính vào Đang vận chuyển, không khớp thì bỏ qua
    holdStatuses: ['Đang lấy hàng'],
    // Chỉ tính "Hoàn hàng" khi Trạng Thái xác nhận đã/đang thực sự chuyển hoàn ("Đang chuyển hoàn"/"Đã trả...") —
    // không dựa vào cờ "Đơn chuyển hoàn" nữa vì cờ này có thể bật trước khi Trạng Thái cập nhật theo (vd còn
    // "Chờ xử lý", xem giaoLaiStatuses ở trên) hoặc ngược lại Trạng Thái đã "Đang chuyển hoàn" mà cờ chưa bật.
    isHoanHang: row => {
      const status = row['Trạng Thái']
      return status === 'Đang chuyển hoàn' || status.includes('Đã trả')
    },
    orderCounter: viettelOrderCount,
  },
  spx: {
    columns: SPX_COLUMNS,
    requiredHeaderCell: 'Mã vận đơn',
    orderKey: 'Mã khách hàng',
    statusKey: 'Trạng thái hiện tại',
    createdKey: 'Thời gian tạo đơn',
    deliveredAtKey: 'Thời gian giao hàng',
    deliveredStatus: 'Đã giao hàng',
    // "Đang giao hàng" tính vào Giao lại lần 2 (theo yêu cầu); "Đang vận chuyển" không nằm trong danh sách này
    // nên vẫn rơi vào nhánh mặc định (Đang vận chuyển) như cũ.
    giaoLaiStatuses: ['Chờ giao lại', 'Đang giao hàng'],
    hoanHangStatuses: ['Đang trả hàng', 'Đã trả hàng'],
    // Đơn bị huỷ trước khi giao — không phải đơn thực sự cần giao, loại hẳn khỏi tổng
    cancelStatuses: ['Đã hủy', 'Đã huỷ'],
    // "Lấy hàng không thành công" / "Đang chờ lấy hàng": luôn tính vào "Chờ lấy" (đơn vẫn chưa lấy được),
    // không cần đối chiếu Mã vận đơn nội bộ (khác các trạng thái khác)
    pickupFailStatuses: ['Lấy hàng không thành công', 'Đang chờ lấy hàng'],
    isHoanHang: () => false,
    orderCounter: spxOrderCount,
    useHourPrecision: true, // SPX có giờ:phút chi tiết, tính chênh lệch theo giờ thay vì làm tròn ngày
  },
}

// Đọc file Excel xuất từ Viettel Post/SPX — tự tìm dòng tiêu đề thật (bỏ qua phần đầu là tên công ty)
export function parseCarrierFile(arrayBuffer, carrierType = 'viettel') {
  const config = CARRIER_CONFIG[carrierType]
  const wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: true })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false, dateNF: 'dd/mm/yyyy HH:mm:ss' })

  const headerIdx = rows.findIndex(r => r.some(cell => String(cell).trim().toLowerCase() === config.requiredHeaderCell.toLowerCase()))
  if (headerIdx === -1) throw new Error(`Không tìm thấy dòng tiêu đề "${config.requiredHeaderCell}" trong file.`)

  const header = rows[headerIdx].map(h => String(h).trim())
  const headerLower = header.map(h => h.toLowerCase())
  const colIdx = Object.fromEntries(config.columns.map(c => [c, headerLower.indexOf(c.toLowerCase())]))

  const data = rows.slice(headerIdx + 1)
    .filter(r => r[colIdx[config.requiredHeaderCell]])
    .map(r => Object.fromEntries(config.columns.map(c => [c, colIdx[c] >= 0 ? String(r[colIdx[c]] ?? '').trim() : ''])))

  return data
}

export function getCarrierColumns(carrierType = 'viettel') {
  return CARRIER_CONFIG[carrierType].columns
}

// Đơn đang ở trạng thái "chờ lấy hàng" (cần đối chiếu với file Chờ giao Logistics)
export function isHoldStatusRow(row, carrierType = 'viettel') {
  const config = CARRIER_CONFIG[carrierType]
  return !!config.holdStatuses?.includes(row[config.statusKey])
}

export function getTrackingCode(row, carrierType = 'viettel') {
  const config = CARRIER_CONFIG[carrierType]
  return String(row[config.requiredHeaderCell] || '').trim().toUpperCase()
}

// Đơn bị huỷ trước khi giao (loại hẳn khỏi mọi thống kê/đối soát thời gian)
export function isCancelledStatus(row, carrierType = 'viettel') {
  const config = CARRIER_CONFIG[carrierType]
  return !!config.cancelStatuses?.includes(row[config.statusKey])
}

// Đơn đã/đang chuyển hoàn — tính là "Hoàn hàng", không tính vào SLA giao đúng/trễ hạn
export function isHoanHangStatus(row, carrierType = 'viettel') {
  const config = CARRIER_CONFIG[carrierType]
  const status = row[config.statusKey]
  return config.hoanHangStatuses.includes(status) || config.isHoanHang(row)
}

function diffDaysBetween(fromStr, toStr) {
  const d1 = parseDate(fromStr)
  const d2 = parseDate(toStr)
  if (!d1 || !d2) return null
  return Math.round((d2 - d1) / (1000 * 60 * 60 * 24))
}

// Chênh lệch chính xác theo giờ (không làm tròn ngày) — dùng cho SPX
function diffHoursBetween(fromStr, toStr) {
  const d1 = parseDateTime(fromStr)
  const d2 = parseDateTime(toStr)
  if (!d1 || !d2) return null
  return (d2 - d1) / (1000 * 60 * 60)
}

// Xây tập mã tracking từ 1 cột bất kỳ của file đối chiếu phụ (vd "Mã vận đơn VT" trong file Chờ giao Logistics)
export function buildTrackingSet(rows, key) {
  const set = new Set()
  for (const row of rows || []) {
    const code = String(row[key] || '').trim().toUpperCase()
    if (code) set.add(code)
  }
  return set
}

// Ghi chú tay cho đơn "Đang lấy hàng" chưa khớp file Chờ giao Logistics — nếu ghi đúng 1 trong các giá trị
// này thì vẫn tính vào "Đang vận chuyển" thay vì bị loại khỏi tổng (xem computeCarrierStats)
export const HOLD_NOTE_TRANSIT_VALUES = ['Đang vận chuyển', 'Đã lấy hàng']

// Thống kê: 24h / 48h / 72h / Đang vận chuyển / Giao lại lần 2 / Hoàn hàng
// lookupMap: bảng đối chiếu Mã vận đơn nội bộ (chỉ áp dụng cho Viettel) — xem buildInternalOrderLookup
// holdLookupSet: tập Mã vận đơn từ file "Chờ giao Logistics" — dùng để đối chiếu trạng thái "Đang lấy hàng"
// holdNotes: ghi chú tay theo mã vận đơn (object {mã: ghi chú}) cho đơn "Đang lấy hàng" chưa khớp holdLookupSet
export function computeCarrierStats(rows, carrierType = 'viettel', lookupMap = null, holdLookupSet = null, holdNotes = null) {
  const config = CARRIER_CONFIG[carrierType]
  const result = { total: 0, '24h': 0, '48h': 0, '72h': 0, dangVanChuyen: 0, giaoLai: 0, hoanHang: 0, choLay: 0 }

  for (const row of rows) {
    const status = row[config.statusKey]
    // Đơn bị huỷ trước khi giao — không phải đơn thực sự cần giao, loại hẳn khỏi tổng
    if (config.cancelStatuses?.includes(status)) continue

    // "Lấy hàng không thành công": luôn tính vào Chờ lấy, không cần khớp Mã vận đơn với dữ liệu nội bộ
    if (config.pickupFailStatuses?.includes(status)) {
      const count = config.orderCounter(row, config, lookupMap)
      result.total += count
      result.choLay += count
      continue
    }

    // "Đang lấy hàng": nếu tính năng đối chiếu Chờ giao Logistics đang được dùng (có holdLookupSet) thì
    // khớp Mã Vận Đơn → tính vào mục riêng "Chờ lấy". Không khớp thì xem ghi chú tay — nếu ghi "Đang vận
    // chuyển"/"Đã lấy hàng" thì tính vào "Đang vận chuyển", chưa ghi/ghi khác thì không tính (cần kiểm tra tay).
    // Chưa dùng tính năng này (holdLookupSet null, vd tab Đơn C) thì vẫn tính bình thường như trước.
    if (config.holdStatuses?.includes(status) && holdLookupSet) {
      const code = String(row[config.requiredHeaderCell] || '').trim().toUpperCase()
      const count = config.orderCounter(row, config, lookupMap)
      if (holdLookupSet.has(code)) {
        result.total += count
        result.choLay += count
        continue
      }
      const note = String(holdNotes?.[code] || '').trim()
      if (HOLD_NOTE_TRANSIT_VALUES.includes(note)) {
        result.total += count
        result.dangVanChuyen += count
      }
      continue
    }

    const count = config.orderCounter(row, config, lookupMap)
    result.total += count

    if (config.isHoanHang(row)) { result.hoanHang += count; continue }

    if (config.hoanHangStatuses.includes(status)) { result.hoanHang += count; continue }
    if (config.giaoLaiStatuses.includes(status)) { result.giaoLai += count; continue }

    if (status !== config.deliveredStatus) { result.dangVanChuyen += count; continue }

    if (config.useHourPrecision) {
      const hours = diffHoursBetween(row[config.createdKey], row[config.deliveredAtKey])
      if (hours !== null && hours <= 24) result['24h'] += count
      else if (hours !== null && hours <= 48) result['48h'] += count
      else result['72h'] += count // > 48 giờ hoặc không xác định được thời gian
    } else {
      const diff = diffDaysBetween(row[config.createdKey], row[config.deliveredAtKey])
      if (diff === 0 || diff === 1) result['24h'] += count
      else if (diff === 2) result['48h'] += count
      else result['72h'] += count // >= 3 ngày hoặc không xác định được ngày
    }
  }

  return result
}
