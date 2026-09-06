import * as XLSX from 'xlsx'

const SHEET_NAME = 'BIEN BAN NHAP HANG'
// Cột theo đúng mẫu giấy "BIÊN BẢN NHẬP HÀNG" của CPC1HN (chi nhánh HCM) + chèn thêm Kiện nguyên/Kiện
// lẻ ngay sau Hạn dùng theo yêu cầu — mẫu giấy không có cột riêng "Mã hàng" nên ghép mã hàng vào trước
// tên hàng (không mất thông tin, vẫn đúng 1 cột "Tên hàng hóa, hàm lượng" như mẫu).
const COLS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M']
const DEFAULT_STYLE = { patternType: 'none' }
const YELLOW_FILL = { patternType: 'solid', fgColor: { rgb: 'FFF2CC' }, bgColor: { rgb: 'FFFFFF' } }
const HEADER_FILL = { patternType: 'solid', fgColor: { rgb: 'D9E1F2' }, bgColor: { rgb: 'FFFFFF' } }
const THIN = { style: 'thin', color: { rgb: 'FF000000' } }
const BORDER_ALL = { top: THIN, bottom: THIN, left: THIN, right: THIN }

function formatDateVi(iso) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function setCell(ws, addr, value, style = DEFAULT_STYLE) {
  if (value === null || value === undefined || value === '') {
    ws[addr] = { t: 'z', s: style }
    return
  }
  if (typeof value === 'number') {
    ws[addr] = { t: 'n', v: value, s: style }
    return
  }
  ws[addr] = { t: 's', v: String(value), s: style }
}

function tableBorderStyle(extraFill) {
  return extraFill ? { ...extraFill, border: BORDER_ALL } : { border: BORDER_ALL }
}

// Dựng sheet "BIÊN BẢN NHẬP HÀNG" hoàn toàn bằng code (không phụ thuộc file mẫu .xlsx cố định — file cũ
// không có ảnh/logo nhúng nên dựng lại không mất gì, lại dễ sửa cột sau này). rows: mảng dòng của 1 kho.
export function buildReceiptSheet(rows, { warehouseLabel = '', metadata = {} } = {}) {
  const meta = {
    soHoaDon: metadata.soHoaDon || '',
    soHopDong: metadata.soHopDong || '',
    noiNhan: metadata.noiNhan || metadata.benNhanHang || '',
    ngayGioNhan: metadata.ngayGioNhan || metadata.ngayNhap || '',
    ngayGioKiem: metadata.ngayGioKiem || '',
    ketQuaKiem: metadata.ketQuaKiem || '',
  }

  const ws = {}
  let row = 1
  const put = (col, value, style) => setCell(ws, `${col}${row}`, value, style)

  put('A', 'CÔNG TY CỔ PHẦN DƯỢC PHẨM CPC1 HÀ NỘI - CHI NHÁNH HỒ CHÍ MINH', { font: { bold: true, sz: 12 } })
  row += 1
  put('A', '26-28 đường Hàn Mạc Tử - P.Tân Thành - Q.Tân Phú - TP.Hồ Chí Minh')
  row += 2

  put('A', warehouseLabel ? `BIÊN BẢN NHẬP HÀNG — ${warehouseLabel}` : 'BIÊN BẢN NHẬP HÀNG', { font: { bold: true, sz: 14 } })
  row += 2

  const fieldRow = (label, value) => {
    put('A', label, { font: { bold: true } })
    setCell(ws, `C${row}`, value)
    row += 1
  }
  fieldRow('Số hóa đơn :', meta.soHoaDon)
  fieldRow('Số hợp đồng :', meta.soHopDong)
  fieldRow('Nơi nhận :', meta.noiNhan)
  fieldRow('Ngày, giờ nhận :', meta.ngayGioNhan)
  fieldRow('Ngày, giờ kiểm :', meta.ngayGioKiem)
  fieldRow('Kết quả kiểm :', meta.ketQuaKiem)
  row += 1

  const headerRow1 = row
  const headers1 = ['STT', 'Tên hàng hóa, hàm lượng', 'Đơn vị tính', 'Số Lô', 'Hạn dùng', 'Kiện nguyên', 'Kiện lẻ', 'Số lượng', '', 'Chênh lệch', '', 'Tình trạng', 'Ghi chú']
  headers1.forEach((h, i) => setCell(ws, `${COLS[i]}${headerRow1}`, h, tableBorderStyle({ font: { bold: true }, alignment: { horizontal: 'center', vertical: 'center', wrapText: true }, fill: HEADER_FILL })))
  row += 1
  const headerRow2 = row
  const headers2 = ['', '', '', '', '', '', '', 'Hoá đơn', 'Thực tế', 'Thiếu', 'Hư hỏng', '', '']
  headers2.forEach((h, i) => setCell(ws, `${COLS[i]}${headerRow2}`, h, tableBorderStyle({ font: { bold: true }, alignment: { horizontal: 'center', vertical: 'center' }, fill: HEADER_FILL })))
  row += 1

  const dataStartRow = row
  const displayRows = rows.length > 0 ? rows : [null]
  displayRows.forEach((r, index) => {
    const excelRow = dataStartRow + index
    if (!r) {
      COLS.forEach(col => setCell(ws, `${col}${excelRow}`, '', tableBorderStyle()))
      return
    }
    const hanDung = formatDateVi(r.hanDung)
    const tenHang = `${r.maHang ? `${r.maHang} - ` : ''}${r.tenHang || ''}`
    const values = [
      index + 1,
      tenHang,
      r.dvt || '',
      r.soLo || '',
      hanDung,
      r.kienNguyen || '',
      r.kienLe || '',
      r.slHoaDon ?? 0,
      r.slThucTe ?? '',
      '',
      '',
      '',
      r.ghiChu || '',
    ]
    values.forEach((v, i) => {
      const manual = i === 8 || i === 10 || i === 11 // SL thực tế, Hư hỏng, Tình trạng — điền tay
      const missingHanDung = i === 4 && !hanDung
      setCell(ws, `${COLS[i]}${excelRow}`, v, tableBorderStyle(manual || missingHanDung ? YELLOW_FILL : undefined))
    })
    // Thiếu = Hoá đơn (H) − Thực tế (I) khi Thực tế < Hoá đơn, bỏ trống khi chưa nhập SL thực tế.
    ws[`J${excelRow}`] = {
      t: 'n',
      f: `IF(I${excelRow}="","",IF(H${excelRow}>I${excelRow},H${excelRow}-I${excelRow},0))`,
      s: tableBorderStyle(),
    }
  })

  const lastDataRow = dataStartRow + displayRows.length - 1
  row = lastDataRow + 3
  const footerRow = row
  const footerLabels = [[0, 'Người duyệt'], [3, 'Thủ kho'], [7, 'Kế toán'], [10, 'Người kiểm hàng']]
  footerLabels.forEach(([colIndex, label]) => {
    setCell(ws, `${COLS[colIndex]}${footerRow}`, label, { font: { bold: true, italic: true }, alignment: { horizontal: 'center' } })
  })

  const verticalMergeCols = [0, 1, 2, 3, 4, 5, 6, 11, 12]
  ws['!merges'] = [
    { s: { r: headerRow1 - 1, c: 7 }, e: { r: headerRow1 - 1, c: 8 } },
    { s: { r: headerRow1 - 1, c: 9 }, e: { r: headerRow1 - 1, c: 10 } },
    ...verticalMergeCols.map(c => ({ s: { r: headerRow1 - 1, c }, e: { r: headerRow2 - 1, c } })),
  ]

  ws['!cols'] = [
    { wch: 5 }, { wch: 36 }, { wch: 11 }, { wch: 13 }, { wch: 11 },
    { wch: 10 }, { wch: 8 }, { wch: 10 }, { wch: 10 }, { wch: 8 },
    { wch: 9 }, { wch: 12 }, { wch: 22 },
  ]
  ws['!ref'] = `A1:M${footerRow}`
  return ws
}

export function buildReceiptWorkbook(rows, options) {
  const wb = XLSX.utils.book_new()
  const ws = buildReceiptSheet(rows, options)
  XLSX.utils.book_append_sheet(wb, ws, SHEET_NAME)
  return wb
}

export async function exportReceiptFromTemplate({
  khoC,
  khoLgt,
  metadata = {},
  processedAt = new Date(),
}) {
  const label = processedAt.toLocaleDateString('vi-VN').replaceAll('/', '-')

  if (khoC?.length) {
    const wbC = buildReceiptWorkbook(khoC, { warehouseLabel: 'KHO C', metadata })
    XLSX.writeFile(wbC, `BienBanNhapHang_KhoC_${label}.xlsx`)
  }

  if (khoLgt?.length) {
    const wbLgt = buildReceiptWorkbook(khoLgt, { warehouseLabel: 'KHO LGT', metadata })
    XLSX.writeFile(wbLgt, `BienBanNhapHang_KhoLGT_${label}.xlsx`)
  }
}
