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
