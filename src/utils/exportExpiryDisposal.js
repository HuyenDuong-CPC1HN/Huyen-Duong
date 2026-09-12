import PizZip from 'pizzip'
import Docxtemplater from 'docxtemplater'

// Xuất "Biên bản Xử lý sản phẩm" (Excel) + "Biên bản Xác minh tình trạng hàng hoá" (Word) cho hàng cận
// date — điền thẳng vào 2 file mẫu thật của công ty (public/templates/), giữ nguyên format/font/logo/
// border gốc, chỉ thay đúng phần nội dung cần điền. Cùng kỹ thuật "mở mẫu như 1 file zip, chỉ sửa XML nội
// dung, còn lại giữ nguyên byte-for-byte" như exportGoodsReceipt.js (Biên bản nhập hàng) và
// exportReturnReport.js (Biên bản trả hàng) đã dùng.
const BBXL_TEMPLATE_URL = '/templates/BIEN_BAN_XU_LY_CAN_DATE.xlsx'
const XACMINH_TEMPLATE_URL = '/templates/BIEN_BAN_XAC_MINH_CAN_DATE.docx'
const SHEET_PATH = 'xl/worksheets/sheet1.xml'
const STRINGS_PATH = 'xl/sharedStrings.xml'
const WORKBOOK_PATH = 'xl/workbook.xml'
const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'

// Mẫu Excel có đúng 1 dòng dữ liệu sẵn (dòng 18, đã có style/border) dùng làm khuôn khi cần thêm dòng;
// dòng 19-23 là phần chân (phương pháp xử lý, biên bản lập 2 bản, chữ ký) — dời xuống khi thêm dòng.
const DATA_ROW_TEMPLATE = 18
const FOOTER_FIRST_ROW_TEMPLATE = 19
const FOOTER_LAST_ROW_TEMPLATE = 23
const SIGNATURE_MERGE_ROW_TEMPLATE = 23

function pad2(n) { return String(n).padStart(2, '0') }

export function todayParts(date = new Date()) {
  return { ngay: pad2(date.getDate()), thang: pad2(date.getMonth() + 1), nam: String(date.getFullYear()) }
}

function formatDateVi(iso) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  if (!y || !m || !d) return ''
  return `${d}/${m}/${y}`
}

// ---------- Biên bản Xử lý (Excel) ----------

function parseXml(text) {
  const doc = new DOMParser().parseFromString(text, 'application/xml')
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new Error('Không đọc được file mẫu Biên bản Xử lý (XML lỗi).')
  }
  return doc
}
function serializeXml(doc) { return new XMLSerializer().serializeToString(doc) }
function cellAt(doc, row, col) { return doc.querySelector(`c[r="${col}${row}"]`) }
function ensureChild(doc, cell, tagName) {
  let el = cell.querySelector(tagName)
  if (!el) { el = doc.createElementNS(NS, tagName); cell.appendChild(el) }
  return el
}
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
// Dùng cho các Ô TÙY CHỌN của mẫu vốn ĐÃ TRỐNG SẴN (vd nhãn "2. Thời gian xử lý: ") — không có dữ liệu
// thì bỏ qua, giữ nguyên ô trống của mẫu, không tự bịa nội dung.
function setCellString(doc, sstDoc, row, col, value) {
  if (value === null || value === undefined || value === '') return
  const cell = cellAt(doc, row, col)
  if (!cell) return
  const idx = addSharedString(sstDoc, String(value))
  cell.setAttribute('t', 's')
  ensureChild(doc, cell, 'v').textContent = String(idx)
}
// Dùng cho bảng sản phẩm — dòng mẫu (18) vốn có sẵn dữ liệu VÍ DỤ THẬT (B01414...), không phải ô trống,
// nên PHẢI luôn ghi đè kể cả khi giá trị thật rỗng (vd "Quy cách" — báo cáo tồn kho không có cột này) —
// nếu không, ô sẽ giữ nguyên chữ ví dụ cũ của mẫu thay vì trống thật như dữ liệu.
function setCellStringForce(doc, sstDoc, row, col, value) {
  const cell = cellAt(doc, row, col)
  if (!cell) return
  const text = value === null || value === undefined ? '' : String(value)
  if (text === '') {
    cell.removeAttribute('t')
    cell.querySelector('v')?.remove()
    return
  }
  const idx = addSharedString(sstDoc, text)
  cell.setAttribute('t', 's')
  ensureChild(doc, cell, 'v').textContent = String(idx)
}
// Nối thêm giá trị vào SAU nhãn có sẵn của mẫu (vd "2. Thời gian xử lý: " -> "2. Thời gian xử lý: Vào lúc...") —
// không có dữ liệu thì giữ nguyên nhãn trống của mẫu, không tự bịa nội dung.
function appendAfterLabel(doc, sstDoc, row, col, suffix) {
  if (!suffix) return
  const cell = cellAt(doc, row, col)
  if (!cell) return
  const v = cell.querySelector('v')
  const sstDocRef = sstDoc.documentElement
  const currentText = v ? sstDocRef.getElementsByTagName('si')[Number(v.textContent)]?.textContent || '' : ''
  const idx = addSharedString(sstDoc, `${currentText}${suffix}`)
  ensureChild(doc, cell, 'v').textContent = String(idx)
}
// Dùng cho bảng sản phẩm — luôn ghi đè kể cả rỗng, cùng lý do với setCellStringForce ở trên.
function setCellNumberForce(doc, row, col, value) {
  const cell = cellAt(doc, row, col)
  if (!cell) return
  if (value === null || value === undefined || value === '') {
    cell.removeAttribute('t')
    cell.querySelector('v')?.remove()
    return
  }
  cell.removeAttribute('t')
  ensureChild(doc, cell, 'v').textContent = String(value)
}

function shiftRowTo(row, newRowNum) {
  row.setAttribute('r', String(newRowNum))
  row.querySelectorAll('c').forEach(c => {
    const col = c.getAttribute('r').match(/^[A-Z]+/)[0]
    c.setAttribute('r', `${col}${newRowNum}`)
  })
}

// Nhân bản dòng dữ liệu mẫu (đã có sẵn style/border) để thêm dòng khi số hàng > 1, dời phần chân xuống
// theo. Trả về số dòng lệch (0 nếu không cần thêm dòng nào).
function ensureDataRows(doc, rowCount) {
  if (rowCount <= 1) return 0
  const extra = rowCount - 1
  const templateRow = doc.querySelector(`row[r="${DATA_ROW_TEMPLATE}"]`)

  // Lấy sẵn ĐÚNG NODE của các dòng chân TRƯỚC khi nhân bản dòng nào — dòng vừa nhân bản (clone) tạm thời
  // MANG CÙNG số r với dòng chân gốc ngay sau khi insertBefore (chưa kịp đổi số ở bước dưới), nên nếu để
  // bước dời dòng chân tự querySelector lại theo r="..." sau đó, sẽ có 2 node cùng khớp và querySelector
  // luôn trả về node ĐỨNG TRƯỚC trong DOM — tức chính là dòng vừa nhân bản, không phải dòng chân thật —
  // khiến dòng chân bị "đánh cắp" số dòng còn dòng dữ liệu vừa thêm bị bỏ sót, giữ nguyên dữ liệu ví dụ cũ
  // của mẫu. Giữ node thật ngay từ đầu để tránh hẳn việc tra lại có thể nhầm này.
  const footerRows = []
  for (let r = FOOTER_FIRST_ROW_TEMPLATE; r <= FOOTER_LAST_ROW_TEMPLATE; r += 1) {
    footerRows.push(doc.querySelector(`row[r="${r}"]`))
  }
  const firstFooterRow = footerRows[0]

  // Mẫu có SẴN các dòng trống phía sau phần chân (vd r=24..89, chỉ để canh đủ 1 trang in) — lấy sẵn NODE
  // của chúng luôn ở đây (cùng lý do với footerRows ở trên: phải lấy TRƯỚC khi có node nào bị đổi số "r",
  // tránh querySelector tra nhầm). Nếu bỏ qua không dời các dòng trống này theo, khi cần thêm > 5 dòng dữ
  // liệu (extra > 5), số "r" mới của dòng dữ liệu/dòng chân sẽ ĐỤNG TRÙNG với số "r" gốc của các dòng trống
  // này (cùng nằm trong khoảng 24-89) — 2 <row> khác nhau cùng "r" khiến Excel chỉ hiển thị 1 trong 2 (tuỳ
  // dòng), làm mất/trống nội dung phần chân hoặc vài dòng dữ liệu cuối — đây chính là lỗi thật đã gặp khi
  // xuất biên bản có > 6 mặt hàng (vd Kho A, phiếu xuất kho 21 dòng) khiến mục "7. Các thành phần tham gia
  // hủy" mất chữ.
  const trailingRows = []
  for (let node = footerRows.at(-1).nextElementSibling; node; node = node.nextElementSibling) {
    trailingRows.push(node)
  }

  for (let i = 0; i < extra; i += 1) {
    const newRowNum = DATA_ROW_TEMPLATE + 1 + i
    const clone = templateRow.cloneNode(true)
    clone.setAttribute('r', String(newRowNum))
    clone.querySelectorAll('c').forEach(c => {
      const col = c.getAttribute('r').match(/^[A-Z]+/)[0]
      c.setAttribute('r', `${col}${newRowNum}`)
    })
    firstFooterRow.before(clone)
  }

  // Dời các dòng chân — dùng đúng node đã lấy sẵn ở trên, không tra lại theo r="..." nữa.
  footerRows.forEach((row, i) => shiftRowTo(row, FOOTER_FIRST_ROW_TEMPLATE + i + extra))
  // Dời tiếp các dòng trống phía sau, theo đúng số lệch "extra" - giữ nguyên thứ tự tương đối với nhau.
  trailingRows.forEach((row) => shiftRowTo(row, Number(row.getAttribute('r')) + extra))

  const newSignatureRow = SIGNATURE_MERGE_ROW_TEMPLATE + extra
  doc.querySelectorAll('mergeCell').forEach(mc => {
    const ref = mc.getAttribute('ref')
    if (ref.includes(`${SIGNATURE_MERGE_ROW_TEMPLATE}`)) {
      mc.setAttribute('ref', ref.replaceAll(String(SIGNATURE_MERGE_ROW_TEMPLATE), String(newSignatureRow)))
    }
  })

  const dim = doc.querySelector('dimension')
  if (dim) {
    const ref = dim.getAttribute('ref') // vd "A1:J89"
    const endCell = ref.slice(ref.lastIndexOf(':') + 1)
    const endRow = Number.parseInt(endCell.replaceAll(/[A-Z$]/g, ''), 10)
    dim.setAttribute('ref', `${ref.slice(0, -String(endRow).length)}${endRow + extra}`)
  }
  doc.querySelector('rowBreaks')?.remove()

  return extra
}

function updatePrintArea(workbookDoc, extra) {
  if (!extra) return
  const defs = workbookDoc.getElementsByTagName('definedName')
  for (const def of defs) {
    if (def.getAttribute('name') === '_xlnm.Print_Area') {
      def.textContent = def.textContent.replace(/\$(\d+)$/, (m, num) => `$${Number(num) + extra}`)
    }
  }
}

function fillDataRows(doc, sstDoc, rows) {
  rows.forEach((r, index) => {
    const row = DATA_ROW_TEMPLATE + index
    setCellNumberForce(doc, row, 'A', index + 1)
    setCellStringForce(doc, sstDoc, row, 'B', r.maHang)
    setCellStringForce(doc, sstDoc, row, 'C', r.tenHang)
    setCellStringForce(doc, sstDoc, row, 'D', r.soLo)
    setCellStringForce(doc, sstDoc, row, 'E', formatDateVi(r.hanDung))
    setCellStringForce(doc, sstDoc, row, 'F', r.dvt)
    setCellNumberForce(doc, row, 'G', r.soLuong ?? 0)
    setCellNumberForce(doc, row, 'H', r.soLuong ?? 0)
    setCellStringForce(doc, sstDoc, row, 'I', r.quyCach || '')
    setCellStringForce(doc, sstDoc, row, 'J', 'Hàng cận date')
  })
}

// Điền dữ liệu vào file mẫu Biên bản Xử lý, trả về Uint8Array của file .xlsx hoàn chỉnh.
export async function fillBienBanXuLy(templateBuffer, rows, { diaDiem = 'Kho CN Hồ Chí Minh', ngayGio = '' } = {}) {
  const zip = new PizZip(templateBuffer.slice(0))
  const sstDoc = parseXml(zip.file(STRINGS_PATH).asText())
  const sheetDoc = parseXml(zip.file(SHEET_PATH).asText())
  const workbookDoc = parseXml(zip.file(WORKBOOK_PATH).asText())

  const { ngay, thang, nam } = todayParts()
  setCellString(sheetDoc, sstDoc, 5, 'H', `TP.Hồ Chí Minh ngày ${ngay} tháng ${thang} năm ${nam}`)
  appendAfterLabel(sheetDoc, sstDoc, 13, 'A', ngayGio || `Vào lúc 08h30’, ngày ${ngay} tháng ${thang} năm ${nam}`)
  appendAfterLabel(sheetDoc, sstDoc, 14, 'A', diaDiem)

  const extra = ensureDataRows(sheetDoc, rows.length)
  fillDataRows(sheetDoc, sstDoc, rows)
  updatePrintArea(workbookDoc, extra)

  zip.file(STRINGS_PATH, serializeXml(sstDoc))
  zip.file(SHEET_PATH, serializeXml(sheetDoc))
  zip.file(WORKBOOK_PATH, serializeXml(workbookDoc))
  return zip.generate({ type: 'uint8array' })
}

// ---------- Biên bản Xác minh (Word) ----------

async function fillXacMinhTemplate(templatePath, data, fetchImpl = fetch) {
  const res = await fetchImpl(templatePath)
  if (!res.ok) throw new Error(`Không tải được file mẫu: ${templatePath}`)
  const buf = await res.arrayBuffer()
  const zip = new PizZip(buf)
  const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true })
  doc.render(data)
  return doc.getZip().generate({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  })
}

function triggerDownloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  if (!url.startsWith('blob:')) return
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function triggerDownloadBytes(bytes, filename) {
  const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  triggerDownloadBlob(blob, filename)
}

let cachedBbxlTemplate = null
async function loadBbxlTemplateBuffer() {
  if (cachedBbxlTemplate) return cachedBbxlTemplate
  const res = await fetch(BBXL_TEMPLATE_URL)
  if (!res.ok) throw new Error('Không tải được file mẫu Biên bản Xử lý.')
  cachedBbxlTemplate = await res.arrayBuffer()
  return cachedBbxlTemplate
}

// rows: [{ maHang, tenHang, soLo, hanDung (ISO yyyy-mm-dd), dvt, soLuong, maKho, quyCach }]
// Hàng cận date dưới 1 tháng hạn dùng — lọc ở nơi gọi (ExpiryStockTab.jsx), hàm này chỉ điền mẫu.
export async function exportExpiryDisposal(rows) {
  if (!rows?.length) throw new Error('Không có dòng nào để xuất biên bản.')
  const label = new Date().toLocaleDateString('vi-VN').replaceAll('/', '-')

  const templateBuffer = await loadBbxlTemplateBuffer()
  const bbxlBytes = await fillBienBanXuLy(templateBuffer, rows)
  triggerDownloadBytes(bbxlBytes, `BBXL_HangCanDate_${label}.xlsx`)

  const { ngay, thang, nam } = todayParts()
  const xacMinhData = {
    ngay, thang, nam, gio: '08h30’',
    items: rows.map((r, i) => ({
      stt: i + 1,
      maSanPham: r.maHang || '',
      tenHang: r.tenHang || '',
      soLo: r.soLo || '',
      hanDung: formatDateVi(r.hanDung),
      kho: r.maKho || '',
      dvt: r.dvt || '',
      soLuong: r.soLuong ?? '',
      quyCach: r.quyCach || '',
      tinhTrang: 'Hàng cận date',
    })),
  }
  const xacMinhBlob = await fillXacMinhTemplate(XACMINH_TEMPLATE_URL, xacMinhData)
  triggerDownloadBlob(xacMinhBlob, `XacMinh_HangCanDate_${label}.docx`)
}
