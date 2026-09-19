// Lọc đơn theo đúng kho HCM cho tab "Gộp kênh (Thử nghiệm)" — dựa vào nhân sự thực hiện
// "Bốc hàng"/"Đóng hàng" trên từng dòng (2 cột này ghi dạng "Tên (SĐT)", vd
// "Phạm Thị Kiều Mi (0941512763)"), đối chiếu với danh sách nhân sự kho HCM do người dùng
// tự dán vào. Một đơn được coi là "của kho HCM" khi CẢ 2 (Bốc hàng và Đóng hàng) đều là
// nhân sự trong danh sách — một đơn trọn vẹn phải được bốc + đóng cùng 1 kho.

function normalize(str) {
  return String(str || '').replace(/\s+/g, ' ').trim()
}

// Tách danh sách dán vào (mỗi dòng 1 người, "Tên (SĐT)") thành Set để so khớp — chuẩn hoá
// khoảng trắng để không lệch vì dữ liệu Excel thỉnh thoảng có 2 khoảng trắng trước SĐT.
export function parseStaffRoster(text) {
  const set = new Set()
  for (const line of String(text || '').split('\n')) {
    const name = normalize(line)
    if (name) set.add(name)
  }
  return set
}

// 'hcm' — cả Bốc hàng + Đóng hàng đều trong danh sách.
// 'other' — cả 2 đều KHÔNG trong danh sách (nhiều khả năng thuộc kho khác).
// 'mismatch' — chỉ 1 trong 2 khớp (đơn bốc/đóng lẫn kho, cần cảnh báo, không tính vào tổng).
export function classifyRowWarehouse(row, rosterSet) {
  const bocHang = normalize(row['Bốc hàng'])
  const dongHang = normalize(row['Đóng hàng'])
  const bocMatch = rosterSet.has(bocHang)
  const dongMatch = rosterSet.has(dongHang)
  if (bocMatch && dongMatch) return 'hcm'
  if (!bocMatch && !dongMatch) return 'other'
  return 'mismatch'
}

// Tách 1 mảng rows thành { hcmRows, otherRows, mismatchRows } theo rosterSet. rosterSet rỗng
// (chưa nhập danh sách) -> coi như CHƯA lọc, mọi dòng đều tính là 'hcm' (giữ nguyên hành vi
// hiện tại khi người dùng chưa dùng tính năng này).
export function splitByWarehouseStaff(rows, rosterSet) {
  if (!rosterSet || rosterSet.size === 0) {
    return { hcmRows: rows, otherRows: [], mismatchRows: [] }
  }
  const hcmRows = []
  const otherRows = []
  const mismatchRows = []
  for (const row of rows) {
    const cls = classifyRowWarehouse(row, rosterSet)
    if (cls === 'hcm') hcmRows.push(row)
    else if (cls === 'other') otherRows.push(row)
    else mismatchRows.push(row)
  }
  return { hcmRows, otherRows, mismatchRows }
}
