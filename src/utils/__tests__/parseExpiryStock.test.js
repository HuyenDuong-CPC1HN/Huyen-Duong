import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { parseExpiryStockWorkbook, parseReportDateRange, isSlowMoving, classifyExpiry, drugAgeMonths, CAN_DATE_BUCKETS } from '../parseExpiryStock'

// Tái tạo đúng cấu trúc file thật "Báo cáo tổng hợp nhập xuất tồn theo kho": vài dòng tiêu đề (tên báo
// cáo, khoảng ngày "Từ ngày ... đến ngày ...") phía trên bảng dữ liệu thật.
function buildWorkbook(dateRangeText, dataRows) {
  const aoa = [
    [],
    [],
    ['Báo cáo tổng hợp nhập xuất tồn theo kho'],
    [dateRangeText],
    [],
    ['Stt', 'Mã vật tư', 'Tên vật tư', 'Mã kho', 'Đvt', 'Mã lô ', 'Hạn dùng', 'Tồn đầu', 'Sl nhập', 'Sl xuất', 'Tồn cuối'],
    ...dataRows,
  ]
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
}

describe('parseReportDateRange', () => {
  it('đọc đúng khoảng ngày từ dòng "Từ ngày ... đến ngày ..." ở đầu file, tính đúng số ngày', () => {
    const buffer = buildWorkbook('Từ ngày 01/06/2026 đến ngày 10/09/2026', [])
    const range = parseReportDateRange(buffer)
    expect(range).toEqual({ tuNgay: '2026-06-01', denNgay: '2026-09-10', soNgay: 101 })
  })

  it('không phụ thuộc múi giờ máy chạy — không được lùi/tăng 1 ngày do quy đổi giờ địa phương -> UTC', () => {
    // Kịch bản đúng bug đã gặp khi viết hàm này: dựng Date theo giờ ĐỊA PHƯƠNG rồi .toISOString() ở múi
    // giờ dương (vd Việt Nam +7, đúng múi giờ trình duyệt người dùng) làm lùi lại 1 ngày khi cắt chuỗi.
    const buffer = buildWorkbook('Từ ngày 01/01/2026 đến ngày 31/12/2026', [])
    const range = parseReportDateRange(buffer)
    expect(range.tuNgay).toBe('2026-01-01')
    expect(range.denNgay).toBe('2026-12-31')
  })

  it('trả về null khi file không có dòng khai khoảng ngày', () => {
    const buffer = buildWorkbook('Không có khoảng ngày nào ở đây', [])
    expect(parseReportDateRange(buffer)).toBeNull()
  })
})

describe('isSlowMoving', () => {
  it('còn tồn kho + không phát sinh nhập lẫn xuất -> chậm luân chuyển', () => {
    expect(isSlowMoving({ tonCuoi: 5, slNhap: 0, slXuat: 0 })).toBe(true)
  })
  it('hết tồn kho (tonCuoi = 0) thì KHÔNG tính, dù không phát sinh nhập/xuất — không còn gì để luân chuyển', () => {
    expect(isSlowMoving({ tonCuoi: 0, slNhap: 0, slXuat: 0 })).toBe(false)
  })
  it('có phát sinh nhập hoặc xuất thì không phải chậm luân chuyển', () => {
    expect(isSlowMoving({ tonCuoi: 5, slNhap: 3, slXuat: 0 })).toBe(false)
    expect(isSlowMoving({ tonCuoi: 5, slNhap: 0, slXuat: 2 })).toBe(false)
  })
})

describe('parseExpiryStockWorkbook + isSlowMoving — lọc đúng trên dữ liệu thật', () => {
  it('lọc đúng danh sách hàng chậm luân chuyển từ 1 file mẫu nhiều dòng', () => {
    const buffer = buildWorkbook('Từ ngày 01/06/2026 đến ngày 10/09/2026', [
      [1, 'A00001', 'Hàng chậm luân chuyển', '020101', 'HOP', 'L1', '', 0, 0, 0, 20],
      [2, 'A00002', 'Hàng có nhập', '020101', 'HOP', 'L2', '', 0, 10, 0, 10],
      [3, 'A00003', 'Hàng có xuất', '020101', 'HOP', 'L3', '', 5, 0, 5, 0],
      [4, 'A00004', 'Hàng hết tồn, không phát sinh', '020101', 'HOP', 'L4', '', 0, 0, 0, 0],
    ])
    const rows = parseExpiryStockWorkbook(buffer)
    const slow = rows.filter(isSlowMoving)
    expect(slow).toHaveLength(1)
    expect(slow[0].maVatTu).toBe('A00001')
  })
})

describe('classifyExpiry + drugAgeMonths — mốc cận date và tuổi thuốc như file báo cáo', () => {
  const today = new Date(2026, 5, 15) // 15/06/2026

  it('chia đúng nhóm: hết hạn, dưới 3 tháng, dưới 6 tháng, 6 đến dưới 18 tháng, an toàn', () => {
    expect(classifyExpiry('2026-06-01', today)).toBe('expired')
    expect(classifyExpiry('2026-09-14', today)).toBe('near3')
    expect(classifyExpiry('2026-12-14', today)).toBe('near6')
    expect(classifyExpiry('2026-12-15', today)).toBe('near18')
    expect(classifyExpiry('2027-12-14', today)).toBe('near18')
    expect(classifyExpiry('2027-12-15', today)).toBe('safe')
    expect(classifyExpiry(null, today)).toBe('unknown')
    expect(CAN_DATE_BUCKETS).toEqual(['expired', 'near3', 'near6'])
  })

  it('tuổi thuốc = số tháng tròn như DATEDIF(TODAY(), Hạn dùng, "m"), âm khi đã hết hạn', () => {
    expect(drugAgeMonths('2026-08-15', today)).toBe(2)
    expect(drugAgeMonths('2026-08-14', today)).toBe(1)
    expect(drugAgeMonths('2027-01-04', today)).toBe(6)
    expect(drugAgeMonths('2026-06-15', today)).toBe(0)
    expect(drugAgeMonths('2026-04-10', today)).toBe(-2)
    expect(drugAgeMonths(null, today)).toBeNull()
  })

  it('đọc cột "Tên lô" nếu file gốc có', () => {
    const aoa = [
      ['Stt', 'Mã vật tư', 'Tên vật tư', 'Mã kho', 'Đvt', 'Mã lô ', 'Tên lô', 'Hạn dùng', 'Tồn đầu', 'Sl nhập', 'Sl xuất', 'Tồn cuối'],
      [1, 'A1', 'Hàng A', '020101', 'HOP', 'L1', 'Lô một', '', 0, 0, 0, 5],
    ]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Sheet1')
    const [row] = parseExpiryStockWorkbook(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }))
    expect(row.maLo).toBe('L1')
    expect(row.tenLo).toBe('Lô một')
  })
})
