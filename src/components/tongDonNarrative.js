// Sinh chữ nhận định tự động theo số liệu thật (bản mẫu-thông-minh, không gọi AI) — dùng cho 2 báo cáo
// "Đơn sàn" và "Đơn truyền thống" của tab Tổng Đơn. Người dùng vẫn sửa tay được toàn bộ chữ này ở UI
// (xem useWeekField trong TongDonTab.jsx), các hàm ở đây chỉ tạo giá trị khởi tạo/gợi ý.

export function pct(part, total) { return total ? Math.round((part / total) * 100 * 10) / 10 : 0 }
export function fmtPctSigned(v) { return `${v >= 0 ? '+' : ''}${v.toFixed(1)}%` }

export function deltaPctOf(previousValue, currentValue) {
  if (previousValue) return ((currentValue - previousValue) / previousValue) * 100
  if (currentValue > 0) return 100
  return 0
}

export function trendWord(value) { return value >= 0 ? 'tăng' : 'giảm' }

export function carrierInsight({ carrier, currentTotal, previousTotal, currentDvcPct, previousDvcPct, dvcUp, noData, followUp }) {
  if (currentTotal === 0) return noData
  const volumeTrend = trendWord(deltaPctOf(previousTotal, currentTotal))
  const dvcTrend = trendWord(dvcUp ? 1 : -1)
  const followUpText = dvcUp ? followUp : ''
  return `Đơn qua ${carrier} ${volumeTrend} từ ${previousTotal.toLocaleString('vi-VN')} lên ${currentTotal.toLocaleString('vi-VN')} đơn, tỷ lệ "đang vận chuyển" ${dvcTrend} từ ${previousDvcPct}% lên ${currentDvcPct}%${followUpText}.`
}

// SLA giao 24h riêng cho 1 bên (Đơn C hoặc Đơn DTP) — cùng công thức với rate24h chung của computeWeekReport
// nhưng chỉ tính trên đúng 1 bên, dùng cho các nhận định/KPI tách riêng Đơn C và Đơn DTP.
export function slaRate24h(b, tructiepTotal) { return pct(b?.[24] || 0, tructiepTotal) }

function fmtInt(n) { return Math.round(n).toLocaleString('vi-VN') }

// ---------- Báo cáo "Đơn sàn" (Sàn TMĐT + Ngoại sàn/SPX) ----------
export function buildDonSanNarrative(current, previous, ngoaiSan) {
  const tmdtDeltaPct = deltaPctOf(previous.totalTMDT, current.totalTMDT)
  const tmdtTrend = trendWord(tmdtDeltaPct)
  const ngoaiSanCurTotal = current.spxC?.total || 0
  const ngoaiSanPrevTotal = previous.spxC?.total || 0
  const ngoaiSanDeltaPct = deltaPctOf(ngoaiSanPrevTotal, ngoaiSanCurTotal)
  const dvcCurPct = pct(current.spxC?.stats?.dangVanChuyen || 0, ngoaiSanCurTotal)
  const dvcPrevPct = pct(previous.spxC?.stats?.dangVanChuyen || 0, ngoaiSanPrevTotal)
  const dvcImproved = dvcCurPct < dvcPrevPct
  const dvcUp = dvcCurPct > dvcPrevPct

  const tmdtTitle = tmdtDeltaPct >= 0
    ? `Sản lượng tăng trở lại ${Math.abs(tmdtDeltaPct).toFixed(1)}%`
    : `Sản lượng giảm ${Math.abs(tmdtDeltaPct).toFixed(1)}%`
  const tmdtBody = `Đơn sàn TMĐT ${tmdtTrend} từ ${fmtInt(previous.totalTMDT)} lên ${fmtInt(current.totalTMDT)} (${fmtPctSigned(tmdtDeltaPct)})${ngoaiSanDeltaPct >= 0 ? ', cùng nhịp với Đơn ngoại sàn cũng đang tăng' : ', trong khi Đơn ngoại sàn diễn biến ngược chiều'} — ${tmdtDeltaPct >= 0 ? 'cho thấy nhu cầu chung phục hồi trên toàn bộ Đơn sàn' : 'cần theo dõi thêm nguyên nhân sụt giảm'}.`

  const ngoaiSanTitle = dvcImproved
    ? `Tồn "đang vận chuyển" giảm mạnh dù sản lượng ${trendWord(ngoaiSanDeltaPct)} ${Math.abs(ngoaiSanDeltaPct).toFixed(1)}%`
    : `Tồn "đang vận chuyển" ${dvcUp ? 'tăng' : 'ổn định'} khi sản lượng ${trendWord(ngoaiSanDeltaPct)} ${Math.abs(ngoaiSanDeltaPct).toFixed(1)}%`
  let ngoaiSanBody = `Tỷ lệ "đang vận chuyển" ${trendWord(dvcCurPct - dvcPrevPct)} từ ${dvcPrevPct}% xuống còn ${dvcCurPct}%${dvcImproved ? ' — cải thiện rất tích cực' : dvcUp ? ' — cần rà soát nguyên nhân tồn vận chuyển' : ''}.`
  const reconStats = ngoaiSan?.data?.stats
  if (reconStats) {
    const chuaGiaoQuaHan = reconStats.chuaGiaoQuaHan || 0
    const daGiaoTong = (reconStats.dungHanGiao || 0) + (reconStats.treHanGiao || 0)
    const daXuLyTong = daGiaoTong + chuaGiaoQuaHan
    const chuaGiaoQuaHanPct = pct(chuaGiaoQuaHan, daXuLyTong)
    ngoaiSanBody += ` Tuy nhiên đối soát theo Mã đơn (mốc mới, gồm cả khâu đóng kiện) cho thấy vẫn còn ${fmtInt(chuaGiaoQuaHan)} đơn (${chuaGiaoQuaHanPct}%) chưa giao và quá hạn 48h, tập trung ở khâu giao hàng cuối chứ không phải đầu vào.`
  }

  let reconNote = 'Chưa đủ dữ liệu đối soát Ngoại sàn theo Mã đơn cho tuần này.'
  if (reconStats) {
    const layChuaLay = reconStats.layChuaLay || 0
    const treHanGiao = reconStats.treHanGiao || 0
    const chuaGiaoQuaHan = reconStats.chuaGiaoQuaHan || 0
    const daXuLyGiaoTong = (reconStats.dungHanGiao || 0) + treHanGiao + chuaGiaoQuaHan
    const chuaGiaoQuaHanPct = pct(chuaGiaoQuaHan, daXuLyGiaoTong)
    const treHanGiaoPct = pct(treHanGiao, daXuLyGiaoTong)
    const dongKienOk = (reconStats.dungHanDongKien || 0) + (reconStats.treDongKien || 0)
    reconNote = `Khâu đóng kiện tại kho ${(reconStats.dungHanDongKien || 0)}/${dongKienOk + (reconStats.quaHanChuaDongKien || 0)} đúng hạn 24h — ${(reconStats.quaHanChuaDongKien || 0) > 0 || (reconStats.treDongKien || 0) > 0 ? 'vẫn còn vài đơn trễ/chưa đóng kiện.' : 'gần như hoàn hảo.'} Khâu SPX lấy hàng ${layChuaLay > 0 ? `còn ${layChuaLay} đơn chưa được lấy` : 'đã lấy đủ'}. Điểm nghẽn chính nằm ở khâu giao hàng cuối: trong ${daXuLyGiaoTong} đơn đã đủ thời gian đánh giá mốc 48h, có tới ${chuaGiaoQuaHan} đơn (${chuaGiaoQuaHanPct}%) chưa giao và đã quá hạn — thêm ${treHanGiao} đơn (${treHanGiaoPct}%) giao trễ hạn — cho thấy vấn đề tồn đọng chủ yếu phát sinh sau khi SPX đã lấy hàng, không phải khâu đóng gói hay lấy hàng đầu vào.`
  }

  const donSanTotalCur = current.totalTMDT + ngoaiSanCurTotal
  const donSanTotalPrev = previous.totalTMDT + ngoaiSanPrevTotal
  const donSanDeltaPct = deltaPctOf(donSanTotalPrev, donSanTotalCur)
  const verdict = `Đơn sàn tuần này ${trendWord(donSanDeltaPct)} đồng đều ở cả hai nhóm: Đơn sàn TMĐT ${tmdtTrend} ${Math.abs(tmdtDeltaPct).toFixed(1)}% và Đơn ngoại sàn ${trendWord(ngoaiSanDeltaPct)} ${Math.abs(ngoaiSanDeltaPct).toFixed(1)}%, đưa tổng Đơn sàn lên ${fmtInt(donSanTotalCur)} đơn (${fmtPctSigned(donSanDeltaPct)}). ${dvcImproved ? `Tín hiệu tích cực rõ rệt nhất là tại Ngoại sàn (SPX): tỷ lệ tồn "đang vận chuyển" giảm mạnh từ ${dvcPrevPct}% xuống chỉ còn ${dvcCurPct}% dù sản lượng tăng.` : `Cần theo dõi sát tỷ lệ "đang vận chuyển" tại Ngoại sàn (SPX), hiện ở mức ${dvcCurPct}%.`} ${reconStats ? `Đối soát theo Mã đơn xác nhận khâu giao hàng cuối vẫn là điểm nghẽn với ${reconStats.chuaGiaoQuaHan || 0} đơn quá hạn 48h chưa giao — cần tập trung cải thiện khâu này trong tuần tới.` : ''}`.trim()

  const solPriority1 = (reconStats?.chuaGiaoQuaHan || 0) > 0 ? 'high' : 'low'
  const sol1 = (reconStats?.chuaGiaoQuaHan || 0) > 0
    ? `${reconStats.chuaGiaoQuaHan} đơn quá hạn 48h chưa giao dù khâu đóng kiện và lấy hàng đều tốt — vấn đề ở khâu vận chuyển/giao cuối, cần làm việc với SPX để xác định nút thắt cụ thể (nhân sự giao hàng, khu vực địa lý, v.v.)`
    : 'Khâu giao hàng cuối đang ổn định, tiếp tục duy trì.'
  const layChuaLayCount = reconStats?.layChuaLay || 0
  const sol2 = layChuaLayCount > 0
    ? `Dù tỷ lệ nhỏ, khâu lấy hàng còn ${layChuaLayCount} đơn cần được nhắc SPX xử lý ngay để không kéo dài thời gian toàn trình giao hàng.`
    : 'Khâu SPX lấy hàng đang xử lý tốt, không còn tồn đọng.'
  const sol3 = 'Phiên bản đối soát mở rộng giúp xác định chính xác công đoạn nào đang tồn đọng — nên duy trì quy trình này cho các kỳ báo cáo tiếp theo để theo dõi xu hướng theo thời gian.'
  const sol4 = `Cả hai nhóm ${donSanDeltaPct >= 0 ? 'cùng tăng' : 'cùng giảm'} sau giai đoạn biến động — cần thêm 1-2 tuần dữ liệu để xác nhận đây là xu hướng ${donSanDeltaPct >= 0 ? 'phục hồi bền vững' : 'suy giảm kéo dài'} hay biến động ngắn hạn theo mùa vụ.`

  return {
    tmdtTone: tmdtDeltaPct >= 0 ? 'pos' : 'neg', tmdtTitle, tmdtBody,
    ngoaiSanTone: dvcImproved ? 'pos' : dvcUp ? 'warn' : 'neutral', ngoaiSanTitle, ngoaiSanBody,
    reconNote, verdict,
    sol1, sol2, sol3, sol4,
    priority1: solPriority1,
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
    : `Đơn truyền thống giảm ${Math.abs(ttDeltaPct).toFixed(1)}% so với tuần trước`
  const cocauBody = `Tổng đơn truyền thống ${ttTrend} từ ${fmtInt(totalTTPrev)} lên ${fmtInt(totalTTCur)} (${fmtPctSigned(ttDeltaPct)}).`

  const dtpSlaUp = slaDTP_cur >= slaDTP_prev
  const dtpTitle = dtpDeltaPct >= 0 && dtpSlaUp
    ? 'Hiếm có: cả khối lượng và SLA cùng tăng'
    : `Đơn DTP ${trendWord(dtpDeltaPct)} ${Math.abs(dtpDeltaPct).toFixed(1)}%, SLA 24h ${dtpSlaUp ? 'cải thiện' : 'giảm'}`
  const dtpBody = `Sản lượng ${trendWord(dtpDeltaPct)} ${Math.abs(dtpDeltaPct).toFixed(1)}% (${fmtInt(previous.totalDTP)}→${fmtInt(current.totalDTP)}) ${dtpSlaUp ? 'đồng thời' : 'trong khi'} SLA 24h ${dtpSlaUp ? 'cải thiện' : 'giảm'} từ ${slaDTP_prev}% ${dtpSlaUp ? 'lên' : 'xuống'} ${slaDTP_cur}% — ${dtpSlaUp ? 'tín hiệu tích cực cho thấy năng lực xử lý Đơn DTP đã bắt kịp và vượt tốc độ tăng trưởng' : 'cần rà soát nguyên nhân chậm giao'}.`

  const cSlaUp = slaC_cur >= slaC_prev
  const cTitle = !cSlaUp && cDeltaPct > 0
    ? 'SLA giảm mạnh khi khối lượng tăng'
    : `Đơn C ${trendWord(cDeltaPct)} ${Math.abs(cDeltaPct).toFixed(1)}%, SLA 24h ${cSlaUp ? 'cải thiện' : 'giảm'}`
  const cBody = `Sản lượng ${trendWord(cDeltaPct)} ${Math.abs(cDeltaPct).toFixed(1)}% (${fmtInt(previous.totalC)}→${fmtInt(current.totalC)}) nhưng SLA 24h ${cSlaUp ? 'cải thiện' : 'giảm'} từ ${slaC_prev}% ${cSlaUp ? 'lên' : 'xuống'} ${slaC_cur}%${!cSlaUp && cDeltaPct > 0 ? ' — dấu hiệu áp lực khối lượng bắt đầu ảnh hưởng đến tốc độ giao, cần theo dõi nếu đà tăng tiếp diễn' : ''}.`

  const vtpCurTotal = (current.viettelC?.total || 0) + (current.viettelDTP?.total || 0)
  const vtpPrevTotal = (previous.viettelC?.total || 0) + (previous.viettelDTP?.total || 0)
  const vtpCurDVC = (current.viettelC?.stats?.dangVanChuyen || 0) + (current.viettelDTP?.stats?.dangVanChuyen || 0)
  const vtpPrevDVC = (previous.viettelC?.stats?.dangVanChuyen || 0) + (previous.viettelDTP?.stats?.dangVanChuyen || 0)
  const vtpCurDVCPct = pct(vtpCurDVC, vtpCurTotal)
  const vtpPrevDVCPct = pct(vtpPrevDVC, vtpPrevTotal)
  const vtpDVCUp = vtpCurDVCPct > vtpPrevDVCPct
  const vtpDeltaPct = deltaPctOf(vtpPrevTotal, vtpCurTotal)
  const vtpTitle = `Sản lượng ${trendWord(vtpDeltaPct)} ${Math.abs(vtpDeltaPct).toFixed(1)}%`
  const vtpBody = carrierInsight({
    carrier: 'Viettel Post', currentTotal: vtpCurTotal, previousTotal: vtpPrevTotal,
    currentDvcPct: vtpCurDVCPct, previousDvcPct: vtpPrevDVCPct, dvcUp: vtpDVCUp,
    noData: 'Không có dữ liệu Viettel Post trong tuần này.', followUp: ' — cần xác nhận năng lực xử lý',
  })

  const bvChuaGiao = (current.chuaGiaoC || 0) + (current.chuaGiaoDTP || 0)
  const verdict = `Tuần này đánh dấu ${ttDeltaPct >= 0 ? 'sự bùng nổ' : 'sự sụt giảm'} của Đơn truyền thống, ${ttTrend} ${Math.abs(ttDeltaPct).toFixed(1)}% so với tuần trước. ${dtpSlaUp && dtpDeltaPct >= 0 ? `Điểm sáng lớn nhất là Đơn DTP: vừa tăng khối lượng ${dtpDeltaPct.toFixed(1)}% vừa cải thiện SLA 24h từ ${slaDTP_prev}% lên ${slaDTP_cur}%.` : `Đơn DTP ${trendWord(dtpDeltaPct)} ${Math.abs(dtpDeltaPct).toFixed(1)}%, SLA 24h ở mức ${slaDTP_cur}%.`} ${!cSlaUp && cDeltaPct > 0 ? `Ngược lại, Đơn C truyền thống cho thấy dấu hiệu quá tải: SLA giảm từ ${slaC_prev}% xuống ${slaC_cur}% khi khối lượng tăng ${cDeltaPct.toFixed(1)}%, cần theo dõi sát nếu xu hướng này tiếp tục.` : `Đơn C truyền thống ${trendWord(cDeltaPct)} ${Math.abs(cDeltaPct).toFixed(1)}%, SLA 24h ở mức ${slaC_cur}%.`} ${bvChuaGiao > 0 ? `Số đơn chưa giao vẫn ở mức ${bvChuaGiao} đơn, cần tiếp tục ưu tiên xử lý.` : ''}`.trim()

  const sol1Priority = (!cSlaUp && cDeltaPct > 30) ? 'high' : 'low'
  const sol1 = (!cSlaUp && cDeltaPct > 0)
    ? `SLA giảm từ ${slaC_prev}% xuống ${slaC_cur}% khi sản lượng tăng ${cDeltaPct.toFixed(1)}% — cần chuẩn bị phương án tăng nguồn lực nếu đà tăng trưởng này tiếp diễn trong tuần tới.`
    : `SLA Đơn C đang ổn định ở mức ${slaC_cur}%, tiếp tục duy trì.`
  const sol2Priority = bvChuaGiao > 0 ? 'high' : 'low'
  const sol2 = bvChuaGiao > 0
    ? `Số đơn chưa giao vẫn duy trì ở mức ${bvChuaGiao} đơn tại kênh trực tiếp — tiếp tục ưu tiên xử lý ngay do tính chất khẩn cấp cao của nhóm khách hàng này.`
    : 'Không còn tồn đọng đơn chưa giao đáng chú ý tại kênh trực tiếp.'
  const sol3 = dtpSlaUp
    ? `Xác định nguyên nhân cụ thể giúp SLA Đơn DTP ${slaDTP_cur >= slaDTP_prev ? `tăng ${(slaDTP_cur - slaDTP_prev).toFixed(1)} điểm %` : ''} dù khối lượng tăng, để áp dụng kinh nghiệm cho Đơn C và các kênh khác.`
    : 'Rà soát nguyên nhân SLA Đơn DTP chưa cải thiện dù khối lượng biến động.'
  const sol4 = `Biến động SLA Đơn C tại Viettel Post (${slaC_prev !== undefined ? '' : ''}quy mô ${current.viettelC?.total || 0} đơn) — cần thêm dữ liệu để xác định đây là biến động ngẫu nhiên hay xu hướng thực sự.`

  return {
    cocauTone: ttDeltaPct >= 0 ? 'pos' : 'neg', cocauTitle, cocauBody,
    dtpTone: dtpDeltaPct >= 0 && dtpSlaUp ? 'pos' : dtpSlaUp ? 'neutral' : 'neg', dtpTitle, dtpBody,
    cTone: !cSlaUp && cDeltaPct > 0 ? 'neg' : 'pos', cTitle, cBody,
    vtpTone: vtpDVCUp ? 'warn' : 'pos', vtpTitle, vtpBody,
    verdict,
    sol1, sol2, sol3, sol4,
    priority1: sol1Priority, priority2: sol2Priority,
    totalTTCur, totalTTPrev, ttDeltaPct, cDeltaPct, dtpDeltaPct,
    slaC_cur, slaC_prev, slaDTP_cur, slaDTP_prev,
  }
}
