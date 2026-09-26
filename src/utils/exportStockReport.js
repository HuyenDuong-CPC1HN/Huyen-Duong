import PizZip from 'pizzip'

// Xuất "Báo cáo hàng cận date_CLC" (2 sheet: "Cận date" + "CLC") — điền thẳng vào file mẫu thật của công ty
// (public/templates/BAO_CAO_CAN_DATE_CLC.xlsx), giữ nguyên tiêu đề, độ rộng cột, font, viền và tô màu cột
// "Tuổi thuốc" của mẫu. Mẫu chỉ còn dòng tiêu đề + 1 dòng 5 trống làm khuôn style cho mỗi cột; dòng dữ liệu
// được dựng lại hoàn toàn từ khuôn đó (cùng kỹ thuật mở mẫu như 1 file zip của exportExpiryDisposal.js).
const TEMPLATE_URL = '/templates/BAO_CAO_CAN_DATE_CLC.xlsx'
const WORKBOOK_PATH = 'xl/workbook.xml'
const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
const HEADER_ROW = 4
const FIRST_DATA_ROW = 5

// type: text | number | date | age (công thức "Tuổi thuốc" tính từ cột Hạn dùng `dateCol`)
const SHEETS = [
  {
    path: 'xl/worksheets/sheet1.xml',
    sheetName: 'Cận date',
    lastCol: 'I',
    columns: [
      { col: 'A', type: 'number', value: (r, i) => i + 1 },
      { col: 'B', type: 'text', value: r => r.maVatTu },
      { col: 'C', type: 'text', value: r => r.tenVatTu },
      { col: 'D', type: 'text', value: r => r.maKho },
      { col: 'E', type: 'text', value: r => r.dvt },
      { col: 'F', type: 'text', value: r => r.maLo },
      { col: 'G', type: 'date', value: r => r.hanDung },
      { col: 'H', type: 'age', dateCol: 'G', value: r => r.tuoiThuoc },
      { col: 'I', type: 'number', value: r => r.tonCuoi },
    ],
  },
  {
    path: 'xl/worksheets/sheet2.xml',
    sheetName: 'CLC',
    lastCol: 'M',
    columns: [
      { col: 'A', type: 'number', value: (r, i) => i + 1 },
      { col: 'B', type: 'text', value: r => r.maVatTu },
      { col: 'C', type: 'text', value: r => r.tenVatTu },
      { col: 'D', type: 'text', value: r => r.maKho },
      { col: 'E', type: 'text', value: r => r.dvt },
      { col: 'F', type: 'text', value: r => r.maLo },
      { col: 'G', type: 'text', value: r => r.tenLo || r.maLo },
      { col: 'H', type: 'date', value: r => r.hanDung },
      { col: 'I', type: 'age', dateCol: 'H', value: r => r.tuoiThuoc },
      { col: 'J', type: 'number', value: r => r.tonDau },
      { col: 'K', type: 'number', value: r => r.slNhap },
      { col: 'L', type: 'number', value: r => r.slXuat },
      { col: 'M', type: 'number', value: r => r.tonCuoi },
    ],
  },
]

function parseXml(text) {
  const doc = new DOMParser().parseFromString(text, 'application/xml')
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new Error('Không đọc được file mẫu Báo cáo cận date (XML lỗi).')
  }
  return doc
}
function serializeXml(doc) { return new XMLSerializer().serializeToString(doc) }
function el(doc, tag) { return doc.createElementNS(NS, tag) }

function formatDateVi(iso) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

// Số ngày kiểu Excel (1900 date system) cho chuỗi ISO yyyy-mm-dd — ô có style ngày của mẫu tự hiện dd/mm/yyyy.
function excelSerial(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000)
}

function setInlineString(doc, cell, text) {
  cell.setAttribute('t', 'inlineStr')
  const is = el(doc, 'is')
  const t = el(doc, 't')
  t.textContent = text
  if (/^\s|\s$/.test(text)) t.setAttribute('xml:space', 'preserve')
  is.appendChild(t)
  cell.appendChild(is)
}

function buildCell(doc, spec, style, rowNum, row, index) {
  const cell = el(doc, 'c')
  cell.setAttribute('r', `${spec.col}${rowNum}`)
  if (style) cell.setAttribute('s', style)
  const value = spec.value(row, index)
  if (spec.type === 'text') {
    if (value !== null && value !== undefined && value !== '') setInlineString(doc, cell, String(value))
  } else if (spec.type === 'date') {
    if (value) { const v = el(doc, 'v'); v.textContent = String(excelSerial(value)); cell.appendChild(v) }
  } else if (spec.type === 'age') {
    if (row.hanDung) {
      // Giữ công thức như mẫu (tự cập nhật theo ngày mở file), thêm nhánh số âm cho hàng đã hết hạn.
      const ref = `${spec.dateCol}${rowNum}`
      const f = el(doc, 'f')
      f.textContent = `IF(${ref}>=TODAY(),DATEDIF(TODAY(),${ref},"m"),-DATEDIF(${ref},TODAY(),"m"))`
      cell.appendChild(f)
      if (value !== null && value !== undefined) { const v = el(doc, 'v'); v.textContent = String(value); cell.appendChild(v) }
    }
  } else {
    const v = el(doc, 'v')
    v.textContent = String(Number(value) || 0)
    cell.appendChild(v)
  }
  return cell
}

function fillSheet(doc, spec, rows, dateRangeText) {
  const sheetData = doc.getElementsByTagName('sheetData')[0]
  const rowNodes = [...sheetData.getElementsByTagName('row')]
  const protoRow = rowNodes.find(r => r.getAttribute('r') === String(FIRST_DATA_ROW))
  const styles = {}
  for (const c of protoRow?.getElementsByTagName('c') || []) {
    styles[c.getAttribute('r').replace(/\d+$/, '')] = c.getAttribute('s')
  }
  rowNodes.filter(r => Number(r.getAttribute('r')) >= FIRST_DATA_ROW).forEach(r => r.remove())

  // Dòng 2: khoảng thời gian của file báo cáo gốc.
  const a2 = rowNodes.find(r => r.getAttribute('r') === '2')?.getElementsByTagName('c')[0]
  if (a2) {
    a2.removeAttribute('t')
    while (a2.firstChild) a2.removeChild(a2.firstChild)
    if (dateRangeText) setInlineString(doc, a2, dateRangeText)
  }

  rows.forEach((row, index) => {
    const rowNum = FIRST_DATA_ROW + index
    const rowEl = el(doc, 'row')
    rowEl.setAttribute('r', String(rowNum))
    for (const colSpec of spec.columns) rowEl.appendChild(buildCell(doc, colSpec, styles[colSpec.col], rowNum, row, index))
    sheetData.appendChild(rowEl)
  })

  const lastRow = Math.max(HEADER_ROW, FIRST_DATA_ROW + rows.length - 1)
  doc.getElementsByTagName('dimension')[0]?.setAttribute('ref', `A1:${spec.lastCol}${lastRow}`)
  doc.getElementsByTagName('autoFilter')[0]?.setAttribute('ref', `A${HEADER_ROW}:${spec.lastCol}${lastRow}`)
  const ageCol = spec.columns.find(c => c.type === 'age').col
  for (const cf of doc.getElementsByTagName('conditionalFormatting')) {
    if (cf.getAttribute('sqref')?.startsWith(ageCol)) cf.setAttribute('sqref', `${ageCol}${FIRST_DATA_ROW}:${ageCol}${Math.max(lastRow, FIRST_DATA_ROW)}`)
  }
  return lastRow
}

function updateFilterNames(workbookDoc, lastRows) {
  for (const def of workbookDoc.getElementsByTagName('definedName')) {
    if (def.getAttribute('name') !== '_xlnm._FilterDatabase') continue
    const sheetIndex = Number(def.getAttribute('localSheetId'))
    const spec = SHEETS[sheetIndex]
    if (!spec) continue
    const quoted = /[^A-Za-z0-9_]/.test(spec.sheetName) ? `'${spec.sheetName}'` : spec.sheetName
    def.textContent = `${quoted}!$A$${HEADER_ROW}:$${spec.lastCol}$${lastRows[sheetIndex]}`
  }
}

export function formatReportDateRange(dateRange) {
  if (!dateRange?.tuNgay || !dateRange?.denNgay) return ''
  return `Từ ngày ${formatDateVi(dateRange.tuNgay)} đến ngày ${formatDateVi(dateRange.denNgay)}...`
}

// canDateRows / clcRows: dòng đã lọc + sắp xếp sẵn ở nơi gọi, mỗi dòng có thêm `tuoiThuoc` (số tháng).
export function fillStockReport(templateBuffer, { canDateRows, clcRows, dateRange }) {
  const zip = new PizZip(templateBuffer.slice(0))
  const dateRangeText = formatReportDateRange(dateRange)
  const lastRows = SHEETS.map((spec, i) => {
    const doc = parseXml(zip.file(spec.path).asText())
    const lastRow = fillSheet(doc, spec, i === 0 ? canDateRows : clcRows, dateRangeText)
    zip.file(spec.path, serializeXml(doc))
    return lastRow
  })
  const workbookDoc = parseXml(zip.file(WORKBOOK_PATH).asText())
  updateFilterNames(workbookDoc, lastRows)
  zip.file(WORKBOOK_PATH, serializeXml(workbookDoc))
  return zip.generate({ type: 'uint8array' })
}

// Tên file theo mẫu: "CNHCM-T06.26_Báo cáo hàng cận date_CLC.xlsx" — tháng/năm lấy theo ngày xuất báo cáo.
export function stockReportFileName(date = new Date()) {
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const yy = String(date.getFullYear()).slice(-2)
  return `CNHCM-T${mm}.${yy}_Báo cáo hàng cận date_CLC.xlsx`
}

let cachedTemplate = null
async function loadTemplate() {
  if (cachedTemplate) return cachedTemplate
  const res = await fetch(TEMPLATE_URL)
  if (!res.ok) throw new Error('Không tải được file mẫu Báo cáo hàng cận date_CLC.')
  cachedTemplate = await res.arrayBuffer()
  return cachedTemplate
}

export async function exportStockReport({ canDateRows, clcRows, dateRange }) {
  const bytes = fillStockReport(await loadTemplate(), { canDateRows, clcRows, dateRange })
  const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = stockReportFileName()
  a.click()
  URL.revokeObjectURL(url)
}
