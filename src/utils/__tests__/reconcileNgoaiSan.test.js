import { describe, expect, it } from 'vitest'
import { buildSalesOrderLookup, buildAutoSalesOrderLookup, buildPackingLookup, reconcileNgoaiSan } from '../reconcileNgoaiSan'

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

describe('buildPackingLookup — đọc "TG Đóng kiện"/"TG Đóng hàng" theo nhiều định dạng khác nhau', () => {
  it('định dạng cũ dd/mm/yyyy HH:mm (năm 4 chữ số, ngày trước tháng)', () => {
    const weeks = [{ rows: [{ 'Mã vận đơn': 'SPXVN001', 'TG Đóng kiện': '18/09/2026 17:00' }] }]
    const date = buildPackingLookup(weeks).get('SPXVN001')
    expect(date).toBeInstanceOf(Date)
    expect(date.getFullYear()).toBe(2026)
    expect(date.getMonth()).toBe(8)
    expect(date.getDate()).toBe(18)
    expect(date.getHours()).toBe(17)
  })

  it('bug thật đã gặp: cột "TG Đóng hàng" (kênh website) có ô Excel định dạng "m/d/yy h:mm" (năm 2 chữ số, '
    + 'THÁNG đứng trước ngày, kiểu Mỹ) — trước đây chỉ nhận năm 4 chữ số nên toàn bộ dòng dạng này đọc null, '
    + 'khiến "Mốc 2 (Đóng kiện)" luôn báo "chưa có dữ liệu" dù cột thực ra có giá trị', () => {
    // "9/18/26 17:00" phải hiểu là 18/09/2026 (không phải ngày 9 tháng 18, và không phải ngày 18 tháng 9
    // đọc kiểu dd/mm — đây LÀ tháng 9 ngày 18, đúng thứ tự Mỹ M/D).
    const weeks = [{ rows: [{ 'Mã vận đơn': 'SPXVN002', 'TG Đóng hàng': '9/18/26 17:00' }] }]
    const date = buildPackingLookup(weeks).get('SPXVN002')
    expect(date).toBeInstanceOf(Date)
    expect(date.getFullYear()).toBe(2026)
    expect(date.getMonth()).toBe(8) // tháng 9 (0-based = 8)
    expect(date.getDate()).toBe(18)
    expect(date.getHours()).toBe(17)
    expect(date.getMinutes()).toBe(0)
  })

  it('giờ/ngày/tháng 1 chữ số vẫn đọc đúng ở định dạng "m/d/yy" (vd "9/5/26 8:11")', () => {
    const weeks = [{ rows: [{ 'Mã vận đơn': 'SPXVN003', 'TG Đóng hàng': '9/5/26 8:11' }] }]
    const date = buildPackingLookup(weeks).get('SPXVN003')
    expect(date.getMonth()).toBe(8)
    expect(date.getDate()).toBe(5)
    expect(date.getHours()).toBe(8)
    expect(date.getMinutes()).toBe(11)
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

// Mốc 1 tự động từ file Đơn SO (bỏ nút upload riêng "Sales Order" ở tab Gộp kênh Thử nghiệm) — khớp
// theo "Mã vận đơn" (so với Mã vận đơn bên file SPX, khớp 1-1 tuyệt đối), KHÁC hẳn buildSalesOrderLookup
// ở trên khớp theo "Mã đơn" (luồng upload tay cũ, vẫn giữ nguyên cho nơi khác dùng).
describe('buildAutoSalesOrderLookup — đọc "Ngày tạo" từ file Đơn SO, khớp theo "Mã vận đơn"', () => {
  it('đọc đúng định dạng "dd/mm/yyyy  HH:mm:ss" (2 khoảng trắng, đúng mẫu thật từ file)', () => {
    const rows = [{ 'Mã vận đơn': 'spxvn001', 'Ngày tạo': '02/10/2026  16:22:37' }]
    const date = buildAutoSalesOrderLookup(rows).get('SPXVN001')
    expect(date).toBeInstanceOf(Date)
    expect(date.getFullYear()).toBe(2026)
    expect(date.getMonth()).toBe(9) // tháng 10 (0-based = 9)
    expect(date.getDate()).toBe(2)
    expect(date.getHours()).toBe(16)
    expect(date.getMinutes()).toBe(22)
    expect(date.getSeconds()).toBe(37)
  })

  it('cũng đọc được khi chỉ có 1 khoảng trắng giữa ngày và giờ', () => {
    const rows = [{ 'Mã vận đơn': 'SPXVN002', 'Ngày tạo': '02/10/2026 16:22:37' }]
    expect(buildAutoSalesOrderLookup(rows).get('SPXVN002')).toBeInstanceOf(Date)
  })

  // Bug thật đã gặp: qua ExcelUpload.jsx (cột "Ngày tạo" đã thêm vào DATETIME_COLUMNS), chuỗi ra "dd/mm/yyyy
  // HH:mm" KHÔNG CÓ GIÂY — nếu parser bắt buộc phải có giây thì không dòng nào khớp, cả tuần báo
  // "không khớp Mã đơn" dù đã upload đúng file.
  it('đọc đúng cả khi KHÔNG có giây — "dd/mm/yyyy HH:mm" (dạng ExcelUpload.jsx thực tế trả về)', () => {
    const rows = [{ 'Mã vận đơn': 'SPXVN004', 'Ngày tạo': '02/10/2026 16:22' }]
    const date = buildAutoSalesOrderLookup(rows).get('SPXVN004')
    expect(date).toBeInstanceOf(Date)
    expect(date.getHours()).toBe(16)
    expect(date.getMinutes()).toBe(22)
    expect(date.getSeconds()).toBe(0)
  })

  it('đọc được cả khi không có giờ (đúng nửa đêm, ExcelUpload.jsx bỏ hẳn phần giờ)', () => {
    const rows = [{ 'Mã vận đơn': 'SPXVN005', 'Ngày tạo': '02/10/2026' }]
    const date = buildAutoSalesOrderLookup(rows).get('SPXVN005')
    expect(date).toBeInstanceOf(Date)
    expect(date.getHours()).toBe(0)
    expect(date.getMinutes()).toBe(0)
  })

  it('bỏ qua dòng thiếu Mã vận đơn hoặc không đọc được Ngày tạo thay vì lưu nhầm', () => {
    const rows = [
      { 'Mã vận đơn': '', 'Ngày tạo': '02/10/2026  16:22:37' },
      { 'Mã vận đơn': 'SPXVN003', 'Ngày tạo': 'không phải ngày giờ' },
    ]
    const lookup = buildAutoSalesOrderLookup(rows)
    expect(lookup.size).toBe(0)
  })
})

describe('reconcileNgoaiSan — autoSalesLookup (Mốc 1 tự động, khớp Mã vận đơn) ưu tiên trước salesLookup', () => {
  it('khớp Mốc 1 qua autoSalesLookup dù salesLookup (khớp Mã đơn) rỗng — không còn báo "Không khớp Mã đơn"', () => {
    const autoSalesLookup = buildAutoSalesOrderLookup([
      { 'Mã vận đơn': 'SPXVN010', 'Ngày tạo': '02/10/2026  08:00:00' },
    ])
    const spxRows = [{
      'Mã khách hàng': 'ORD-KHONG-LIEN-QUAN', // cố tình khác hẳn Mã vận đơn — xác nhận không dùng field này nữa
      'Mã vận đơn': 'SPXVN010',
      'Trạng thái hiện tại': 'Đang giao hàng',
    }]
    const { rows, stats } = reconcileNgoaiSan(spxRows, new Map(), new Map(), new Set(), autoSalesLookup)
    expect(stats.khongKhop).toBe(0)
    expect(rows[0].tinhTrangDongKien).not.toBe('Không khớp Mã đơn')
    expect(rows[0].moc1).toBe('08:00 02/10/2026')
  })

  it('không có autoSalesLookup (mặc định null) -> hành vi y hệt cũ, không ảnh hưởng nơi khác đang dùng', () => {
    const spxRows = [{ 'Mã khách hàng': 'ORD1', 'Mã vận đơn': 'SPXVN011', 'Trạng thái hiện tại': 'Đang giao hàng' }]
    const { stats } = reconcileNgoaiSan(spxRows, new Map(), new Map())
    expect(stats.khongKhop).toBe(1)
  })
})

