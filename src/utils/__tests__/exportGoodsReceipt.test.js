import { describe, expect, it } from 'vitest'
import { buildReceiptWorkbook } from '../exportGoodsReceipt'
import { parsePdfMetadata } from '../parseGoodsReceipt'

describe('exportGoodsReceipt', () => {
  it('fills template header metadata from pdf text', () => {
    const pdfText = 'Ngày 28 tháng 08 năm 2026 Họ và tên: Đặng Thanh Hải Biển số xe: 29E-785.54 SĐT liên hệ: 0979694941'
    const meta = parsePdfMetadata(pdfText)
    expect(meta.ngayNhap).toBe('28/08/2026')
    expect(meta.benVanChuyen).toContain('Đặng Thanh Hải')
    expect(meta.benGiaoHang).toContain('28/08/2026')
  })

  it('builds "BIÊN BẢN NHẬP HÀNG" sheet theo đúng mẫu giấy — có Kiện nguyên/Kiện lẻ sau Hạn dùng, Chênh lệch tự tính từ SL thực tế', () => {
    const wb = buildReceiptWorkbook([
      {
        maHang: 'A01259',
        tenHang: 'Aricamun - 2 vỉ x 15 viên',
        dvt: 'VIEN',
        soLo: '010426',
        hanDung: '2028-04-23',
        kienNguyen: 2,
        kienLe: 1,
        slHoaDon: 7920,
        slThucTe: 7900,
        ghiChu: '',
      },
    ], { warehouseLabel: 'KHO C', metadata: { ngayNhap: '28/08/2026' } })

    const ws = wb.Sheets['BIEN BAN NHAP HANG']
    // Tìm đúng dòng tiêu đề bảng ("STT") và dòng dữ liệu ngay sau 2 dòng tiêu đề — không hardcode số dòng
    // vì layout dựng bằng code, tránh test gãy khi chỉnh thêm/bớt dòng header phía trên.
    const headerRow = Object.keys(ws).find(addr => /^A\d+$/.test(addr) && ws[addr].v === 'STT')
    const headerRowNum = Number(headerRow.slice(1))
    const dataRow = headerRowNum + 2

    expect(ws[`F${headerRowNum}`].v).toBe('Kiện nguyên')
    expect(ws[`G${headerRowNum}`].v).toBe('Kiện lẻ')
    expect(ws[`H${headerRowNum}`].v).toBe('Số lượng')
    expect(ws[`H${headerRowNum + 1}`].v).toBe('Hoá đơn')
    expect(ws[`I${headerRowNum + 1}`].v).toBe('Thực tế')
    expect(ws[`J${headerRowNum + 1}`].v).toBe('Thiếu')
    expect(ws[`K${headerRowNum + 1}`].v).toBe('Hư hỏng')

    expect(ws[`B${dataRow}`].v).toContain('A01259')
    expect(ws[`F${dataRow}`].v).toBe(2)
    expect(ws[`G${dataRow}`].v).toBe(1)
    expect(ws[`H${dataRow}`].v).toBe(7920)
    expect(ws[`I${dataRow}`].v).toBe(7900)
    expect(ws[`J${dataRow}`].f).toContain('IF(H')
  })
})
