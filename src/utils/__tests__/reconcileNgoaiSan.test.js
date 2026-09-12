import { describe, expect, it } from 'vitest'
import { buildSalesOrderLookup, buildPackingLookup, reconcileNgoaiSan } from '../reconcileNgoaiSan'

describe('buildSalesOrderLookup — đọc "Tạo lúc" theo nhiều định dạng khác nhau', () => {
  it('định dạng Excel tự đổi khi dán text từ trang web vào — "M/D/YY H:mm" (ngày trước, kiểu Mỹ)', () => {
    // Bug thật đã gặp: dán "Mã đơn"+"Tạo lúc" lấy từ trang thống kê web (qua Console) vào Excel, Excel tự
    // nhận diện thành ngày giờ và hiển thị lại theo định dạng Mỹ mặc định "9/11/26 17:24" - parser cũ chỉ
    // nhận "giờ:phút ngày/tháng/năm" (giờ trước) nên KHÔNG đọc được dòng nào, khiến toàn bộ SPX "không khớp
    // Mã đơn" khi đối soát. "9/11/26" phải hiểu là ngày 11 tháng 9 (không phải ngày 9 tháng 11).
    const weeks = [{ rows: [{ 'Mã đơn': 'ORD20260911-020751', 'Tạo lúc': '9/11/26 17:24' }] }]
    const lookup = buildSalesOrderLookup(weeks)
    const date = lookup.get('ORD20260911-020751')
    expect(date).toBeInstanceOf(Date)
    expect(date.getFullYear()).toBe(2026)
    expect(date.getMonth()).toBe(8) // tháng 9 (0-based = 8)
    expect(date.getDate()).toBe(11)
    expect(date.getHours()).toBe(17)
    expect(date.getMinutes()).toBe(24)
  })

  it('giờ 1 chữ số vẫn đọc đúng (vd "9/5/26 8:11")', () => {
    const weeks = [{ rows: [{ 'Mã đơn': 'ORD1', 'Tạo lúc': '9/5/26 8:11' }] }]
    const date = buildSalesOrderLookup(weeks).get('ORD1')
    expect(date.getMonth()).toBe(8)
    expect(date.getDate()).toBe(5)
    expect(date.getHours()).toBe(8)
    expect(date.getMinutes()).toBe(11)
  })

  it('vẫn đọc được định dạng cũ "giờ:phút ngày/tháng/năm" (1 cột, giờ trước)', () => {
    const weeks = [{ rows: [{ 'Mã đơn': 'ORD2', 'Tạo lúc': '17:44 04/09/2026' }] }]
    const date = buildSalesOrderLookup(weeks).get('ORD2')
    expect(date.getMonth()).toBe(8)
    expect(date.getDate()).toBe(4)
    expect(date.getHours()).toBe(17)
    expect(date.getMinutes()).toBe(44)
  })

  it('vẫn đọc được khi Excel tách "Tạo lúc" thành 2 cột (giờ ở "Tạo lúc", ngày M/D/YY ở cột liền kề không tên)', () => {
    const weeks = [{ rows: [{ 'Mã đơn': 'ORD3', 'Tạo lúc': '17:44', '__EMPTY': '9/4/26' }] }]
    const date = buildSalesOrderLookup(weeks).get('ORD3')
    expect(date.getMonth()).toBe(8)
    expect(date.getDate()).toBe(4)
    expect(date.getHours()).toBe(17)
  })

  it('bỏ qua dòng không đọc được "Tạo lúc" thay vì lưu nhầm', () => {
    const weeks = [{ rows: [{ 'Mã đơn': 'ORD4', 'Tạo lúc': 'không phải ngày giờ' }] }]
    expect(buildSalesOrderLookup(weeks).has('ORD4')).toBe(false)
  })
})

describe('reconcileNgoaiSan — smoke test với lookup thật đọc từ định dạng M/D/YY', () => {
  it('khớp đúng Mã đơn khi lookup đọc được "Tạo lúc" (không còn báo "Không khớp Mã đơn" oan)', () => {
    const salesLookup = buildSalesOrderLookup([
      { rows: [{ 'Mã đơn': 'ORD20260911-020751', 'Tạo lúc': '9/11/26 17:24' }] },
    ])
    const packingLookup = buildPackingLookup([])
    const spxRows = [{
      'Mã khách hàng': 'ORD20260911-020751',
      'Mã vận đơn': 'SPXVN001',
      'Trạng thái hiện tại': 'Đang giao hàng',
    }]
    const { rows, stats } = reconcileNgoaiSan(spxRows, salesLookup, packingLookup)
    expect(stats.khongKhop).toBe(0)
    expect(rows[0].tinhTrangDongKien).not.toBe('Không khớp Mã đơn')
  })
})
