// Tách dữ liệu cho tab "Gộp kênh (Thử nghiệm)" — hoàn toàn độc lập với logic của
// SheetTab/TmdtTab, không tái sử dụng biến/constant từ các file đó.

// File "Đơn SO" (Sàn + Ngoại sàn gộp chung — schema "Báo cáo đóng gói các kiện hàng"):
// Tài khoản tạo = 'online' cho toàn bộ, tách tiếp theo Đơn vị vận chuyển.
export function splitDonSO(rows) {
  const tmdt = []
  const ngoaiSan = []
  const khac = []
  for (const row of rows) {
    const dvvc = String(row['Đơn vị vận chuyển'] ?? '').trim()
    if (dvvc === 'Đơn TMĐT') tmdt.push(row)
    else if (dvvc === 'Đơn Website CPC1HN Shop') ngoaiSan.push(row)
    else khac.push(row)
  }
  return { tmdt, ngoaiSan, khac }
}

// 4 shop TMĐT đang theo dõi, khớp đúng mã khách hàng trong cột "Mã khách hàng" của file Đơn SO
// (đã xác nhận với người dùng — cùng mã dùng ở form nhập tay TmdtTab.jsx, khác biến/không import
// chung để tab thử nghiệm này vẫn độc lập với TmdtTab.jsx).
export const TMDT_SHOPS = [
  { code: 'L00702', label: 'Zentokid Vietnam Shopee' },
  { code: 'L00671', label: 'Zentokid Vietnam' },
  { code: 'L00703', label: 'Dược Phẩm CPC1HN' },
  { code: 'L00704', label: 'DTP Sức Khỏe' },
]

// Đếm số đơn TMĐT theo từng shop (mã khách hàng) — trả về đúng thứ tự TMDT_SHOPS, kèm số đơn
// không khớp mã nào trong danh sách (nếu có, để không âm thầm bỏ sót).
export function splitTmdtByShop(tmdtRows) {
  const counts = new Map(TMDT_SHOPS.map(s => [s.code, 0]))
  let khac = 0
  for (const row of tmdtRows) {
    const code = String(row['Mã khách hàng'] ?? '').trim()
    if (counts.has(code)) counts.set(code, counts.get(code) + 1)
    else khac++
  }
  return { shops: TMDT_SHOPS.map(s => ({ ...s, count: counts.get(s.code) })), khac }
}

// File "Đơn truyền thống" (Đơn C + Đơn DTP gộp chung — schema "Bảng check kiện hàng"):
// Người tạo kiện = 'adminIT' -> Đơn DTP, còn lại (dạng 02xxxx.kho) -> Đơn C.
// Dòng chưa có "Người tạo kiện" (hoá đơn chưa đóng kiện) bị loại — khớp với cách
// ThongKeGiaoHang/ThongKeDoiTac vốn đã lọc bỏ dòng không có "Mã kiện hàng".
export function splitDonTruyenThong(rows) {
  const donC = []
  const donDTP = []
  for (const row of rows) {
    if (!String(row['Mã kiện hàng'] ?? '').trim()) continue
    const nguoiTao = String(row['Người tạo kiện'] ?? '').trim()
    if (!nguoiTao) continue
    if (nguoiTao.toLowerCase() === 'adminit') donDTP.push(row)
    else donC.push(row)
  }
  return { donC, donDTP }
}
