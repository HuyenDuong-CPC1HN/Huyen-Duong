// Chuyển dữ liệu đã lưu của tab "Gộp kênh (Thử nghiệm)" (unified_trial_reports_donSO / _donTruyenThong)
// thành ĐÚNG hình dạng computeWeekReport() mà TongDonTab.jsx/tongDonNarrative.js/2 component báo cáo đang
// dùng — để tái dùng nguyên vẹn tầng trình bày/nhận định, không phải sửa gì ở đó khi đổi nguồn dữ liệu.
import { getCarrierFileStats, carrierWeekHasRows, getCarrierWeekRows, computeFrozenNgoaiSan } from './carrierUtils'

export const NGOAI_SAN_CARRIER_KEY_UNIFIED = 'unifiedTrial_donSO_spx'

// Snapshot 1 channel (donC/donDTP) đã lưu ở Gộp kênh chỉ ghim weekId + carrierLookup, KHÔNG lưu sẵn stats
// chi tiết (24h/48h/72h/dangVanChuyen/...) — lấy lại qua getCarrierFileStats với internalData=[] (dùng
// carrierLookup đã đóng băng thay), đúng cách statsForCarrierWeekId trong TongDonTab.jsx làm cho nguồn cũ.
function carrierStatsFromChannel(channelSnapshot, channelKey, carrierType) {
  const weekId = carrierType === 'viettel' ? channelSnapshot?.viettelWeekId : channelSnapshot?.spxWeekId
  if (!weekId) return null
  const key = `unifiedTrial_${channelKey}_${carrierType}`
  return getCarrierFileStats(key, carrierType, [], weekId, channelSnapshot?.carrierLookup || null)
}

function bucketsOf(trucTiepStats) {
  return { 24: trucTiepStats?.['24h'] || 0, 48: trucTiepStats?.['48h'] || 0, 72: trucTiepStats?.['72h'] || 0 }
}

function pct(part, total) { return total ? Math.round((part / total) * 100 * 10) / 10 : 0 }

// Ghép 1 cặp entry đã lưu (Đơn SO + Đơn truyền thống) của Gộp kênh cho 1 tuần — cả 2 có thể null nếu
// người dùng chưa lưu tuần nào ở 1 trong 2 pill.
export function computeWeekReportFromUnifiedTrial({ donSOEntry, donTTEntry }) {
  const donC = donTTEntry?.donC || null
  const donDTP = donTTEntry?.donDTP || null
  const totalTMDT = donSOEntry?.tmdtCount || 0
  const totalC = donC?.total || 0
  const totalDTP = donDTP?.total || 0

  const viettelC = donC ? carrierStatsFromChannel(donC, 'donC', 'viettel') : null
  const viettelDTP = donDTP ? carrierStatsFromChannel(donDTP, 'donDTP', 'viettel') : null
  const spxC = donSOEntry?.spxWeekId
    ? getCarrierFileStats(NGOAI_SAN_CARRIER_KEY_UNIFIED, 'spx', [], donSOEntry.spxWeekId, donSOEntry.carrierLookup || null)
    : null

  const bC = bucketsOf(donC?.trucTiepStats)
  const bDTP = bucketsOf(donDTP?.trucTiepStats)
  const gh24 = bC[24] + bDTP[24]
  const gh48 = bC[48] + bDTP[48]
  const gh72 = bC[72] + bDTP[72]
  const chuaGiaoC = donC?.khBreakdownSum || 0
  const chuaGiaoDTP = donDTP?.khBreakdownSum || 0
  const chuaGiao = chuaGiaoC + chuaGiaoDTP
  const trucTiepTong = gh24 + gh48 + gh72 + chuaGiao

  return {
    grandTotal: totalC + totalDTP + totalTMDT, totalC, totalDTP, totalTMDT,
    // Tổng "Đơn ngoại sàn" lấy từ ngoaiSanCount đã lưu CHẮC CHẮN trong entry Đơn SO (luôn có, không phụ
    // thuộc gì thêm) — KHÔNG lấy từ spxC.total (chỉ có khi tuần đó còn ghép đúng file đối soát chi tiết
    // SPX qua spxWeekId, dễ mất nếu spxWeekId không resolve được). spxC vẫn giữ để tính chi tiết Mốc/dvcPct
    // (buildDonSanNarrative) — chỗ đó ĐÚNG là có thể chưa có dữ liệu, khác với tổng đơn (luôn có sẵn).
    totalNgoaiSan: donSOEntry?.ngoaiSanCount || 0,
    tructiepTotalC: donC?.trucTiepBadge || 0, tructiepTotalDTP: donDTP?.trucTiepBadge || 0,
    // Gộp kênh chỉ có ô "chưa gửi chành" (đã gộp vào chanhXeBadge), chưa có ô "chưa giao chành" riêng như
    // nguồn cũ — không có gì để map, để 0 (không ảnh hưởng gì khác, field này không được 2 báo cáo đọc).
    chanhXeTotal: donC?.chanhXeBadge || 0, chanhXeChuaGiao: 0,
    codC: viettelC?.total || 0, codDTP: viettelDTP?.total || 0,
    gh24, gh48, gh72, chuaGiao, chuaGiaoC, chuaGiaoDTP, trucTiepTong,
    bC, bDTP, rate24h: pct(gh24, trucTiepTong),
    viettelC, spxC, viettelDTP,
  }
}

// Đối soát Ngoại sàn theo Mã đơn, Mốc 1..4 — chỉ tính cho ĐÚNG 1 tuần Đơn SO (không so sánh 2 tuần, giống
// hệt ngoaiSanForWeekId trong TongDonTab.jsx đang làm cho nguồn cũ, chỉ khác carrier key). Gộp kênh chưa
// lưu sẵn bản đóng băng (ngoaiSanFrozen) trong entry như nguồn cũ — nếu rows SPX gốc đã bị thay file mới
// thì trả về null (2 báo cáo đã có sẵn màn hình "Chưa có dữ liệu đối soát" cho trường hợp này).
export function ngoaiSanForWeekIdUnifiedTrial(spxWeekId) {
  if (!spxWeekId) return null
  if (!carrierWeekHasRows(NGOAI_SAN_CARRIER_KEY_UNIFIED, spxWeekId)) return null
  return {
    data: computeFrozenNgoaiSan(NGOAI_SAN_CARRIER_KEY_UNIFIED, getCarrierWeekRows(NGOAI_SAN_CARRIER_KEY_UNIFIED, spxWeekId)),
    frozen: false,
  }
}
