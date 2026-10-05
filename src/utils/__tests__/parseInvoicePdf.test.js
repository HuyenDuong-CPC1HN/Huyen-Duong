import { describe, expect, it } from 'vitest'
import fixtures from './fixtures/invoiceLines.json'
import { parseInvoiceLines } from '../parseInvoicePdf'

// Dòng chữ trích thật từ 1 hoá đơn GTGT của Đơn DTP (UPHARMA); tên/SĐT người mua đã đổi thành dữ liệu giả.
describe('parseInvoiceLines', () => {
  it('đọc số hoá đơn, ký hiệu, ngày, bên bán → mẫu UPHARMA, người mua (bỏ tiền tố và số điện thoại), hàng hoá xuống dòng', () => {
    const r = parseInvoiceLines(fixtures.dtp_1item)
    expect(r).toMatchObject({
      soHD: '00581703', kyHieu: '1C26MNT', ngayHD: '2026-08-06', mau: 'UPHARMA', benBan: 'CÔNG TY CỔ PHẦN UPHARMA',
      benMua: { ten: 'Nguyễn Văn A', mst: '' }, tongTien: 2520000,
    })
    expect(r.items).toEqual([{
      stt: 1, ten: 'Topi Nebuliser - Hộp 10 ống 5ml', soLo: '011125', hanDung: '2028-11-28', dvt: 'Ống',
      soLuong: 30, donGia: 84000, thanhTien: 2520000, // đơn giá gồm VAT 5% (80,000 → 84,000)
    }])
  })

  it('phiếu xuất kho bán hàng Kho C: số HĐ, ký hiệu, ngày, người mua, hàng có lô/hạn dùng; trừ chiết khấu voucher vào đơn giá, tổng khớp phiếu', () => {
    const r = parseInvoiceLines(fixtures.kho_c_phieu_xuat_ban)
    expect(r).toMatchObject({
      soHD: '138169', kyHieu: 'C26MSG', ngayHD: '2026-06-29', mau: 'CPC1HN',
      benBan: 'CÔNG TY CP DƯỢC PHẨM CPC1 HÀ NỘI - CHI NHÁNH TP HỒ CHÍ MINH',
      benMua: { ten: 'Nguyễn Văn B', diaChi: '12 Đường A, Phường B, Thành phố C', mst: '' },
    })
    expect(r.items).toEqual([{
      stt: 1, ten: 'Actiso Viet - Hộp 4 vỉ x 5 ống 10ml', soLo: '010526', hanDung: '2029-05-10', dvt: 'ONG',
      soLuong: 40, donGia: 5375, thanhTien: 215000, // 238,000 gồm VAT 8% − 23,000 voucher = 215,000
    }])
    expect(r.tongTien).toBe(215000) // = Tổng cộng tiền thanh toán trên phiếu
  })

  it('không phải hoá đơn → báo lỗi', () => {
    expect(() => parseInvoiceLines(['Biên bản trả lại hàng'])).toThrow(/Không nhận ra file/)
  })

  it('hoá đơn DTP có dòng chiết khấu thương mại: bỏ qua dòng chiết khấu, giữ đơn giá gốc gồm VAT, tên hàng không dính chữ chiết khấu, lấy địa chỉ người mua', () => {
    const r = parseInvoiceLines(fixtures.dtp_chiet_khau)
    expect(r).toMatchObject({ soHD: '00753334', mau: 'UPHARMA', benMua: { ten: 'Trần Thị C', diaChi: '12 Đường A, Phường B, Tỉnh D' }, tongTien: 1692600 })
    expect(r.items).toEqual([{
      stt: 1, ten: 'Prafeno inhaler - Hộp 1 bình 200 liều xịt', soLo: '23626I01', hanDung: '2028-09-11', dvt: 'Bình',
      soLuong: 13, donGia: 130200, thanhTien: 1692600,
    }])
  })
})
