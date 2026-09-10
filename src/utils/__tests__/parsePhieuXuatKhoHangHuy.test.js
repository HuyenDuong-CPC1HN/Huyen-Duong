import { describe, expect, it } from 'vitest'
import { parsePhieuXuatKhoHangHuyPdf, parsePhieuXuatKhoNgayLap } from '../parsePhieuXuatKhoHangHuy'

// Văn bản trích thật từ 1 file "Phiếu xuất kho" (Mẫu 02-VT) người dùng gửi cho quy trình Kho A —
// giữ nguyên các đặc điểm khó của định dạng thật: cột "Nước SX" có lúc 0 token (dòng 1), lúc 1 token
// (dòng 18: "DTP-VNM"), lúc 2 token (đa số các dòng còn lại: "CPC1HN-VN M").
const SAMPLE_PDF_TEXT = `CÔNG TY CP DƯỢC PHẨM CPC1 HÀ NỘI - CHI NHÁNH TP HỒ CHÍ MINH Số 26-28 đường Hàn Mạc Tử, Phường Phú Thọ Hòa, Thành phố Hồ Chí Minh, Việt Nam  Mẫu số 02-VT  (Kèm theo Thông tư số 99/2025/TT-BTC ngày 27/10/2025 của Bộ trưởng Bộ Tài chính)  Ngày 29 tháng 08 năm 2026  PHIẾU XUẤT KHO  Số:   XK2621/00769 Xuất tại kho (ngăn lô): Lý do xuất kho: Họ và tên người nhận hàng:   Xuất xử lý Xuất hàng cận date theo biên bản ngày 28/08/2026 020110   Địa điểm: Địa chỉ (bộ phận): Đơn vị mua hàng  Stt   Mã vật tư   Tên vật tư   Đvt   Số lượng   Hạn dùng Lô Nước SX  A   B C   D   2   3   4 1  1   Combo Aricamun C02161   BO   14,000   010   26/08/2026  2   Mogarna cream - 15g J00559   TUYP   51,000 CPC1HN-VN M 403   13/08/2026  3   pH Balance Intimate Gel - 200ml J00577   LO   495,000 CPC1HN-VN M 010823   07/08/2026  18   Thạch dinh dưỡng Zodiac - Túi 12 gói 15g W00555   TUI   383,000 DTP-VNM   409   20/08/2026  19   Brometic 2mg/10ml W00511   ONG   9.138,000 CPC1HN-VN M 010824   13/08/2026
Stt   Mã vật tư   Tên vật tư   Đvt   Số lượng   Hạn dùng Lô Nước SX  A   B C   D   2   3   4 1  Số chứng từ gốc kèm theo: Ngày........tháng........năm................  NGƯỜI LẬP   THỦ KHO NGƯỜI NHẬN HÀNG  (Ký, họ tên)   (Ký, họ tên)   (Ký, họ tên)  QUẢN LÝ BỘ PHẬN  (Ký, họ tên)
`

describe('parsePhieuXuatKhoHangHuyPdf', () => {
  it('đọc đúng từng dòng — kể cả khi "Nước SX" có 0, 1, hoặc 2 token (khác phiếu xuất kho ở tab Nhập hàng, luôn đúng 1 token)', () => {
    const rows = parsePhieuXuatKhoHangHuyPdf(SAMPLE_PDF_TEXT)
    expect(rows).toHaveLength(5)

    expect(rows[0]).toEqual({ maHang: 'C02161', tenHang: 'Combo Aricamun', dvt: 'BO', soLuong: 14, soLo: '010', hanDung: '2026-08-26' })
    expect(rows[1]).toEqual({ maHang: 'J00559', tenHang: 'Mogarna cream - 15g', dvt: 'TUYP', soLuong: 51, soLo: '403', hanDung: '2026-08-13' })
    expect(rows[3].maHang).toBe('W00555') // dòng 18 - "Nước SX" 1 token ("DTP-VNM")
    expect(rows[3].soLo).toBe('409')
    expect(rows[4].soLuong).toBe(9138) // "9.138,000" - dấu "." phân cách nghìn, dấu "," phân cách thập phân
  })

  it('bỏ qua đúng phần header lặp lại ở trang 2 (không có ngày -> dừng đọc, không lẫn vào chữ ký)', () => {
    const rows = parsePhieuXuatKhoHangHuyPdf(SAMPLE_PDF_TEXT)
    expect(rows.every(r => r.maHang && r.tenHang && r.soLuong > 0)).toBe(true)
  })

  it('trả về mảng rỗng khi không có nội dung', () => {
    expect(parsePhieuXuatKhoHangHuyPdf('')).toEqual([])
    expect(parsePhieuXuatKhoHangHuyPdf(null)).toEqual([])
  })
})

describe('parsePhieuXuatKhoNgayLap', () => {
  it('đọc đúng ngày lập phiếu ở phần đầu văn bản', () => {
    expect(parsePhieuXuatKhoNgayLap(SAMPLE_PDF_TEXT)).toBe('2026-08-29')
  })
  it('trả về rỗng khi không tìm thấy', () => {
    expect(parsePhieuXuatKhoNgayLap('không có ngày tháng gì ở đây')).toBe('')
  })
})
