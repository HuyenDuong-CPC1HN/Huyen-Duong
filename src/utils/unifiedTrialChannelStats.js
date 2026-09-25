// Tính số liệu cho 1 kênh (Đơn C hoặc Đơn DTP) trong tab "Gộp kênh (Thử nghiệm)" — dùng chung cho cả
// hiển thị trực tiếp (UnifiedTrialChannelDetail.jsx) lẫn lúc "Lưu số liệu tuần này" (đóng băng đúng số
// đang hiển thị, không tính lệch giữa 2 chỗ).
import { partnerType } from './partnerType'
import { deliveryBucket } from './deliveryDays'
import { getCarrierFileTotal, pickCarrierWeekIdByDate, snapshotCarrierLookup } from '../components/carrierUtils'

export function calcTrucTiepStats(rows) {
  const result = { '24h': 0, '48h': 0, '72h': 0, khac: 0 }
  for (const row of rows) {
    const bucket = deliveryBucket(row)
    if (bucket === '24') result['24h']++
    else if (bucket === '48') result['48h']++
    else if (bucket === '72') result['72h']++
    else result.khac++
  }
  return result
}

export function computeChannelSnapshot({ data, channelKey, khValues, chuaGuiChanh, showChanhXe, showSpx, referenceDate }) {
  const validData = data.filter(row => String(row['Mã kiện hàng'] ?? '').trim())

  const tructiepRows = []
  const chanhxeRows = []
  const viettelRows = []
  const spxRows = []
  for (const row of validData) {
    const t = partnerType(row)
    if (t === 'tructiep') tructiepRows.push(row)
    else if (t === 'viettel') viettelRows.push(row)
    else if (t === 'spx') spxRows.push(row)
    else chanhxeRows.push(row)
  }
  const trackedChanhXeRows = showChanhXe ? chanhxeRows : []
  const trackedSpxRows = showSpx ? spxRows : []

  const viettelKey = `unifiedTrial_${channelKey}_viettel`
  const spxKey = `unifiedTrial_${channelKey}_spx`
  // requireSessionKey: đúng cơ chế liveSessionKey đã dùng ở CarrierPanel — chỉ lấy file VTP/SPX đã upload
  // trong đúng phiên làm việc hiện tại (referenceDate = meta.uploadedAt của file Đơn truyền thống đang xem),
  // không tự "khớp theo ngày gần nhất" (sẽ hiện nhầm số của kênh/tuần khác). Không có thì rơi về đếm theo
  // dòng trong chính file Đơn truyền thống (viettelRows.length) — vẫn có số hợp lý, không về 0.
  const viettelFile = getCarrierFileTotal(viettelKey, 'viettel', validData, referenceDate, true)
  const viettelCount = viettelFile ? viettelFile.total : viettelRows.length
  const spxFile = showSpx ? getCarrierFileTotal(spxKey, 'spx', validData, referenceDate, true) : null
  const spxCount = showSpx ? (spxFile ? spxFile.total : trackedSpxRows.length) : 0
  const doitacTotal = viettelCount + spxCount

  const khBreakdownSum = Object.values(khValues).reduce((s, v) => s + (Number(v) || 0), 0)
  const chuaGuiVal = chuaGuiChanh !== '' ? Number(chuaGuiChanh) : 0

  const trucTiepStats = calcTrucTiepStats(tructiepRows)
  const trucTiepDelivered = trucTiepStats['24h'] + trucTiepStats['48h'] + trucTiepStats['72h']
  const trucTiepBadge = tructiepRows.length + khBreakdownSum

  const chanhXeBadge = trackedChanhXeRows.length + (showChanhXe ? chuaGuiVal : 0)
  const total = trucTiepBadge + chanhXeBadge + doitacTotal

  // Ghim đúng tuần VTP/SPX + bảng đối chiếu nội bộ tại thời điểm này — dùng khi "Lưu số liệu tuần
  // này" để CarrierPanel vẫn hiển thị đúng y hệt giao diện trực tiếp (StatCard, bảng chi tiết...)
  // cho đúng tuần đã lưu, kể cả sau khi rows thô của kênh (donC/donDTP) đã bị ghi đè bởi file mới.
  const viettelWeekId = pickCarrierWeekIdByDate(viettelKey, referenceDate)
  const spxWeekId = showSpx ? pickCarrierWeekIdByDate(spxKey, referenceDate) : null
  const carrierLookup = snapshotCarrierLookup(validData)

  return {
    total,
    trucTiepBadge, trucTiepStats, trucTiepDelivered, khBreakdownSum, khValues,
    chanhXeBadge, chanhXeCount: trackedChanhXeRows.length, chuaGuiChanh: chuaGuiVal,
    viettelCount, spxCount, doitacTotal,
    viettelWeekId, spxWeekId, carrierLookup,
  }
}
