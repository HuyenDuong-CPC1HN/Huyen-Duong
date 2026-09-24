import PizZip from 'pizzip'
import Docxtemplater from 'docxtemplater'
import { fillBienBanXuLy, todayParts } from './exportDamagedGoods'
import { formatDmy, isoWeekNumber, nhapLaiItems, tinhTrangFromLyDo } from './swapReturnWeek'

// Tab "Đổi trả hàng" không có mẫu riêng — dùng lại đúng mẫu của 2 tab đang chạy, tách theo pháp nhân:
// Đơn C = CPC1HN (Kho C), Đơn DTP = UPHARMA (Kho LGT).
//  - BB Xử lý + BB xác minh xuất kho (gộp cả tuần): mẫu của "Theo dõi hàng huỷ".
//  - BB xác minh nhập lại kho (mỗi khách có hàng khác lô): mẫu của "Theo dõi nhập trả lại",
//    vốn đã in sẵn "Ý kiến: Nhập lại vào kho".
const TEMPLATES = {
  donC: {
    xuLy: '/templates/BIEN_BAN_XU_LY_HANG_LOI_KHO_C.xlsx',
    xuatKho: '/templates/BIEN_BAN_XAC_MINH_HANG_LOI_KHO_C.docx',
    nhapLai: '/templates/BIEN_BAN_XAC_MINH_CPC1HN.docx',
  },
  donDTP: {
    xuLy: '/templates/BIEN_BAN_XU_LY_HANG_LOI_KHO_LGT.xlsx',
    xuatKho: '/templates/BIEN_BAN_XAC_MINH_HANG_LOI_KHO_LGT.docx',
    nhapLai: '/templates/BIEN_BAN_XAC_MINH_UPHARMA.docx',
  },
}

// Mẫu CPC1HN in sẵn "3. Địa điểm: Tại {diaDiem}", mẫu UPHARMA chỉ có "3. Địa điểm: {diaDiem}" — cả 2
// phải ra cùng 1 dòng "Tại CN. Hồ Chí Minh".
const NHAP_LAI_DIA_DIEM = { donC: 'CN. Hồ Chí Minh', donDTP: 'Tại CN. Hồ Chí Minh' }
// Mã kho mặc định cho cột "Kho" của BB Xử lý và BB xác minh xuất kho — hàng ở kho khác thì người dùng sửa
// tay trên file sau khi xuất.
const DEFAULT_KHO = { donC: '020101', donDTP: '020105' }
const XU_LY_LOCATION = 'Kho CN Hồ Chí Minh'

// Tên kế toán trong mẫu hàng huỷ là chữ gõ cứng, không phải ô điền — thay đúng đoạn chữ đó trên bản sao
// của mẫu. Hai file mẫu viết dấu khác nhau ("Thuỳ" trong Word, "Thùy" trong Excel).
const DOCX_ACCOUNTANT_RUN = '<w:t>Lưu Thị Thuỳ</w:t>'
const XLSX_ACCOUNTANT_STRING = '<t>Lưu Thị Thùy</t>'

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

function templatesOf(entity) {
  const t = TEMPLATES[entity]
  if (!t) throw new Error('Không xác định được mẫu biên bản (kho không hợp lệ).')
  return t
}

function escapeXml(text) {
  return String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]))
}

function renderDocx(zip, data) {
  const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true, nullGetter: () => '' })
  doc.render(data)
  return doc.getZip().generate({ type: 'blob', mimeType: DOCX_MIME })
}

function weekLabel(weekStart) {
  return `Tuan${isoWeekNumber(weekStart)}-${weekStart.slice(0, 4)}`
}
function entityLabel(entity) { return entity === 'donC' ? 'DonC' : 'DonDTP' }
function slugifyName(name) {
  return String(name || 'KhachHang').trim().replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').slice(0, 60)
}

// ---------- Bộ huỷ cuối tuần ----------

export function withAccountantInXuLyTemplate(templateBuffer, accountant) {
  const zip = new PizZip(templateBuffer.slice(0))
  const xml = zip.file('xl/sharedStrings.xml').asText()
  if (!xml.includes(XLSX_ACCOUNTANT_STRING)) throw new Error('Mẫu Biên bản Xử lý không còn dòng tên kế toán để thay.')
  zip.file('xl/sharedStrings.xml', xml.replace(XLSX_ACCOUNTANT_STRING, `<t>${escapeXml(accountant)}</t>`))
  return zip.generate({ type: 'arraybuffer' })
}

function defaultKhoOf(entity) {
  const kho = DEFAULT_KHO[entity]
  if (!kho) throw new Error('Không xác định được mẫu biên bản (kho không hợp lệ).')
  return kho
}

export async function buildWeeklyXuLy(templateBuffer, items, accountant, { entity }) {
  const kho = defaultKhoOf(entity)
  const rows = items.map(it => ({
    maHang: it.maHang, tenHang: it.tenHang, soLo: it.loLoi, hanDung: it.hanDungLoi || '',
    kho, dvt: it.dvt, soLuong: it.soLuong, quyCach: it.quyCach || '', ghiChu: it.lyDo || '',
  }))
  return fillBienBanXuLy(withAccountantInXuLyTemplate(templateBuffer, accountant), rows, { location: XU_LY_LOCATION })
}

export function buildWeeklyXuatKho(templateBuffer, items, accountant, { entity, date = new Date() }) {
  const kho = defaultKhoOf(entity)
  const zip = new PizZip(templateBuffer.slice(0))
  const xml = zip.file('word/document.xml').asText()
  if (!xml.includes(DOCX_ACCOUNTANT_RUN)) throw new Error('Mẫu Biên bản xác minh xuất kho không còn dòng tên kế toán để thay.')
  zip.file('word/document.xml', xml.replace(DOCX_ACCOUNTANT_RUN, '<w:t>{keToanXacMinh}</w:t>'))
  const { ngay, thang, nam } = todayParts(date)
  return renderDocx(zip, {
    ngay, thang, nam, gio: '08h30’',
    keToanXacMinh: accountant,
    items: items.map((it, i) => ({
      stt: i + 1,
      maSanPham: it.maHang || '',
      tenHang: it.tenHang || '',
      soLo: it.loLoi || '',
      hanDung: it.hanDungLoi || '',
      kho,
      dvt: it.dvt || '',
      soLuong: it.soLuong ?? '',
      quyCach: it.quyCach || '',
      tinhTrang: it.lyDo || '',
    })),
  })
}

// ---------- BB xác minh nhập lại kho (mỗi khách hàng) ----------

export function buildNhapLai(templateBuffer, record) {
  const items = nhapLaiItems(record)
  if (items.length === 0) throw new Error('Đợt này không có hàng khác lô — không cần BB xác minh nhập lại kho.')
  const [nam, thang, ngay] = String(record.date).split('-')
  return renderDocx(new PizZip(templateBuffer.slice(0)), {
    khachHangXacMinh: record.customerName || '',
    ngayXM: ngay, thangXM: thang, namXM: nam,
    diaDiem: NHAP_LAI_DIA_DIEM[record.entity] || '',
    keToanVienXacMinh: record.accountantNhapLai || '',
    ketQuaXacMinh: '',
    products: items.map((it, i) => ({
      stt: i + 1,
      tenHang: it.tenHang || '',
      soLo: it.loLoi || '',
      hanDung: it.hanDungLoi || '',
      donViTinh: it.dvt || '',
      soLuongXM: it.soLuong ?? '',
      quyCach: it.quyCach || '',
      tinhTrang: tinhTrangFromLyDo(it.lyDo),
    })),
  })
}

// ---------- Tải file ----------

async function fetchTemplate(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Không tải được file mẫu: ${url}`)
  return res.arrayBuffer()
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export async function exportSwapWeeklyXuLy({ entity, weekStart, items, accountant }) {
  if (!items.length) throw new Error('Tuần này chưa có mặt hàng nào.')
  const bytes = await buildWeeklyXuLy(await fetchTemplate(templatesOf(entity).xuLy), items, accountant, { entity })
  downloadBlob(new Blob([bytes], { type: XLSX_MIME }), `BBXL_DoiTra_${entityLabel(entity)}_${weekLabel(weekStart)}.xlsx`)
}

export async function exportSwapWeeklyXuatKho({ entity, weekStart, items, accountant }) {
  if (!items.length) throw new Error('Tuần này chưa có mặt hàng nào.')
  const blob = buildWeeklyXuatKho(await fetchTemplate(templatesOf(entity).xuatKho), items, accountant, { entity })
  downloadBlob(blob, `XacMinh_XuatKho_DoiTra_${entityLabel(entity)}_${weekLabel(weekStart)}.docx`)
}

export async function exportSwapNhapLai(record) {
  const blob = buildNhapLai(await fetchTemplate(templatesOf(record.entity).nhapLai), record)
  downloadBlob(blob, `XacMinh_NhapLaiKho_${slugifyName(record.customerName)}_${formatDmy(record.date).replaceAll('/', '-')}.docx`)
}
