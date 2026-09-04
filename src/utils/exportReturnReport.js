import PizZip from 'pizzip'
import Docxtemplater from 'docxtemplater'

const TEMPLATES = {
  donC: {
    traHang: '/templates/BIEN_BAN_TRA_HANG_CPC1HN.docx',
    xacMinh: '/templates/BIEN_BAN_XAC_MINH_CPC1HN.docx',
  },
  donDTP: {
    traHang: '/templates/BIEN_BAN_TRA_HANG_UPHARMA.docx',
    xacMinh: '/templates/BIEN_BAN_XAC_MINH_UPHARMA.docx',
  },
}

function pad2(n) { return String(n).padStart(2, '0') }

// Tách 1 mốc ngày giờ (ISO hoặc Date) thành các phần ngày/tháng/năm/giờ dùng cho biên bản
export function splitDatetime(value) {
  const d = value ? new Date(value) : new Date()
  return {
    ngay: pad2(d.getDate()),
    thang: pad2(d.getMonth() + 1),
    nam: String(d.getFullYear()),
    gio: `${pad2(d.getHours())}h${pad2(d.getMinutes())}`,
  }
}

async function fillTemplate(templatePath, data, fetchImpl = fetch) {
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

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function slugifyName(name) {
  return String(name || 'KhachHang').trim().replace(/\s+/g, ' ').slice(0, 60)
}

export async function exportTraHang(record) {
  const template = TEMPLATES[record.entity]?.traHang
  if (!template) throw new Error('Không xác định được mẫu biên bản (entity không hợp lệ).')
  const { ngay, thang, nam } = splitDatetime(record.createdAt)
  const data = {
    ngay, thang, nam,
    daiDienKeToan: record.repAccounting || '',
    daiDienKinhDoanh: record.repSales || '',
    giaTriBangChu: record.giaTriBangChu || '',
    lyDoTraHang: record.returnReason || '',
    invoices: (record.invoices || []).map(inv => ({
      mauSo: inv.mauSo || '', kyHieu: inv.kyHieu || '', soHoaDon: inv.soHoaDon || '',
      ngayLapHD: inv.ngayLapHD || '', khachHangMua: inv.khachHangMua || record.customerName || '',
      diaChi: inv.diaChi || record.customerAddress || '', mst: inv.mst || record.customerMst || '',
      tenHangHoa: inv.tenHangHoa || '', soLuong: inv.soLuong || '', giaTri: inv.giaTri || '',
    })),
  }
  const blob = await fillTemplate(template, data)
  downloadBlob(blob, `BienBanTraHang_${slugifyName(record.customerName)}.docx`)
}

export async function exportXacMinh(record) {
  const template = TEMPLATES[record.entity]?.xacMinh
  if (!template) throw new Error('Không xác định được mẫu biên bản (entity không hợp lệ).')
  const { ngay, thang, nam } = splitDatetime(record.verifyDatetime || record.createdAt)
  const data = {
    khachHangXacMinh: record.customerName || '',
    ngayXM: ngay, thangXM: thang, namXM: nam,
    diaDiem: record.verifyLocation || '',
    keToanVienXacMinh: record.repAccounting || '',
    ketQuaXacMinh: record.verifyResult || '',
    products: (record.products || []).map((p, i) => ({
      stt: i + 1,
      tenHang: p.tenHang || '', soLo: p.soLo || '', hanDung: p.hanDung || '',
      donViTinh: p.donViTinh || '', soLuongXM: p.soLuong || '', quyCach: p.quyCach || '',
      tinhTrang: p.tinhTrang || 'Hàng nguyên vẹn',
    })),
  }
  const blob = await fillTemplate(template, data)
  downloadBlob(blob, `BienBanXacMinh_${slugifyName(record.customerName)}.docx`)
}
