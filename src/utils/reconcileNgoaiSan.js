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

function parseSpxDateTime(str) {
  const s = clean(str)
  if (!s || s === '-') return null
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})[ T]?(\d{1,2}):(\d{2})/)
  if (!m) return null
  const [, yyyy, MM, dd, hh, mm] = m
  return new Date(Number(yyyy), Number(MM) - 1, Number(dd), Number(hh), Number(mm))
}

function fmtDateTime(d) {
  if (!d) return ''
  const p = n => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())} ${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`
}

// Gộp "Mã đơn" -> "Tạo lúc" từ TOÀN BỘ các tuần file "Danh sách thống kê" đã upload (tích luỹ dần)
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

// Đối soát "đơn ngoại sàn" (SPX COD): so "Mã đơn" (đội kinh doanh lên đơn, cột Tạo lúc) với "Mã khách hàng"
// trong file xuất SPX — tính SLA lấy hàng 24h (Tạo lúc -> SPX lấy hàng) và SLA toàn trình 48h
// (Tạo lúc -> SPX giao hàng thành công). Đơn "Đã hủy" bỏ qua đối soát; "Đang/Đã trả hàng" tính là Hoàn hàng.
// excludedCodes: tập Mã đơn đã đánh dấu tay "không cần tính" khi đang ở trạng thái "Chưa lấy — quá 24h"
// (vd đơn trùng, chỉ cần huỷ bên SPX) — loại khỏi cả 2 mục thống kê chưa lấy/chưa giao, không phải vấn đề thật.
export function reconcileNgoaiSan(spxRows, salesLookup, excludedCodes = new Set()) {
  const now = new Date()
  const rows = []
  const stats = {
    total: 0, khongKhop: 0, huy: 0, hoanHang: 0, boQua: 0,
    dungHan24h: 0, treLay24h: 0, choLay24h: 0,
    dungHan48h: 0, treHan48h: 0, choGiao48h: 0,
  }

  for (const spx of spxRows || []) {
    const maDon = clean(spx['Mã khách hàng'])
    const trangThai = spx['Trạng thái hiện tại']
    const taoLuc = salesLookup.get(maDon) || null

    if (!taoLuc) {
      stats.khongKhop++
      rows.push({
        maDon, trangThai, taoLuc: '', layHang: '', gioLay: '', tinhTrangLay: 'Không khớp Mã đơn',
        giaoHang: '', gioGiao: '', tinhTrangGiao: 'Không khớp Mã đơn',
      })
      continue
    }
    stats.total++

    const layHang = parseSpxDateTime(spx['Thời gian lấy hàng/gửi hàng'])
    const giaoHang = parseSpxDateTime(spx['Thời gian giao hàng'])

    if (isCancelledStatus(spx, 'spx')) {
      stats.huy++
      rows.push({
        maDon, trangThai, taoLuc: fmtDateTime(taoLuc), layHang: fmtDateTime(layHang), gioLay: '',
        tinhTrangLay: 'Đã huỷ — không đối soát', giaoHang: fmtDateTime(giaoHang), gioGiao: '',
        tinhTrangGiao: 'Đã huỷ — không đối soát',
      })
      continue
    }

    let gioLay, tinhTrangLay
    if (layHang) {
      gioLay = (layHang - taoLuc) / 3600000
      tinhTrangLay = gioLay <= 24 ? 'Đúng hạn (≤24h)' : 'TRỄ LẤY HÀNG (>24h)'
    } else {
      gioLay = (now - taoLuc) / 3600000
      tinhTrangLay = gioLay <= 24 ? 'Đang chờ, còn trong hạn' : 'CHƯA LẤY — QUÁ 24H'
    }
    const isExcluded = tinhTrangLay === 'CHƯA LẤY — QUÁ 24H' && excludedCodes.has(maDon)
    if (tinhTrangLay === 'Đúng hạn (≤24h)') stats.dungHan24h++
    else if (tinhTrangLay === 'TRỄ LẤY HÀNG (>24h)') stats.treLay24h++
    else if (tinhTrangLay === 'CHƯA LẤY — QUÁ 24H') {
      if (isExcluded) stats.boQua++
      else stats.choLay24h++
    }

    let gioGiao, tinhTrangGiao
    if (isHoanHangStatus(spx, 'spx')) {
      gioGiao = ((giaoHang || now) - taoLuc) / 3600000
      tinhTrangGiao = 'HOÀN HÀNG'
      stats.hoanHang++
    } else if (giaoHang) {
      gioGiao = (giaoHang - taoLuc) / 3600000
      tinhTrangGiao = gioGiao <= 48 ? 'Đúng hạn (≤48h)' : 'TRỄ HẠN (>48h)'
      if (tinhTrangGiao === 'Đúng hạn (≤48h)') stats.dungHan48h++
      else stats.treHan48h++
    } else {
      gioGiao = (now - taoLuc) / 3600000
      tinhTrangGiao = gioGiao <= 48 ? 'Đang xử lý, còn trong hạn' : 'CHƯA GIAO — QUÁ 48H'
      if (tinhTrangGiao === 'CHƯA GIAO — QUÁ 48H' && !isExcluded) stats.choGiao48h++
    }

    rows.push({
      maDon, trangThai,
      taoLuc: fmtDateTime(taoLuc),
      layHang: fmtDateTime(layHang),
      gioLay: Math.round(gioLay * 10) / 10,
      tinhTrangLay,
      giaoHang: fmtDateTime(giaoHang),
      gioGiao: Math.round(gioGiao * 10) / 10,
      tinhTrangGiao,
      excludedFromReport: isExcluded,
    })
  }

  rows.sort((a, b) => (typeof b.gioGiao === 'number' ? b.gioGiao : -1) - (typeof a.gioGiao === 'number' ? a.gioGiao : -1))
  return { rows, stats }
}
