import { describe, expect, it } from 'vitest'
import fixtures from './fixtures/phieuXuatKhoHuyText.json'
import { parsePhieuXuatKhoHuyPdf } from '../parsePhieuXuatKhoHangHuy'

// Văn bản trích thật (đúng như extractPdfText trả về) từ 2 phiếu xuất kho hàng huỷ của Kho C và Kho DTP.
describe('parsePhieuXuatKhoHuyPdf', () => {
  it('Kho C (CPC1HN): số phiếu, ngày, kho xuất, lý do và 3 dòng hàng — "60,000" là 60', () => {
    const r = parsePhieuXuatKhoHuyPdf(fixtures.khoC)
    expect(r).toMatchObject({ kho: 'C', soPhieu: 'XT2621/00810', ngayPhieu: '2026-09-30', khoXuat: '020102', lyDo: 'Xuất hàng lỗi theo biên bản ngày 15/09/2026' })
    expect(r.items).toEqual([
      { maHang: 'W00520', tenHang: 'Falgankid 25 mg/ml - Hộp 4 vỉ x 5 ống 10ml', dvt: 'ONG', soLuong: 60, soLo: '020126', hanDung: '2029-01-12' },
      { maHang: 'L01289', tenHang: 'Linezolid-SB - Túi 300ml', dvt: 'TUI', soLuong: 1, soLo: '04926G01', hanDung: '2029-01-15' },
      { maHang: 'L00784', tenHang: 'Laci-eye - Hộp 1 ống 10ml', dvt: 'ONG', soLuong: 5, soLo: '010526', hanDung: '2029-05-06' },
    ])
  })

  it('Kho DTP (UPHARMA): mã 2 chữ cái, Hạn dùng đứng trước Lô, dòng không có số lượng → soLuong null', () => {
    const r = parsePhieuXuatKhoHuyPdf(fixtures.khoDTP)
    expect(r).toMatchObject({ kho: 'DTP', soPhieu: 'XK2621/00104', ngayPhieu: '2026-09-30', khoXuat: '020105', lyDo: 'Xuất hủy hàng lỗi, có kiến trong thuốc, chảy dịch' })
    expect(r.items.map(i => [i.maHang, i.soLuong, i.soLo, i.hanDung])).toEqual([
      ['TH00893', 100, '011225', '2028-12-15'],
      ['TH03426', 2, '010526', '2029-05-26'],
      ['TB11997', 1, '06226F01', '2029-06-11'],
      ['TH00899', null, '13326G02', '2031-07-11'],
      ['TP02688', 120, '03226F01', '2029-06-08'],
    ])
    expect(r.items[3].tenHang).toBe('Golistin-enema 133ml')
    expect(r.items[4]).toMatchObject({ tenHang: 'ACTISO VIET H20', dvt: 'Ống' })
  })

  it('không phải phiếu xuất kho → không có dòng hàng', () => {
    expect(parsePhieuXuatKhoHuyPdf('').items).toEqual([])
    expect(parsePhieuXuatKhoHuyPdf('Biên bản giao nhận bất kỳ').items).toEqual([])
  })
})
