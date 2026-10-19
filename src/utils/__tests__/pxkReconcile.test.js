import { describe, expect, it } from 'vitest'
import { buildNguonReport, isNguonRow, parseQty, readSoPhieu, receivedRowsOf, reconcilePxk } from '../pxkReconcile'

const phieu = (soPhieu, rows) => ({ soPhieu, rows })

describe('Đối chiếu sổ sách (PXK)', () => {
  it('đọc số lượng kiểu phiếu và số phiếu', () => {
    expect(parseQty('3.380,000')).toBe(3380)
    expect(parseQty('154,000')).toBe(154)
    expect(parseQty('7.200,000')).toBe(7200)
    expect(parseQty('3380')).toBe(3380)
    expect(parseQty('')).toBe(null)
    expect(readSoPhieu('PHIẾU XUẤT KHO Ngày 09 tháng 10 năm 2026 Số: FX126/005804 Lý do DH091026/03802_Kho C')).toBe('FX126/005804')
  })

  it('thực nhận lấy SL thực tế đã sửa, Kho SO tách từ Kho C theo "(SO)"', () => {
    const batch = { khoC: [
      { maHang: 'F00629', tenHang: 'Falgankid', soLo: '13626G01', slHoaDon: 3380, slThucTe: null },
      { maHang: 'S00061', tenHang: 'Salbutamol (SO)', soLo: 'A1', slHoaDon: 10, slThucTe: 8 },
    ], khoLgt: [{ maHang: 'C02918', tenHang: 'Conadin', soLo: '011026', slHoaDon: 154 }] }
    expect(receivedRowsOf(batch, 'C').map(r => [r.maHang, r.soLuong])).toEqual([['F00629', 3380]])
    expect(receivedRowsOf(batch, 'SO').map(r => [r.maHang, r.soLuong])).toEqual([['S00061', 8]])
    expect(receivedRowsOf(batch, 'DTP').map(r => r.maHang)).toEqual(['C02918'])
  })

  it('kết luận: khớp, sổ sách thiếu / thừa, không có trên PXK, lệch lô, quét chưa khớp', () => {
    const received = [
      { maHang: 'F00629', tenHang: 'Falgankid', dvt: 'ONG', soLo: '13626G01', hanDung: '2029-07-12', soLuong: 3380 },
      { maHang: 'C02918', tenHang: 'Conadin', dvt: 'LO', soLo: '011026', hanDung: '2029-10-06', soLuong: 160 },
      { maHang: 'L01286', tenHang: 'Laforin', dvt: 'LO', soLo: '010826', hanDung: '2029-08-17', soLuong: 50 },
      { maHang: 'D01997', tenHang: 'Diasyl', dvt: 'VIEN', soLo: '020726', hanDung: '2029-07-25', soLuong: 7200 },
      { maHang: 'O00092', tenHang: 'Ondansetron', dvt: 'ONG', soLo: 'X1', hanDung: '', soLuong: 150 },
    ]
    const phieus = [
      phieu('XD2611/04592', [{ maHang: 'F00629', soLo: '13626G01', hanDung: '12/07/2029', soLuong: '3.380,000' }]),
      phieu('FX126/005804', [
        { maHang: 'C02918', soLo: '011026', hanDung: '2029-10-06', soLuong: 154 },
        { maHang: 'L01286', soLo: '010826', hanDung: '2029-08-17', soLuong: 56 },
        { maHang: 'D01997', soLo: '020727', hanDung: '2029-07-25', soLuong: 7200 },
        { maHang: 'M00219', soLo: 'B2', hanDung: '', soLuong: 200 },
      ]),
    ]
    const scanned = [{ maHang: 'F00629', soLo: '13626G01', soLuong: 3000 }, { maHang: 'F00629', soLo: '13626G01', soLuong: 380 }, { maHang: 'C02918', soLo: '011026', soLuong: 150 }]
    const rows = reconcilePxk({ received, scanned, phieus })
    const tags = Object.fromEntries(rows.map(r => [r.maHang, r.tags]))
    expect(tags.F00629).toEqual(['ok'])
    expect(tags.C02918).toEqual(['thieu', 'quet'])
    expect(tags.L01286).toEqual(['thua', 'quet'])
    expect(tags.D01997).toEqual(['lot', 'quet'])
    expect(tags.O00092).toEqual(['khongPxk', 'quet'])
    expect(tags.M00219).toEqual(['khongNhan'])
    expect(rows.find(r => r.maHang === 'D01997')).toMatchObject({ pLo: '020727', phieus: ['FX126/005804'] })
    expect(rows.filter(isNguonRow).map(r => r.maHang).sort()).toEqual(['C02918', 'D01997', 'L01286', 'M00219', 'O00092'])

    const text = buildNguonReport({ C: rows }, 'chuyến nhập 10/10/2026')
    expect(text).toContain('Kho C:')
    expect(text).toContain('  FX126/005804')
    expect(text).toContain('C02918 Conadin · lô 011026: phiếu 154, thực nhận 160 LO (thiếu phiếu 6)')
    expect(text).toContain('phiếu ghi lô 020727, thực tế lô 020726')
    expect(text).not.toContain('F00629')
  })

  it('chưa thả file quét thì không báo lệch quét', () => {
    const rows = reconcilePxk({ received: [{ maHang: 'A1234', soLo: 'L', soLuong: 5 }], scanned: null, phieus: [phieu('X', [{ maHang: 'A1234', soLo: 'L', soLuong: 5 }])] })
    expect(rows[0]).toMatchObject({ b: null, tags: ['ok'] })
    expect(buildNguonReport({ C: rows })).toBe('')
  })
})

describe('Đọc PDF Phiếu xuất kho mẫu CPC1 Hà Nội', () => {
  it('đọc đúng chữ trích từ PDF thật (tiêu đề cột và cột bị trộn thứ tự)', async () => {
    const { parseCpc1PxkPdf, readPxkPdfRows } = await import('../pxkReconcile')
    // Chữ trích từ file PHIẾU BỔ SUNG HCM (XD2611/04824) bằng extractPdfText
    const text = 'CÔNG TY CỔ PHẦN DƯỢC PHẨM CPC1 HÀ NỘI Ngày 19 tháng 10 năm 2026 PHIẾU XUẤT KHO Số phiếu: XD2611/04824 Đơn vị mua hàng Công ty Cổ phần UPHARMA '
      + 'XUẤT LOGICTICS - CN HỒ CHÍ MINH 19/10 Lý do xuất kho: Xuất tại kho (ngăn lô): 010108 Địa điểm: Nước SX Lô Hạn dùng Số lượng Đvt Tên vật tư Mã vật tư Stt '
      + 'A B C 2 3 4 1 D 1 Zensonid - Hộp 10 lọ x 2 ml (BFS-R) Z00338 LO 1.050,000 22926F01 CPC1HN-VNM 11/06/2028 2 3 4 5 6 7 8 9 10 '
      + 'Ngày........tháng........năm................ NGƯỜI LẬP THỦ KHO'
    expect(readSoPhieu(text)).toBe('XD2611/04824')
    expect(parseCpc1PxkPdf(text)).toEqual([{ maHang: 'Z00338', tenHang: 'Zensonid - Hộp 10 lọ x 2 ml (BFS-R)', dvt: 'LO', soLuong: 1050, soLo: '22926F01', hanDung: '2028-06-11' }])
    expect(readPxkPdfRows(text, () => [])).toHaveLength(1)

    // Nhiều dòng, chữ Nước SX bị ngắt "CPC1HN-VN M"
    const multi = 'Stt Mã vật tư Tên vật tư Đvt Số lượng Hạn dùng Lô Nước SX A B C D 2 3 4 1 '
      + '1 Falgankid 25 mg/ml - Hộp 4 vỉ x 5 ống 10ml W00520 ONG 60,000 CPC1HN-VN M 020126 12/01/2029 '
      + '2 Linezolid-SB - Túi 300ml L01289 TUI 1,000 CPC1HN-VN M 04926G01 15/01/2029 3 4 5 Số chứng từ gốc kèm theo: Ngày........tháng'
    expect(parseCpc1PxkPdf(multi).map(r => [r.maHang, r.tenHang, r.dvt, r.soLuong, r.soLo, r.hanDung])).toEqual([
      ['W00520', 'Falgankid 25 mg/ml - Hộp 4 vỉ x 5 ống 10ml', 'ONG', 60, '020126', '2029-01-12'],
      ['L01289', 'Linezolid-SB - Túi 300ml', 'TUI', 1, '04926G01', '2029-01-15'],
    ])
  })
})
