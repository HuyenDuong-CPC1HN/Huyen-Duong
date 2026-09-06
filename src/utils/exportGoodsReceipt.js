import PizZip from 'pizzip'

// Xuất "BIÊN BẢN NHẬP HÀNG" bằng cách điền dữ liệu thẳng vào file mẫu .xlsx thật của công ty
// (public/templates/BIEN_BAN_NHAP_HANG.xlsx — có logo + định dạng riêng), thay vì dựng sheet mới bằng
// SheetJS. SheetJS (XLSX.read → XLSX.write) không giữ được ảnh nhúng (logo) và làm hỏng gần hết style
// tuỳ chỉnh khi đọc-ghi lại file mẫu này (đã kiểm chứng trực tiếp). Cách làm ở đây: mở file mẫu như 1 file
// zip (pizzip), chỉ sửa nội dung XML của sheet dữ liệu (xl/worksheets/sheet1.xml) và sharedStrings.xml,
// còn lại (ảnh, style, theme...) giữ nguyên byte-for-byte.
const TEMPLATE_URL = '/templates/BIEN_BAN_NHAP_HANG.xlsx'
const SHEET_PATH = 'xl/worksheets/sheet1.xml'
const STRINGS_PATH = 'xl/sharedStrings.xml'
const WORKBOOK_PATH = 'xl/workbook.xml'
const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'

// Mẫu đã có sẵn đúng 12 dòng dữ liệu được style + đánh số STT sẵn (dòng 15-26), dòng 27 là chân ký tên.
const DATA_FIRST_ROW = 15
const DATA_TEMPLATE_ROWS = 12
const FOOTER_ROW_TEMPLATE = 27
const CLONE_STYLE_ROW = 26 // dòng dữ liệu cuối cùng có sẵn trong mẫu — dùng làm khuôn khi cần thêm dòng

// 6 dòng thông tin đầu mẫu (B6:B11) mỗi dòng là 1 chuỗi gộp sẵn "Nhãn : ………" — điền giá trị thật bằng
// cách nối thêm sau dấu ":", giữ nguyên phần nhãn.
const HEADER_FIELDS = [
  { row: 6, prefix: 'Số hóa đơn :', key: 'soHoaDon' },
  { row: 7, prefix: 'Số hợp đồng :', key: 'soHopDong' },
  { row: 8, prefix: 'Nơi nhận :', key: 'noiNhan' },
  { row: 9, prefix: 'Ngày, giờ nhận :', key: 'ngayGioNhan' },
  { row: 10, prefix: 'Ngày, giờ kiểm :', key: 'ngayGioKiem' },
  { row: 11, prefix: 'Kết quả kiểm :', key: 'ketQuaKiem' },
]

function formatDateVi(iso) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  if (!y || !m || !d) return ''
  return `${d}/${m}/${y}`
}

function parseXml(text) {
  const doc = new DOMParser().parseFromString(text, 'application/xml')
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new Error('Không đọc được file mẫu Excel (XML lỗi).')
  }
  return doc
}

function serializeXml(doc) {
  return new XMLSerializer().serializeToString(doc)
}

function cellAt(doc, row, col) {
  return doc.querySelector(`c[r="${col}${row}"]`)
}

function ensureChild(doc, cell, tagName, atStart = false) {
  let el = cell.querySelector(tagName)
  if (!el) {
    el = doc.createElementNS(NS, tagName)
    if (atStart) cell.insertBefore(el, cell.firstChild)
    else cell.appendChild(el)
  }
  return el
}

// Thêm 1 chuỗi mới vào sharedStrings.xml, trả về index để gán vào ô kiểu t="s".
function addSharedString(sstDoc, text) {
  const sst = sstDoc.documentElement
  const si = sstDoc.createElementNS(NS, 'si')
  const t = sstDoc.createElementNS(NS, 't')
  t.textContent = text
  if (/^\s|\s$/.test(text)) t.setAttribute('xml:space', 'preserve')
  si.appendChild(t)
  sst.appendChild(si)
  const index = sst.getElementsByTagName('si').length - 1
  sst.setAttribute('count', String(index + 1))
  sst.setAttribute('uniqueCount', String(index + 1))
  return index
}

function setCellString(doc, sstDoc, row, col, value) {
  if (value === null || value === undefined || value === '') return
  const cell = cellAt(doc, row, col)
  if (!cell) return
  const idx = addSharedString(sstDoc, String(value))
  cell.setAttribute('t', 's')
  ensureChild(doc, cell, 'v').textContent = String(idx)
}

function setCellNumber(doc, row, col, value) {
  if (value === null || value === undefined || value === '') return
  const cell = cellAt(doc, row, col)
  if (!cell) return
  cell.removeAttribute('t')
  ensureChild(doc, cell, 'v').textContent = String(value)
}

function setCellFormulaNumber(doc, row, col, formula, cachedValue) {
  const cell = cellAt(doc, row, col)
  if (!cell) return
  cell.removeAttribute('t')
  ensureChild(doc, cell, 'f', true).textContent = formula
  ensureChild(doc, cell, 'v').textContent = cachedValue === '' || cachedValue === null || cachedValue === undefined ? '' : String(cachedValue)
}

function fillHeaderFields(doc, sstDoc, metadata) {
  const meta = {
    soHoaDon: metadata.soHoaDon || '',
    soHopDong: metadata.soHopDong || '',
    noiNhan: metadata.noiNhan || metadata.benNhanHang || '',
    ngayGioNhan: metadata.ngayGioNhan || metadata.ngayNhap || '',
    ngayGioKiem: metadata.ngayGioKiem || '',
    ketQuaKiem: metadata.ketQuaKiem || '',
  }
  HEADER_FIELDS.forEach(({ row, prefix, key }) => {
    const value = meta[key]
    if (!value) return // không có dữ liệu -> giữ nguyên dòng chấm chấm của mẫu
    setCellString(doc, sstDoc, row, 'B', `${prefix} ${value}`)
  })
}

// Nhân bản dòng dữ liệu cuối cùng của mẫu (đã có sẵn style/border) để thêm dòng khi số hàng > 12, rồi dời
// dòng chân ký tên xuống theo. Trả về số dòng chân ký tên mới (sau khi dời).
function ensureDataRows(doc, rowCount) {
  if (rowCount <= DATA_TEMPLATE_ROWS) return FOOTER_ROW_TEMPLATE

  const sheetData = doc.querySelector('sheetData')
  const templateRow = doc.querySelector(`row[r="${CLONE_STYLE_ROW}"]`)
  const footerRow = doc.querySelector(`row[r="${FOOTER_ROW_TEMPLATE}"]`)
  const extra = rowCount - DATA_TEMPLATE_ROWS
  const newFooterRowNum = FOOTER_ROW_TEMPLATE + extra

  for (let i = 0; i < extra; i += 1) {
    const newRowNum = FOOTER_ROW_TEMPLATE + i
    const clone = templateRow.cloneNode(true)
    clone.setAttribute('r', String(newRowNum))
    clone.querySelectorAll('c').forEach(c => {
      const col = c.getAttribute('r').match(/^[A-Z]+/)[0]
      c.setAttribute('r', `${col}${newRowNum}`)
      c.removeAttribute('t')
      const v = c.querySelector('v')
      if (v) v.remove()
      const f = c.querySelector('f')
      if (f) f.remove()
    })
    sheetData.insertBefore(clone, footerRow)
    setCellNumber(doc, newRowNum, 'A', DATA_TEMPLATE_ROWS + i + 1)
  }

  // Dời dòng chân ký tên (label + các ô merge) xuống dòng mới.
  footerRow.setAttribute('r', String(newFooterRowNum))
  footerRow.querySelectorAll('c').forEach(c => {
    const col = c.getAttribute('r').match(/^[A-Z]+/)[0]
    c.setAttribute('r', `${col}${newFooterRowNum}`)
  })

  const shiftMerge = ref => ref.replace(/(\d+)/g, num => (Number(num) === FOOTER_ROW_TEMPLATE ? String(newFooterRowNum) : num))
  doc.querySelectorAll('mergeCell').forEach(mc => {
    const ref = mc.getAttribute('ref')
    if (ref.includes(String(FOOTER_ROW_TEMPLATE))) mc.setAttribute('ref', shiftMerge(ref))
  })

  doc.querySelector('dimension')?.setAttribute('ref', `A1:M${newFooterRowNum}`)
  // Ngắt trang thủ công của mẫu (đặt cố định ngay dưới dòng 27 gốc) không còn đúng vị trí khi số dòng
  // thay đổi — bỏ hẳn thay vì tính lại, để Excel/LibreOffice tự ngắt trang khi in.
  doc.querySelector('rowBreaks')?.remove()

  return newFooterRowNum
}

function fillDataRows(doc, sstDoc, rows) {
  rows.forEach((r, index) => {
    const row = DATA_FIRST_ROW + index
    const hanDung = formatDateVi(r.hanDung)
    const tenHang = `${r.maHang ? `${r.maHang} - ` : ''}${r.tenHang || ''}`
    setCellNumber(doc, row, 'A', index + 1)
    setCellString(doc, sstDoc, row, 'B', tenHang)
    setCellString(doc, sstDoc, row, 'C', r.dvt)
    setCellString(doc, sstDoc, row, 'D', r.soLo)
    setCellString(doc, sstDoc, row, 'E', hanDung)
    setCellNumber(doc, row, 'F', r.kienNguyen || '')
    setCellNumber(doc, row, 'G', r.kienLe || '')
    setCellNumber(doc, row, 'H', r.slHoaDon ?? 0)
    setCellNumber(doc, row, 'I', r.slThucTe ?? '')
    // Chênh lệch (Thiếu) = Hoá đơn (H) − Thực tế (I), chỉ khi đã có SL thực tế và bị thiếu; "Hư hỏng"
    // và "Tình trạng" (K, L) để trống — người kiểm hàng điền tay khi in ra, không tự suy diễn.
    const hoaDon = Number(r.slHoaDon ?? 0)
    const thucTe = r.slThucTe === null || r.slThucTe === undefined || r.slThucTe === '' ? null : Number(r.slThucTe)
    const thieu = thucTe !== null && hoaDon > thucTe ? hoaDon - thucTe : (thucTe !== null ? 0 : '')
    setCellFormulaNumber(doc, row, 'J', `IF(I${row}="","",IF(H${row}>I${row},H${row}-I${row},0))`, thieu)
    setCellString(doc, sstDoc, row, 'M', r.ghiChu)
  })
}

function updatePrintArea(workbookDoc, footerRowNum) {
  const defs = workbookDoc.getElementsByTagName('definedName')
  for (let i = 0; i < defs.length; i += 1) {
    const def = defs[i]
    if (def.getAttribute('name') === '_xlnm.Print_Area') {
      def.textContent = def.textContent.replace(/\$M\$\d+$/, `$M$${footerRowNum + 1}`)
    }
  }
}

// Điền dữ liệu 1 kho vào file mẫu, trả về Uint8Array của file .xlsx hoàn chỉnh.
export async function fillReceiptTemplate(templateBuffer, rows, { metadata = {} } = {}) {
  const zip = new PizZip(templateBuffer.slice(0))

  const sstDoc = parseXml(zip.file(STRINGS_PATH).asText())
  const sheetDoc = parseXml(zip.file(SHEET_PATH).asText())
  const workbookDoc = parseXml(zip.file(WORKBOOK_PATH).asText())

  fillHeaderFields(sheetDoc, sstDoc, metadata)
  const footerRowNum = ensureDataRows(sheetDoc, rows.length)
  fillDataRows(sheetDoc, sstDoc, rows)
  if (footerRowNum !== FOOTER_ROW_TEMPLATE) updatePrintArea(workbookDoc, footerRowNum)

  zip.file(STRINGS_PATH, serializeXml(sstDoc))
  zip.file(SHEET_PATH, serializeXml(sheetDoc))
  zip.file(WORKBOOK_PATH, serializeXml(workbookDoc))

  return zip.generate({ type: 'uint8array' })
}

function triggerDownload(bytes, filename) {
  const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

let cachedTemplate = null
async function loadTemplateBuffer() {
  if (cachedTemplate) return cachedTemplate
  const res = await fetch(TEMPLATE_URL)
  if (!res.ok) throw new Error('Không tải được file mẫu Biên bản nhập hàng.')
  cachedTemplate = await res.arrayBuffer()
  return cachedTemplate
}

export async function exportReceiptFromTemplate({
  khoC,
  khoLgt,
  metadata = {},
  processedAt = new Date(),
}) {
  const label = processedAt.toLocaleDateString('vi-VN').replaceAll('/', '-')
  const templateBuffer = await loadTemplateBuffer()

  if (khoC?.length) {
    const bytes = await fillReceiptTemplate(templateBuffer, khoC, { metadata })
    triggerDownload(bytes, `BienBanNhapHang_KhoC_${label}.xlsx`)
  }

  if (khoLgt?.length) {
    const bytes = await fillReceiptTemplate(templateBuffer, khoLgt, { metadata })
    triggerDownload(bytes, `BienBanNhapHang_KhoLGT_${label}.xlsx`)
  }
}
