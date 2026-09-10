// Parser riêng cho "Phiếu xuất kho" (Mẫu 02-VT) dùng trong quy trình Kho A của tab Theo dõi hàng huỷ:
// người dùng upload thẳng file PDF phiếu xuất kho, app tự đọc để điền Biên bản Xử lý — khác với
// parsePhieuXuatKhoPdf (parseGoodsReceipt.js, dùng cho tab Nhập hàng): file này KHÔNG có mốc "Vị trí" để
// cắt bỏ phần header, và cột "Nước SX" có SỐ TOKEN THAY ĐỔI (0, 1, hoặc 2 - vd "CPC1HN-VN M") thay vì luôn
// đúng 1 token, nên không thể tái dùng regex đếm-token-cố-định của hàm kia.
//
// Thứ tự token thật trên mỗi dòng dữ liệu: Stt, Tên vật tư, Mã vật tư, Đvt, Số lượng, [Nước SX - bỏ qua],
// Lô, Hạn dùng (dd/mm/yyyy). Chiến lược đọc: neo theo Mã vật tư (rất đặc trưng: 1 chữ cái + 4-5 số), rồi
// tìm ngày gần nhất phía sau làm mốc kết thúc dòng - tránh phải đếm cứng số token "Nước SX" cần bỏ qua.
export function parsePhieuXuatKhoHangHuyPdf(pdfText) {
  if (!pdfText) return []
  let compact = String(pdfText).replace(/\s+/g, ' ').trim()
  // Cắt bỏ phần header (quốc hiệu, tiêu đề, các trường ngày/số/lý do xuất...) tính đến hết dòng tiêu đề
  // bảng "...Nước SX" rồi đến dòng mã cột "A B C D 2 3 4 1" - phần còn lại bắt đầu đúng từ Stt=1.
  compact = compact.replace(/^[\s\S]*?Nước SX\s*/i, '')
  compact = compact.replace(/^\s*A\s+B\s*C\s+D\s+2\s+3\s+4\s+1\s*/i, '')

  const maVatTuRe = /\b([A-Z]\d{4,5})\b/g
  const anchors = [...compact.matchAll(maVatTuRe)]
  const dateRe = /(\d{1,2})\/(\d{1,2})\/(\d{4})/g

  const rows = []
  let cursorEnd = 0

  for (const anchor of anchors) {
    const maHang = anchor[1]
    const beforeChunk = compact.slice(cursorEnd, anchor.index).trim()
    const sttMatch = /^(\d{1,3})\s+([\s\S]+)$/.exec(beforeChunk)

    // Luôn tìm ngày (mốc kết thúc dòng) và cập nhật cursorEnd trước, kể cả khi sttMatch thất bại - nếu
    // không, 1 dòng không khớp sẽ kéo theo hỏng luôn việc đọc mọi dòng phía sau nó.
    dateRe.lastIndex = anchor.index + maHang.length
    const dateMatch = dateRe.exec(compact)
    if (!dateMatch) break // hết dữ liệu thật (đã sang phần chữ ký/footer, không còn ngày nào nữa)

    if (!sttMatch) {
      cursorEnd = dateMatch.index + dateMatch[0].length
      continue
    }
    const tenHang = sttMatch[2].trim()

    const afterMaHang = compact.slice(anchor.index + maHang.length, dateMatch.index).trim()
    const tokens = afterMaHang.split(/\s+/)
    const dvt = tokens[0] || ''
    const soLuongRaw = tokens[1] || ''
    const soLo = tokens[tokens.length - 1] || ''
    // tokens[2..length-2] (nếu có) là "Nước SX" - không dùng tới.

    const soLuong = Number(soLuongRaw.split(',')[0].replaceAll('.', ''))
    const [, dd, mo, yyyy] = dateMatch

    if (Number.isFinite(soLuong) && dvt && soLo) {
      rows.push({
        maHang,
        tenHang,
        dvt,
        soLuong,
        soLo,
        hanDung: `${yyyy}-${mo.padStart(2, '0')}-${dd.padStart(2, '0')}`,
      })
    }
    cursorEnd = dateMatch.index + dateMatch[0].length
  }
  return rows
}

// Ngày lập phiếu (vd "Ngày 29 tháng 08 năm 2026") - dùng làm ngày lập biên bản mặc định.
export function parsePhieuXuatKhoNgayLap(pdfText) {
  const compact = String(pdfText || '').replace(/\s+/g, ' ')
  const m = /Ngày\s+(\d{1,2})\s+tháng\s+(\d{1,2})\s+năm\s+(\d{4})/i.exec(compact)
  if (!m) return ''
  const [, dd, mo, yyyy] = m
  return `${yyyy}-${mo.padStart(2, '0')}-${dd.padStart(2, '0')}`
}
