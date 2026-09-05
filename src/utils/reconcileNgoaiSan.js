import { isCancelledStatus, isHoanHangStatus } from './parseCarrierExport'

const clean = s => String(s || '').replace(/^'+|'+$/g, '').trim()

// "Tạo lúc" trong file "Danh sách thống kê" (đội kinh doanh lên đơn) đôi khi bị Excel tách thành 2 cột:
// giờ ("17:44") ở cột "Tạo lúc", ngày kiểu M/D/YY ("9/4/26") ở cột liền kề không có tên — ghép lại thành
// 1 mốc thời gian đầy đủ. Fallback: 1 cột duy nhất dạng chuỗi "17:44 04/09/2026" (giờ:phút ngày/tháng/năm).
function parseTaoLuc(row) {
  const timePart = clean(row['Tạo lúc'])
  // Cột ngày không có tiêu đề: SheetJS đặt tên "__EMPTY" (đọc qua sheet_to_json mặc định) — ""
  // chỉ xảy ra khi tự dựng object bằng tay (vd script ngoài trình duyệt dùng header:1).
  const datePart = clean(row['__EMPTY'] ?? row[''])
  const mTime = timePart.match(/^(\d{1,2}):(\d{2})$/)
  const mDate = datePart.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (mTime && mDate) {
    const [, hh, mm] = mTime
    let [, MM, dd, yy] = mDate
    yy = yy.length === 2 ? 2000 + Number(yy) : Number(yy)
    return new Date(yy, Number(MM) - 1, Number(dd), Number(hh), Number(mm))
  }
  const m = timePart.match(/^(\d{1,2}):(\d{2})\s+(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!m) return null
  const [, hh, mm, dd, MM, yyyy] = m
  return new Date(Number(yyyy), Number(MM) - 1, Number(dd), Number(hh), Number(mm))
}

// SPX xuất "Thời gian lấy hàng/gửi hàng"/"Thời gian giao hàng" theo yyyy-mm-dd HH:mm
function parseSpxDateTime(str) {
  const s = clean(str)
  if (!s || s === '-') return null
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})[ T]?(\d{1,2}):(\d{2})/)
  if (!m) return null
  const [, yyyy, MM, dd, hh, mm] = m
  return new Date(Number(yyyy), Number(MM) - 1, Number(dd), Number(hh), Number(mm))
}

// File "bốc đóng" xuất "TG Đóng kiện" theo dd/mm/yyyy HH:mm
function parseVnDateTime(str) {
  const s = clean(str)
  if (!s) return null
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})/)
  if (!m) return null
  const [, dd, MM, yyyy, hh, mm] = m
  return new Date(Number(yyyy), Number(MM) - 1, Number(dd), Number(hh), Number(mm))
}

function fmtDateTime(d) {
  if (!d) return ''
  const p = n => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())} ${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`
}

// Gộp "Mã đơn" -> "Tạo lúc" (mốc 1) từ TOÀN BỘ các tuần file "Danh sách thống kê" đã upload (tích luỹ dần)
export function buildSalesOrderLookup(weeks) {
  const map = new Map()
  for (const w of weeks || []) {
    for (const row of w.rows || []) {
      const maDon = clean(row['Mã đơn'])
      if (!maDon) continue
      const taoLuc = parseTaoLuc(row)
      if (taoLuc) map.set(maDon, taoLuc)
    }
  }
  return map
}

// Tên cột thời điểm đóng kiện đổi khác nhau tuỳ nguồn file: "TG Đóng kiện" (file bốc đóng đa kênh)
// hoặc "TG Đóng hàng" (file "Đóng hàng website" — riêng kênh website/SPX).
export function getPackingTimeRaw(row) {
  return row['TG Đóng kiện'] ?? row['TG Đóng hàng']
}

// Gộp "Mã vận đơn" -> thời điểm đóng kiện (mốc 2) từ TOÀN BỘ các tuần file bốc đóng đã upload (tích luỹ dần)
export function buildPackingLookup(weeks) {
  const map = new Map()
  for (const w of weeks || []) {
    for (const row of w.rows || []) {
      const code = clean(row['Mã vận đơn']).toUpperCase()
      if (!code) continue
      const dongKien = parseVnDateTime(getPackingTimeRaw(row))
      if (dongKien) map.set(code, dongKien)
    }
  }
  return map
}

// Đối soát "đơn ngoại sàn" (SPX COD) theo 4 mốc thời gian:
//   Mốc 1 - Tạo lúc (đội kinh doanh lên đơn, file Danh sách thống kê)
//   Mốc 2 - Đóng kiện (kho đóng kiện xong, file bốc đóng, nối qua "Mã vận đơn")
//   Mốc 3 - SPX lấy hàng (file SPX)
//   Mốc 4 - SPX giao hàng thành công (file SPX, chỉ tính khi Trạng thái = "Đã giao hàng")
// 3 tiêu chí:
//   A) Đóng kiện (M1->M2): đạt khi <=24h — trách nhiệm của kho
//   B) SPX lấy hàng (M2->M3): thống kê theo nhóm ≤24h/≤48h/≤72h/>72h TÍNH TỪ LÚC ĐÓNG KIỆN XONG — trách nhiệm của SPX
//   C) Giao hàng thành công (M1->M4): đạt khi <=48h — cam kết tổng với khách hàng
// Đơn "Đã hủy" bỏ qua đối soát; "Đang/Đã trả hàng" tính là Hoàn hàng (vẫn giữ mốc 2/3 nếu có).
// excludedCodes: Mã đơn đã đánh dấu tay "không cần tính" khi đang ở nhóm "Chưa lấy hàng" (đơn trùng, chỉ
// cần huỷ bên SPX) — loại khỏi thống kê nhóm lấy hàng + giao hàng, không phải vấn đề thật.
export function reconcileNgoaiSan(spxRows, salesLookup, packingLookup, excludedCodes = new Set()) {
  const now = new Date()
  const rows = []
  const stats = {
    total: 0, khongKhop: 0, huy: 0, hoanHang: 0, boQua: 0,
    dungHanDongKien: 0, treDongKien: 0, choDongKien: 0, quaHanChuaDongKien: 0,
    layTrong24h: 0, layTrong48h: 0, layTrong72h: 0, layQua72h: 0, layChuaLay: 0, khongCoDuLieuDongKien: 0,
    dungHanGiao: 0, treHanGiao: 0, dangXuLyGiao: 0, chuaGiaoQuaHan: 0,
  }

  for (const spx of spxRows || []) {
    const maDon = clean(spx['Mã khách hàng'])
    const trangThai = spx['Trạng thái hiện tại']
    const moc1 = salesLookup.get(maDon) || null

    if (!moc1) {
      stats.khongKhop++
      rows.push({
        maDon, trangThai, moc1: '', moc2: '', gioDongKien: '', tinhTrangDongKien: 'Không khớp Mã đơn',
        moc3: '', gioLaySauDongKien: '', nhomLay: 'Không khớp Mã đơn',
        moc4: '', gioGiaoTong: '', tinhTrangGiao: 'Không khớp Mã đơn',
      })
      continue
    }
    stats.total++

    const trackingCode = clean(spx['Mã vận đơn']).toUpperCase()
    const moc2 = packingLookup.get(trackingCode) || null
    const moc3 = parseSpxDateTime(spx['Thời gian lấy hàng/gửi hàng'])
    const moc4raw = parseSpxDateTime(spx['Thời gian giao hàng'])
    const moc4 = trangThai === 'Đã giao hàng' ? moc4raw : null

    if (isCancelledStatus(spx, 'spx')) {
      stats.huy++
      rows.push({
        maDon, trangThai, moc1: fmtDateTime(moc1), moc2: fmtDateTime(moc2), gioDongKien: '',
        tinhTrangDongKien: 'Đã huỷ — không đối soát', moc3: fmtDateTime(moc3), gioLaySauDongKien: '',
        nhomLay: 'Đã huỷ — không đối soát', moc4: fmtDateTime(moc4raw), gioGiaoTong: '',
        tinhTrangGiao: 'Đã huỷ — không đối soát',
      })
      continue
    }

    // A) Đóng kiện: mốc1 -> mốc2, đạt khi <=24h
    let gioDongKien, tinhTrangDongKien
    if (moc2) {
      gioDongKien = (moc2 - moc1) / 3600000
      tinhTrangDongKien = gioDongKien <= 24 ? 'Đạt (≤24h)' : 'TRỄ ĐÓNG KIỆN (>24h)'
      if (tinhTrangDongKien === 'Đạt (≤24h)') stats.dungHanDongKien++
      else stats.treDongKien++
    } else {
      gioDongKien = (now - moc1) / 3600000
      tinhTrangDongKien = gioDongKien <= 24 ? 'Đang chờ đóng kiện, còn hạn' : 'CHƯA ĐÓNG KIỆN — QUÁ 24H'
      if (tinhTrangDongKien === 'Đang chờ đóng kiện, còn hạn') stats.choDongKien++
      else stats.quaHanChuaDongKien++
    }

    // B) SPX lấy hàng: mốc2 -> mốc3, nhóm theo 24h/48h/72h TÍNH TỪ LÚC ĐÓNG KIỆN (cần có mốc2)
    let gioLaySauDongKien, nhomLay
    // Chỉ có hiệu lực khi đơn đang ở nhóm "Chưa lấy hàng" (checkbox chỉ hiện ở nhóm này) — tính trước để
    // dùng nhất quán cho cả thống kê nhóm lấy hàng lẫn thống kê giao hàng bên dưới (cùng 1 đơn, cùng áp dụng).
    let isExcluded = false
    if (!moc2) {
      nhomLay = 'Không có dữ liệu đóng kiện'
      stats.khongCoDuLieuDongKien++
    } else if (moc3) {
      gioLaySauDongKien = (moc3 - moc2) / 3600000
      nhomLay = gioLaySauDongKien <= 24 ? '≤24h' : gioLaySauDongKien <= 48 ? '≤48h' : gioLaySauDongKien <= 72 ? '≤72h' : '>72h'
      if (nhomLay === '≤24h') stats.layTrong24h++
      else if (nhomLay === '≤48h') stats.layTrong48h++
      else if (nhomLay === '≤72h') stats.layTrong72h++
      else stats.layQua72h++
    } else {
      gioLaySauDongKien = (now - moc2) / 3600000
      nhomLay = 'Chưa lấy hàng'
      isExcluded = excludedCodes.has(maDon)
      if (isExcluded) stats.boQua++
      else stats.layChuaLay++
    }

    // C) Giao hàng thành công: mốc1 -> mốc4, đạt khi <=48h (chỉ khi Trạng thái = "Đã giao hàng")
    let gioGiaoTong, tinhTrangGiao
    if (isHoanHangStatus(spx, 'spx')) {
      gioGiaoTong = ((moc4raw || now) - moc1) / 3600000
      tinhTrangGiao = 'HOÀN HÀNG'
      stats.hoanHang++
    } else if (moc4) {
      gioGiaoTong = (moc4 - moc1) / 3600000
      tinhTrangGiao = gioGiaoTong <= 48 ? 'Đúng hạn (≤48h)' : 'TRỄ HẠN (>48h)'
      if (tinhTrangGiao === 'Đúng hạn (≤48h)') stats.dungHanGiao++
      else stats.treHanGiao++
    } else {
      gioGiaoTong = (now - moc1) / 3600000
      tinhTrangGiao = gioGiaoTong <= 48 ? 'Đang xử lý, còn trong hạn' : 'CHƯA GIAO — QUÁ 48H'
      if (tinhTrangGiao === 'Đang xử lý, còn trong hạn') stats.dangXuLyGiao++
      else if (!isExcluded) stats.chuaGiaoQuaHan++
    }

    rows.push({
      maDon, trangThai,
      moc1: fmtDateTime(moc1),
      moc2: fmtDateTime(moc2),
      gioDongKien: gioDongKien === undefined ? '' : Math.round(gioDongKien * 10) / 10,
      tinhTrangDongKien,
      moc3: fmtDateTime(moc3),
      gioLaySauDongKien: gioLaySauDongKien === undefined ? '' : Math.round(gioLaySauDongKien * 10) / 10,
      nhomLay,
      moc4: fmtDateTime(moc4),
      gioGiaoTong: Math.round(gioGiaoTong * 10) / 10,
      tinhTrangGiao,
      excludedFromReport: isExcluded,
    })
  }

  rows.sort((a, b) => (typeof b.gioGiaoTong === 'number' ? b.gioGiaoTong : -1) - (typeof a.gioGiaoTong === 'number' ? a.gioGiaoTong : -1))
  return { rows, stats }
}
