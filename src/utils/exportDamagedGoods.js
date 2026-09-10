import PizZip from 'pizzip'
import Docxtemplater from 'docxtemplater'
import { fillBienBanXuLy as fillBienBanXuLyCanDate } from './exportExpiryDisposal.js'

// Xuất "Biên bản Xử lý sản phẩm" (Excel) + "Biên bản Xác minh tình trạng hàng hoá" (Word) cho hàng lỗi,
// bể vỡ khi vận chuyển — MỖI KHO CÓ MẪU RIÊNG (Kho C = CPC1HN, Kho LGT = UPHARMA, 2 pháp nhân khác nhau,
// khác cả tên công ty lẫn chức vụ "Thành phần" trong mẫu). Cùng kỹ thuật với exportExpiryDisposal.js
// (hàng cận date) và exportGoodsReceipt.js: mở mẫu như 1 file zip, chỉ sửa đúng phần XML nội dung cần
// điền, còn lại (logo, style, chữ ký, "Thành phần" cố định...) giữ nguyên byte-for-byte theo đúng mẫu
// riêng của từng kho.
const TEMPLATES = {
  khoC: {
    xuLy: '/templates/BIEN_BAN_XU_LY_HANG_LOI_KHO_C.xlsx',
    xacMinh: '/templates/BIEN_BAN_XAC_MINH_HANG_LOI_KHO_C.docx',
  },
  khoDTP: {
    xuLy: '/templates/BIEN_BAN_XU_LY_HANG_LOI_KHO_LGT.xlsx',
    xacMinh: '/templates/BIEN_BAN_XAC_MINH_HANG_LOI_KHO_LGT.docx',
  },
}
const SHEET_PATH = 'xl/worksheets/sheet1.xml'
const STRINGS_PATH = 'xl/sharedStrings.xml'
const WORKBOOK_PATH = 'xl/workbook.xml'
const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'

// Cả 2 mẫu (Kho C, Kho LGT) đã được chuẩn hoá cùng bố cục dòng: đúng 1 dòng dữ liệu mẫu sẵn (dòng 18) để
// làm khuôn khi cần thêm dòng; dòng 19-23 là phần chân (phương pháp xử lý, biên bản lập 2 bản, chữ ký).
const DATA_ROW_TEMPLATE = 18
const FOOTER_FIRST_ROW_TEMPLATE = 19
const FOOTER_LAST_ROW_TEMPLATE = 23
const SIGNATURE_MERGE_ROW_TEMPLATE = 23
// Bảng sản phẩm có thêm cột "Kho" so với mẫu hàng cận date: STT, Mã SP, Tên, Số lô, Hạn dùng, Kho, ĐVT,
// SL theo chứng từ, SL thực huỷ, Quy cách, Ghi chú.
const COL = { stt: 'A', maHang: 'B', tenHang: 'C', soLo: 'D', hanDung: 'E', kho: 'F', dvt: 'G', theoChungTu: 'H', thucHuy: 'I', quyCach: 'J', ghiChu: 'K' }

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
// Dùng cho ô TÙY CHỌN của mẫu vốn ĐÃ TRỐNG SẴN (nhãn "2. Thời gian xử lý: ") — không có dữ liệu thì bỏ
// qua, giữ nguyên ô trống của mẫu.
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
// Dùng cho bảng sản phẩm — dòng mẫu (18) vốn có sẵn dữ liệu VÍ DỤ THẬT, không phải ô trống, nên PHẢI luôn
// ghi đè kể cả khi giá trị thật rỗng (xem lỗi tương tự đã gặp + sửa ở exportExpiryDisposal.js).
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

// Nhân bản dòng dữ liệu mẫu để thêm dòng khi số hàng > 1, dời phần chân xuống theo. Lấy sẵn ĐÚNG NODE của
// các dòng chân TRƯỚC khi nhân bản dòng nào — tránh đúng lỗi "dòng nhân bản tạm trùng số dòng với dòng
// chân gốc, khiến bước dời chân tra lại theo r=... bắt nhầm" đã gặp và sửa ở exportExpiryDisposal.js.
function ensureDataRows(doc, rowCount) {
  if (rowCount <= 1) return 0
  const extra = rowCount - 1
  const sheetData = doc.querySelector('sheetData')
  const templateRow = doc.querySelector(`row[r="${DATA_ROW_TEMPLATE}"]`)

  const footerRows = []
  for (let r = FOOTER_FIRST_ROW_TEMPLATE; r <= FOOTER_LAST_ROW_TEMPLATE; r += 1) {
    footerRows.push(doc.querySelector(`row[r="${r}"]`))
  }
  const firstFooterRow = footerRows[0]

  for (let i = 0; i < extra; i += 1) {
    const newRowNum = DATA_ROW_TEMPLATE + 1 + i
    const clone = templateRow.cloneNode(true)
    clone.setAttribute('r', String(newRowNum))
    clone.querySelectorAll('c').forEach(c => {
      const col = c.getAttribute('r').match(/^[A-Z]+/)[0]
      c.setAttribute('r', `${col}${newRowNum}`)
    })
    sheetData.insertBefore(clone, firstFooterRow)
  }

  footerRows.forEach((row, i) => {
    const newRowNum = FOOTER_FIRST_ROW_TEMPLATE + i + extra
    row.setAttribute('r', String(newRowNum))
    row.querySelectorAll('c').forEach(c => {
      const col = c.getAttribute('r').match(/^[A-Z]+/)[0]
      c.setAttribute('r', `${col}${newRowNum}`)
    })
  })

  const newSignatureRow = SIGNATURE_MERGE_ROW_TEMPLATE + extra
  doc.querySelectorAll('mergeCell').forEach(mc => {
    const ref = mc.getAttribute('ref')
    if (ref.includes(`${SIGNATURE_MERGE_ROW_TEMPLATE}`)) {
      mc.setAttribute('ref', ref.replaceAll(String(SIGNATURE_MERGE_ROW_TEMPLATE), String(newSignatureRow)))
    }
  })

  const dim = doc.querySelector('dimension')
  if (dim) {
    const ref = dim.getAttribute('ref')
    dim.setAttribute('ref', ref.replace(/(\d+)$/, num => String(Number(num) + extra)))
  }
  doc.querySelector('rowBreaks')?.remove()

  return extra
}

function updatePrintArea(workbookDoc, extra) {
  if (!extra) return
  const defs = workbookDoc.getElementsByTagName('definedName')
  for (let i = 0; i < defs.length; i += 1) {
    const def = defs[i]
    if (def.getAttribute('name') === '_xlnm.Print_Area') {
      def.textContent = def.textContent.replace(/\$(\d+)$/, (m, num) => `$${Number(num) + extra}`)
    }
  }
}

function fillDataRows(doc, sstDoc, items) {
  items.forEach((it, index) => {
    const row = DATA_ROW_TEMPLATE + index
    setCellNumberForce(doc, row, COL.stt, index + 1)
    setCellStringForce(doc, sstDoc, row, COL.maHang, it.maHang)
    setCellStringForce(doc, sstDoc, row, COL.tenHang, it.tenHang)
    setCellStringForce(doc, sstDoc, row, COL.soLo, it.soLo)
    setCellStringForce(doc, sstDoc, row, COL.hanDung, formatDateVi(it.hanDung))
    setCellStringForce(doc, sstDoc, row, COL.kho, it.kho || '')
    setCellStringForce(doc, sstDoc, row, COL.dvt, it.dvt)
    setCellNumberForce(doc, row, COL.theoChungTu, it.soLuong ?? 0)
    setCellNumberForce(doc, row, COL.thucHuy, it.soLuong ?? 0)
    setCellStringForce(doc, sstDoc, row, COL.quyCach, it.quyCach || '')
    setCellStringForce(doc, sstDoc, row, COL.ghiChu, it.ghiChu || '')
  })
}

// Điền dữ liệu vào file mẫu Biên bản Xử lý của ĐÚNG kho, trả về Uint8Array file .xlsx hoàn chỉnh.
export async function fillBienBanXuLy(templateBuffer, items, { location = '', ngayGio = '' } = {}) {
  const zip = new PizZip(templateBuffer.slice(0))
  const sstDoc = parseXml(zip.file(STRINGS_PATH).asText())
  const sheetDoc = parseXml(zip.file(SHEET_PATH).asText())
  const workbookDoc = parseXml(zip.file(WORKBOOK_PATH).asText())

  const { ngay, thang, nam } = todayParts()
  setCellStringForce(sheetDoc, sstDoc, 5, 'I', `TP.Hồ Chí Minh, Ngày ${ngay} tháng ${thang} năm ${nam}`)
  appendAfterLabel(sheetDoc, sstDoc, 13, 'A', ngayGio || `Vào lúc 08h30’, ngày ${ngay} tháng ${thang} năm ${nam}`)
  appendAfterLabel(sheetDoc, sstDoc, 14, 'A', location)

  const extra = ensureDataRows(sheetDoc, items.length)
  fillDataRows(sheetDoc, sstDoc, items)
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
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
function triggerDownloadBytes(bytes, filename) {
  const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  triggerDownloadBlob(blob, filename)
}

const templateBufferCache = new Map()
async function loadXuLyTemplateBuffer(entity) {
  const url = TEMPLATES[entity]?.xuLy
  if (!url) throw new Error('Không xác định được mẫu Biên bản Xử lý (kho không hợp lệ).')
  if (templateBufferCache.has(url)) return templateBufferCache.get(url)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Không tải được file mẫu Biên bản Xử lý: ${url}`)
  const buf = await res.arrayBuffer()
  templateBufferCache.set(url, buf)
  return buf
}

function labelOf(entity) { return entity === 'khoC' ? 'KhoC' : 'KhoLGT' }

// record: { entity: 'khoC'|'khoDTP', processedAt (ISO), location, items: [{maHang, tenHang, soLo, hanDung, kho, dvt, soLuong, quyCach, ghiChu}] }
export async function exportDamagedGoodsXuLy(record) {
  const items = record.items || []
  if (items.length === 0) throw new Error('Chưa có mặt hàng nào trong biên bản.')
  const templateBuffer = await loadXuLyTemplateBuffer(record.entity)
  const bytes = await fillBienBanXuLy(templateBuffer, items, { location: record.location || '' })
  const label = new Date(record.processedAt || Date.now()).toLocaleDateString('vi-VN').replaceAll('/', '-')
  triggerDownloadBytes(bytes, `BBXL_HangLoi_${labelOf(record.entity)}_${label}.xlsx`)
}

// ---------- Kho A (hàng huỷ tạo từ phiếu xuất kho PDF) ----------

// Kho A dùng CHUNG mẫu + hàm điền với "hàng cận date" (exportExpiryDisposal.js): file mẫu thật do người
// dùng gửi cho Kho A có đúng bố cục 10 cột (không có cột "Kho" riêng như 2 kho trên), cùng định dạng ngày
// "TP.Hồ Chí Minh ngày..." và cùng dòng "Xuất xử lý" mặc định - nên không cần thêm file mẫu .xlsx mới.
// "Kho mặc định 020110" điền vào ô "3. Địa điểm xử lý:" của mẫu (diaDiem), không phải cột trong bảng.
const KHO_A_BBXL_TEMPLATE_URL = '/templates/BIEN_BAN_XU_LY_CAN_DATE.xlsx'
let khoABbxlTemplateBuffer = null
async function loadKhoABbxlTemplateBuffer() {
  if (khoABbxlTemplateBuffer) return khoABbxlTemplateBuffer
  const res = await fetch(KHO_A_BBXL_TEMPLATE_URL)
  if (!res.ok) throw new Error('Không tải được file mẫu Biên bản Xử lý.')
  khoABbxlTemplateBuffer = await res.arrayBuffer()
  return khoABbxlTemplateBuffer
}

// record: { entity: 'khoA', processedAt (ISO), items: [{maHang, tenHang, soLo, hanDung, dvt, soLuong, quyCach}] }
export async function exportDamagedGoodsKhoAXuLy(record) {
  const items = record.items || []
  if (items.length === 0) throw new Error('Chưa có mặt hàng nào trong biên bản.')
  const templateBuffer = await loadKhoABbxlTemplateBuffer()
  const bytes = await fillBienBanXuLyCanDate(templateBuffer, items, { diaDiem: 'Kho 020110' })
  const label = new Date(record.processedAt || Date.now()).toLocaleDateString('vi-VN').replaceAll('/', '-')
  triggerDownloadBytes(bytes, `BBXL_HangHuy_KhoA_${label}.xlsx`)
}

// Kho A dùng CHUNG mẫu Xác minh với "hàng cận date" luôn (BIEN_BAN_XAC_MINH_CAN_DATE.docx) — xác nhận qua
// 1 file ví dụ thật (CPC1HN_XÁC MINH_XK2621.00652.docx) khớp byte-for-byte về cấu trúc: "3. Địa điểm: Tại
// CN.Hồ Chí Minh" là chữ CỐ ĐỊNH có sẵn trong mẫu (không phải đặt theo "Kho 020110" như ô "Địa điểm xử lý"
// bên Excel), và bảng có cột "Kho" riêng luôn = "020110" cho mọi dòng (không phải Kho 020110 - không có
// tiền tố "Kho" như bên Excel).
const KHO_A_XACMINH_TEMPLATE_URL = '/templates/BIEN_BAN_XAC_MINH_CAN_DATE.docx'

export async function exportDamagedGoodsKhoAXacMinh(record) {
  const items = record.items || []
  if (items.length === 0) throw new Error('Chưa có mặt hàng nào trong biên bản.')
  const { ngay, thang, nam } = todayParts(record.processedAt ? new Date(record.processedAt) : new Date())
  const data = {
    ngay, thang, nam, gio: '08h30’',
    items: items.map((it, i) => ({
      stt: i + 1,
      maSanPham: it.maHang || '',
      tenHang: it.tenHang || '',
      soLo: it.soLo || '',
      hanDung: formatDateVi(it.hanDung),
      kho: '020110',
      dvt: it.dvt || '',
      soLuong: it.soLuong ?? '',
      quyCach: it.quyCach || '',
      tinhTrang: 'Hàng cận date',
    })),
  }
  const blob = await fillXacMinhTemplate(KHO_A_XACMINH_TEMPLATE_URL, data)
  const label = new Date(record.processedAt || Date.now()).toLocaleDateString('vi-VN').replaceAll('/', '-')
  triggerDownloadBlob(blob, `XacMinh_HangHuy_KhoA_${label}.docx`)
}

export async function exportDamagedGoodsXacMinh(record) {
  const items = record.items || []
  if (items.length === 0) throw new Error('Chưa có mặt hàng nào trong biên bản.')
  const url = TEMPLATES[record.entity]?.xacMinh
  if (!url) throw new Error('Không xác định được mẫu Biên bản Xác minh (kho không hợp lệ).')
  const { ngay, thang, nam } = todayParts(record.processedAt ? new Date(record.processedAt) : new Date())
  const data = {
    ngay, thang, nam, gio: '08h30’',
    items: items.map((it, i) => ({
      stt: i + 1,
      maSanPham: it.maHang || '',
      tenHang: it.tenHang || '',
      soLo: it.soLo || '',
      hanDung: formatDateVi(it.hanDung),
      kho: it.kho || '',
      dvt: it.dvt || '',
      soLuong: it.soLuong ?? '',
      quyCach: it.quyCach || '',
      tinhTrang: it.ghiChu || '',
    })),
  }
  const blob = await fillXacMinhTemplate(url, data)
  const label = new Date(record.processedAt || Date.now()).toLocaleDateString('vi-VN').replaceAll('/', '-')
  triggerDownloadBlob(blob, `XacMinh_HangLoi_${labelOf(record.entity)}_${label}.docx`)
}
