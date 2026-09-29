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

  it('không phải hoá đơn → báo lỗi', () => {
    expect(() => parseInvoiceLines(['Biên bản trả lại hàng'])).toThrow(/Không nhận ra hoá đơn/)
  })
})
