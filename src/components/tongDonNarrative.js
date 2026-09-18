// Sinh chữ nhận định tự động theo số liệu thật (bản mẫu-thông-minh, không gọi AI) — dùng cho 2 báo cáo
// "Đơn sàn" và "Đơn truyền thống" của tab Tổng Đơn. Người dùng vẫn sửa tay được toàn bộ chữ này ở UI
// (xem useWeekField trong TongDonTab.jsx), các hàm ở đây chỉ tạo giá trị khởi tạo/gợi ý.

export function pct(part, total) { return total ? Math.round((part / total) * 100 * 10) / 10 : 0 }
function fmtPctSigned(v) { return `${v >= 0 ? '+' : ''}${v.toFixed(1)}%` }

function deltaPctOf(previousValue, currentValue) {
  if (previousValue) return ((currentValue - previousValue) / previousValue) * 100
  if (currentValue > 0) return 100
  return 0
}

function trendWord(value) { return value >= 0 ? 'tăng' : 'giảm' }

function carrierInsight({ carrier, currentTotal, previousTotal, currentDvcPct, previousDvcPct, dvcUp, noData, followUp }) {
  if (currentTotal === 0) return noData
  const volumeTrend = trendWord(deltaPctOf(previousTotal, currentTotal))
  const dvcTrend = trendWord(dvcUp ? 1 : -1)
  const followUpText = dvcUp ? followUp : ''
  return `Đơn qua ${carrier} ${volumeTrend} từ ${previousTotal.toLocaleString('vi-VN')} lên ${currentTotal.toLocaleString('vi-VN')} đơn, tỷ lệ "đang vận chuyển" ${dvcTrend} từ ${previousDvcPct}% lên ${currentDvcPct}%${followUpText}.`
}

// SLA giao 24h riêng cho 1 bên (Đơn C hoặc Đơn DTP) — cùng công thức với rate24h chung của computeWeekReport
// nhưng chỉ tính trên đúng 1 bên, dùng cho các nhận định/KPI tách riêng Đơn C và Đơn DTP.
function slaRate24h(b, tructiepTotal) { return pct(b?.[24] || 0, tructiepTotal) }

function fmtInt(n) { return Math.round(n).toLocaleString('vi-VN') }
function absPct(v) { return `${Math.abs(v).toFixed(1)}%` }
function slaWord(up) { return up ? 'cải thiện' : 'giảm' }
function slaDir(up) { return up ? 'lên' : 'xuống' }
function priorityOf(high) { return high ? 'high' : 'low' }
function joinParts(...parts) { return parts.filter(Boolean).join(' ').trim() }

function tmdtNgoaiSanLink(ngoaiSanDeltaPct) {
  return ngoaiSanDeltaPct >= 0
    ? ', cùng nhịp với Đơn ngoại sàn cũng đang tăng'
    : ', trong khi Đơn ngoại sàn diễn biến ngược chiều'
}

function tmdtOutlook(tmdtDeltaPct) {
  return tmdtDeltaPct >= 0
    ? 'cho thấy nhu cầu chung phục hồi trên toàn bộ Đơn sàn'
    : 'cần theo dõi thêm nguyên nhân sụt giảm'
}

function dvcStockWord(dvcUp) { return dvcUp ? 'tăng' : 'ổn định' }

function dvcFollowUp(dvcImproved, dvcUp) {
  if (dvcImproved) return ' — cải thiện rất tích cực'
  if (dvcUp) return ' — cần rà soát nguyên nhân tồn vận chuyển'
  return ''
}

function ngoaiSanToneOf(dvcImproved, dvcUp) {
  if (dvcImproved) return 'pos'
  if (dvcUp) return 'warn'
  return 'neutral'
}

function appendReconToNgoaiSanBody(ngoaiSanBody, reconStats) {
  if (!reconStats) return ngoaiSanBody
  const chuaGiaoQuaHan = reconStats.chuaGiaoQuaHan || 0
  const daGiaoTong = (reconStats.dungHanGiao || 0) + (reconStats.treHanGiao || 0)
  const daXuLyTong = daGiaoTong + chuaGiaoQuaHan
  const chuaGiaoQuaHanPct = pct(chuaGiaoQuaHan, daXuLyTong)
  return `${ngoaiSanBody} Tuy nhiên đối soát theo Mã đơn (mốc mới, gồm cả khâu đóng kiện) cho thấy vẫn còn ${fmtInt(chuaGiaoQuaHan)} đơn (${chuaGiaoQuaHanPct}%) chưa giao và quá hạn 48h, tập trung ở khâu giao hàng cuối chứ không phải đầu vào.`
}

function dongKienStatus(reconStats) {
  const late = (reconStats.quaHanChuaDongKien || 0) > 0 || (reconStats.treDongKien || 0) > 0
  return late ? 'vẫn còn vài đơn trễ/chưa đóng kiện.' : 'gần như hoàn hảo.'
}

function layHangStatus(layChuaLay) {
  if (layChuaLay > 0) return `còn ${layChuaLay} đơn chưa được lấy`
  return 'đã lấy đủ'
}

function buildReconNote(reconStats) {
  if (!reconStats) return 'Chưa đủ dữ liệu đối soát Ngoại sàn theo Mã đơn cho tuần này.'
  const layChuaLay = reconStats.layChuaLay || 0
  const treHanGiao = reconStats.treHanGiao || 0
  const chuaGiaoQuaHan = reconStats.chuaGiaoQuaHan || 0
  const daXuLyGiaoTong = (reconStats.dungHanGiao || 0) + treHanGiao + chuaGiaoQuaHan
  const chuaGiaoQuaHanPct = pct(chuaGiaoQuaHan, daXuLyGiaoTong)
  const treHanGiaoPct = pct(treHanGiao, daXuLyGiaoTong)
  const dongKienOk = (reconStats.dungHanDongKien || 0) + (reconStats.treDongKien || 0)
  const dungHan = reconStats.dungHanDongKien || 0
  const totalKien = dongKienOk + (reconStats.quaHanChuaDongKien || 0)
  return `Khâu đóng kiện tại kho ${dungHan}/${totalKien} đúng hạn 24h — ${dongKienStatus(reconStats)} Khâu SPX lấy hàng ${layHangStatus(layChuaLay)}. Điểm nghẽn chính nằm ở khâu giao hàng cuối: trong ${daXuLyGiaoTong} đơn đã đủ thời gian đánh giá mốc 48h, có tới ${chuaGiaoQuaHan} đơn (${chuaGiaoQuaHanPct}%) chưa giao và đã quá hạn — thêm ${treHanGiao} đơn (${treHanGiaoPct}%) giao trễ hạn — cho thấy vấn đề tồn đọng chủ yếu phát sinh sau khi SPX đã lấy hàng, không phải khâu đóng gói hay lấy hàng đầu vào.`
}

function donSanDvcVerdict(dvcImproved, dvcPrevPct, dvcCurPct) {
  if (dvcImproved) {
    return `Tín hiệu tích cực rõ rệt nhất là tại Ngoại sàn (SPX): tỷ lệ tồn "đang vận chuyển" giảm mạnh từ ${dvcPrevPct}% xuống chỉ còn ${dvcCurPct}% dù sản lượng tăng.`
  }
  return `Cần theo dõi sát tỷ lệ "đang vận chuyển" tại Ngoại sàn (SPX), hiện ở mức ${dvcCurPct}%.`
}

function donSanReconVerdict(reconStats) {
  if (!reconStats) return ''
  return `Đối soát theo Mã đơn xác nhận khâu giao hàng cuối vẫn là điểm nghẽn với ${reconStats.chuaGiaoQuaHan || 0} đơn quá hạn 48h chưa giao — cần tập trung cải thiện khâu này trong tuần tới.`
}

function sol4Trend(up) {
  return {
    together: up ? 'cùng tăng' : 'cùng giảm',
    outlook: up ? 'phục hồi bền vững' : 'suy giảm kéo dài',
  }
}

function dtpToneOf(dtpDeltaPct, dtpSlaUp) {
  if (dtpDeltaPct >= 0 && dtpSlaUp) return 'pos'
  if (dtpSlaUp) return 'neutral'
  return 'neg'
}

function dtpTitleOf(dtpDeltaPct, dtpSlaUp) {
  if (dtpDeltaPct >= 0 && dtpSlaUp) return 'Hiếm có: cả khối lượng và SLA cùng tăng'
  return `Đơn DTP ${trendWord(dtpDeltaPct)} ${absPct(dtpDeltaPct)}, SLA 24h ${slaWord(dtpSlaUp)}`
}

function dtpBodyOf(dtpDeltaPct, previousTotal, currentTotal, dtpSlaUp, slaPrev, slaCur) {
  const connector = dtpSlaUp ? 'đồng thời' : 'trong khi'
  const outlook = dtpSlaUp
    ? 'tín hiệu tích cực cho thấy năng lực xử lý Đơn DTP đã bắt kịp và vượt tốc độ tăng trưởng'
    : 'cần rà soát nguyên nhân chậm giao'
  return `Sản lượng ${trendWord(dtpDeltaPct)} ${absPct(dtpDeltaPct)} (${fmtInt(previousTotal)}→${fmtInt(currentTotal)}) ${connector} SLA 24h ${slaWord(dtpSlaUp)} từ ${slaPrev}% ${slaDir(dtpSlaUp)} ${slaCur}% — ${outlook}.`
}

function cTitleOf(cSlaUp, cDeltaPct) {
  if (!cSlaUp && cDeltaPct > 0) return 'SLA giảm mạnh khi khối lượng tăng'
  return `Đơn C ${trendWord(cDeltaPct)} ${absPct(cDeltaPct)}, SLA 24h ${slaWord(cSlaUp)}`
}

function cBodyPressure(cSlaUp, cDeltaPct) {
  if (!cSlaUp && cDeltaPct > 0) {
    return ' — dấu hiệu áp lực khối lượng bắt đầu ảnh hưởng đến tốc độ giao, cần theo dõi nếu đà tăng tiếp diễn'
  }
  return ''
}

function boomOrDrop(deltaPct) {
  return deltaPct >= 0 ? 'sự bùng nổ' : 'sự sụt giảm'
}

function ttDtpVerdict(dtpSlaUp, dtpDeltaPct, slaPrev, slaCur) {
  if (dtpSlaUp && dtpDeltaPct >= 0) {
    return `Điểm sáng lớn nhất là Đơn DTP: vừa tăng khối lượng ${dtpDeltaPct.toFixed(1)}% vừa cải thiện SLA 24h từ ${slaPrev}% lên ${slaCur}%.`
  }
  return `Đơn DTP ${trendWord(dtpDeltaPct)} ${absPct(dtpDeltaPct)}, SLA 24h ở mức ${slaCur}%.`
}

function ttCVerdict(cSlaUp, cDeltaPct, slaPrev, slaCur) {
  if (!cSlaUp && cDeltaPct > 0) {
    return `Ngược lại, Đơn C truyền thống cho thấy dấu hiệu quá tải: SLA giảm từ ${slaPrev}% xuống ${slaCur}% khi khối lượng tăng ${cDeltaPct.toFixed(1)}%, cần theo dõi sát nếu xu hướng này tiếp tục.`
  }
  return `Đơn C truyền thống ${trendWord(cDeltaPct)} ${absPct(cDeltaPct)}, SLA 24h ở mức ${slaCur}%.`
}

function chuaGiaoVerdict(bvChuaGiao) {
  if (bvChuaGiao > 0) return `Số đơn chưa giao vẫn ở mức ${bvChuaGiao} đơn, cần tiếp tục ưu tiên xử lý.`
  return ''
}

function dtpSol3(dtpSlaUp, slaCur, slaPrev) {
  if (!dtpSlaUp) return 'Rà soát nguyên nhân SLA Đơn DTP chưa cải thiện dù khối lượng biến động.'
  const gain = slaCur >= slaPrev ? `tăng ${(slaCur - slaPrev).toFixed(1)} điểm %` : ''
  return `Xác định nguyên nhân cụ thể giúp SLA Đơn DTP ${gain} dù khối lượng tăng, để áp dụng kinh nghiệm cho Đơn C và các kênh khác.`
}

function spxVolume(week) {
  const total = week.spxC?.total || 0
  const dvc = week.spxC?.stats?.dangVanChuyen || 0
  return { total, dvcPct: pct(dvc, total) }
}

function viettelVolume(week) {
  const total = (week.viettelC?.total || 0) + (week.viettelDTP?.total || 0)
  const dvc = (week.viettelC?.stats?.dangVanChuyen || 0) + (week.viettelDTP?.stats?.dangVanChuyen || 0)
  return { total, dvcPct: pct(dvc, total) }
}

function chuaGiaoTotal(week) {
  return (week.chuaGiaoC || 0) + (week.chuaGiaoDTP || 0)
}

function posNeg(deltaPct) { return deltaPct >= 0 ? 'pos' : 'neg' }
function cToneOf(cSlaUp, cDeltaPct) { return !cSlaUp && cDeltaPct > 0 ? 'neg' : 'pos' }

// ---------- Báo cáo "Đơn sàn" (Sàn TMĐT + Ngoại sàn/SPX) ----------
export function buildDonSanNarrative(current, previous, ngoaiSan) {
  const tmdtDeltaPct = deltaPctOf(previous.totalTMDT, current.totalTMDT)
  const tmdtTrend = trendWord(tmdtDeltaPct)
  const ngoaiSanCur = spxVolume(current)
  const ngoaiSanPrev = spxVolume(previous)
  const ngoaiSanCurTotal = ngoaiSanCur.total
  const ngoaiSanPrevTotal = ngoaiSanPrev.total
  const ngoaiSanDeltaPct = deltaPctOf(ngoaiSanPrevTotal, ngoaiSanCurTotal)
  const dvcCurPct = ngoaiSanCur.dvcPct
  const dvcPrevPct = ngoaiSanPrev.dvcPct
  const dvcImproved = dvcCurPct < dvcPrevPct
  const dvcUp = dvcCurPct > dvcPrevPct

  const tmdtTitle = tmdtDeltaPct >= 0
    ? `Sản lượng tăng trở lại ${absPct(tmdtDeltaPct)}`
    : `Sản lượng giảm ${absPct(tmdtDeltaPct)}`
  const tmdtBody = `Đơn sàn TMĐT ${tmdtTrend} từ ${fmtInt(previous.totalTMDT)} lên ${fmtInt(current.totalTMDT)} (${fmtPctSigned(tmdtDeltaPct)})${tmdtNgoaiSanLink(ngoaiSanDeltaPct)} — ${tmdtOutlook(tmdtDeltaPct)}.`

  const ngoaiSanTitle = dvcImproved
    ? `Tồn "đang vận chuyển" giảm mạnh dù sản lượng ${trendWord(ngoaiSanDeltaPct)} ${absPct(ngoaiSanDeltaPct)}`
    : `Tồn "đang vận chuyển" ${dvcStockWord(dvcUp)} khi sản lượng ${trendWord(ngoaiSanDeltaPct)} ${absPct(ngoaiSanDeltaPct)}`
  const reconStats = ngoaiSan?.data?.stats
  const ngoaiSanBody = appendReconToNgoaiSanBody(
    `Tỷ lệ "đang vận chuyển" ${trendWord(dvcCurPct - dvcPrevPct)} từ ${dvcPrevPct}% xuống còn ${dvcCurPct}%${dvcFollowUp(dvcImproved, dvcUp)}.`,
    reconStats,
  )

  const reconNote = buildReconNote(reconStats)

  const donSanTotalCur = current.totalTMDT + ngoaiSanCurTotal
  const donSanTotalPrev = previous.totalTMDT + ngoaiSanPrevTotal
  const donSanDeltaPct = deltaPctOf(donSanTotalPrev, donSanTotalCur)
  const verdict = joinParts(
    `Đơn sàn tuần này ${trendWord(donSanDeltaPct)} đồng đều ở cả hai nhóm: Đơn sàn TMĐT ${tmdtTrend} ${absPct(tmdtDeltaPct)} và Đơn ngoại sàn ${trendWord(ngoaiSanDeltaPct)} ${absPct(ngoaiSanDeltaPct)}, đưa tổng Đơn sàn lên ${fmtInt(donSanTotalCur)} đơn (${fmtPctSigned(donSanDeltaPct)}).`,
    donSanDvcVerdict(dvcImproved, dvcPrevPct, dvcCurPct),
    donSanReconVerdict(reconStats),
  )

  const overdue = reconStats?.chuaGiaoQuaHan || 0
  const sol1 = overdue > 0
    ? `${overdue} đơn quá hạn 48h chưa giao dù khâu đóng kiện và lấy hàng đều tốt — vấn đề ở khâu vận chuyển/giao cuối, cần làm việc với SPX để xác định nút thắt cụ thể (nhân sự giao hàng, khu vực địa lý, v.v.)`
    : 'Khâu giao hàng cuối đang ổn định, tiếp tục duy trì.'
  const layChuaLayCount = reconStats?.layChuaLay || 0
  const sol2 = layChuaLayCount > 0
    ? `Dù tỷ lệ nhỏ, khâu lấy hàng còn ${layChuaLayCount} đơn cần được nhắc SPX xử lý ngay để không kéo dài thời gian toàn trình giao hàng.`
    : 'Khâu SPX lấy hàng đang xử lý tốt, không còn tồn đọng.'
  const sol3 = 'Phiên bản đối soát mở rộng giúp xác định chính xác công đoạn nào đang tồn đọng — nên duy trì quy trình này cho các kỳ báo cáo tiếp theo để theo dõi xu hướng theo thời gian.'
  const trend = sol4Trend(donSanDeltaPct >= 0)
  const sol4 = `Cả hai nhóm ${trend.together} sau giai đoạn biến động — cần thêm 1-2 tuần dữ liệu để xác nhận đây là xu hướng ${trend.outlook} hay biến động ngắn hạn theo mùa vụ.`

  return {
    tmdtTone: posNeg(tmdtDeltaPct), tmdtTitle, tmdtBody,
    ngoaiSanTone: ngoaiSanToneOf(dvcImproved, dvcUp), ngoaiSanTitle, ngoaiSanBody,
    reconNote, verdict,
    sol1, sol2, sol3, sol4,
    priority1: priorityOf(overdue > 0),
    tmdtDeltaPct,
    donSanTotalCur, donSanTotalPrev, donSanDeltaPct,
    ngoaiSanCurTotal, ngoaiSanPrevTotal, ngoaiSanDeltaPct, dvcCurPct, dvcPrevPct, dvcImproved,
  }
}

// ---------- Báo cáo "Đơn truyền thống" (Đơn C + Đơn DTP) ----------
export function buildDonTruyenThongNarrative(current, previous) {
  const totalTTCur = current.totalC + current.totalDTP
  const totalTTPrev = previous.totalC + previous.totalDTP
  const ttDeltaPct = deltaPctOf(totalTTPrev, totalTTCur)
  const ttTrend = trendWord(ttDeltaPct)

  const cDeltaPct = deltaPctOf(previous.totalC, current.totalC)
  const dtpDeltaPct = deltaPctOf(previous.totalDTP, current.totalDTP)

  const slaC_cur = slaRate24h(current.bC, current.tructiepTotalC)
  const slaC_prev = slaRate24h(previous.bC, previous.tructiepTotalC)
  const slaDTP_cur = slaRate24h(current.bDTP, current.tructiepTotalDTP)
  const slaDTP_prev = slaRate24h(previous.bDTP, previous.tructiepTotalDTP)

  const cocauTitle = ttDeltaPct >= 0
    ? `Đơn truyền thống bùng nổ ${fmtPctSigned(ttDeltaPct)} — đảo ngược đà giảm liên tiếp`
    : `Đơn truyền thống giảm ${absPct(ttDeltaPct)} so với tuần trước`
  const cocauBody = `Tổng đơn truyền thống ${ttTrend} từ ${fmtInt(totalTTPrev)} lên ${fmtInt(totalTTCur)} (${fmtPctSigned(ttDeltaPct)}).`

  const dtpSlaUp = slaDTP_cur >= slaDTP_prev
  const dtpTitle = dtpTitleOf(dtpDeltaPct, dtpSlaUp)
  const dtpBody = dtpBodyOf(dtpDeltaPct, previous.totalDTP, current.totalDTP, dtpSlaUp, slaDTP_prev, slaDTP_cur)

  const cSlaUp = slaC_cur >= slaC_prev
  const cTitle = cTitleOf(cSlaUp, cDeltaPct)
  const cBody = `Sản lượng ${trendWord(cDeltaPct)} ${absPct(cDeltaPct)} (${fmtInt(previous.totalC)}→${fmtInt(current.totalC)}) nhưng SLA 24h ${slaWord(cSlaUp)} từ ${slaC_prev}% ${slaDir(cSlaUp)} ${slaC_cur}%${cBodyPressure(cSlaUp, cDeltaPct)}.`

  const vtpCur = viettelVolume(current)
  const vtpPrev = viettelVolume(previous)
  const vtpDVCUp = vtpCur.dvcPct > vtpPrev.dvcPct
  const vtpDeltaPct = deltaPctOf(vtpPrev.total, vtpCur.total)
  const vtpTitle = `Sản lượng ${trendWord(vtpDeltaPct)} ${absPct(vtpDeltaPct)}`
  const vtpBody = carrierInsight({
    carrier: 'Viettel Post', currentTotal: vtpCur.total, previousTotal: vtpPrev.total,
    currentDvcPct: vtpCur.dvcPct, previousDvcPct: vtpPrev.dvcPct, dvcUp: vtpDVCUp,
    noData: 'Không có dữ liệu Viettel Post trong tuần này.', followUp: ' — cần xác nhận năng lực xử lý',
  })

  const bvChuaGiao = chuaGiaoTotal(current)
  const verdict = joinParts(
    `Tuần này đánh dấu ${boomOrDrop(ttDeltaPct)} của Đơn truyền thống, ${ttTrend} ${absPct(ttDeltaPct)} so với tuần trước.`,
    ttDtpVerdict(dtpSlaUp, dtpDeltaPct, slaDTP_prev, slaDTP_cur),
    ttCVerdict(cSlaUp, cDeltaPct, slaC_prev, slaC_cur),
    chuaGiaoVerdict(bvChuaGiao),
  )

  const sol1 = (!cSlaUp && cDeltaPct > 0)
    ? `SLA giảm từ ${slaC_prev}% xuống ${slaC_cur}% khi sản lượng tăng ${cDeltaPct.toFixed(1)}% — cần chuẩn bị phương án tăng nguồn lực nếu đà tăng trưởng này tiếp diễn trong tuần tới.`
    : `SLA Đơn C đang ổn định ở mức ${slaC_cur}%, tiếp tục duy trì.`
  const sol2 = bvChuaGiao > 0
    ? `Số đơn chưa giao vẫn duy trì ở mức ${bvChuaGiao} đơn tại kênh trực tiếp — tiếp tục ưu tiên xử lý ngay do tính chất khẩn cấp cao của nhóm khách hàng này.`
    : 'Không còn tồn đọng đơn chưa giao đáng chú ý tại kênh trực tiếp.'
  const sol3 = dtpSol3(dtpSlaUp, slaDTP_cur, slaDTP_prev)
  const sol4 = `Biến động SLA Đơn C tại Viettel Post (quy mô ${current.viettelC?.total || 0} đơn) — cần thêm dữ liệu để xác định đây là biến động ngẫu nhiên hay xu hướng thực sự.`

  return {
    cocauTone: posNeg(ttDeltaPct), cocauTitle, cocauBody,
    dtpTone: dtpToneOf(dtpDeltaPct, dtpSlaUp), dtpTitle, dtpBody,
    cTone: cToneOf(cSlaUp, cDeltaPct), cTitle, cBody,
    vtpTone: vtpDVCUp ? 'warn' : 'pos', vtpTitle, vtpBody,
    verdict,
    sol1, sol2, sol3, sol4,
    priority1: priorityOf(!cSlaUp && cDeltaPct > 30), priority2: priorityOf(bvChuaGiao > 0),
    totalTTCur, totalTTPrev, ttDeltaPct, cDeltaPct, dtpDeltaPct,
    slaC_cur, slaC_prev, slaDTP_cur, slaDTP_prev,
  }
}
