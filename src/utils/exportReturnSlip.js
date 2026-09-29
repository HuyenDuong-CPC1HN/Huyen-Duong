import PizZip from 'pizzip'
import Docxtemplater from 'docxtemplater'
import { slipLoai, effectiveLyDo } from './returnSlips'

// Xuất bộ file Word cho 1 phiếu trả hàng: biên bản trả lại hàng (mẫu CPC1HN / UPHARMA / nội bộ, dựng theo
// đúng nội dung file PDF website in ra) + biên bản xác minh (mẫu C hoặc U). Chỗ kho chưa điền giữ "……" như
// file gốc để sửa/in sau.
const TRA_HANG_TEMPLATES = {
  CPC1HN: '/templates/BBTH_CPC1HN.docx',
  UPHARMA: '/templates/BBTH_UPHARMA.docx',
  NOIBO: '/templates/BBTH_NOIBO.docx',
}
const XAC_MINH_TEMPLATES = {
  C: '/templates/BIEN_BAN_XAC_MINH_CPC1HN.docx',
  DTP: '/templates/BIEN_BAN_XAC_MINH_UPHARMA.docx',
}
const BLANK = '…………'

const orBlank = v => (v === null || v === undefined || String(v).trim() === '' ? BLANK : String(v))
const money = n => (Number(n) || 0).toLocaleString('en-US')
function dmy(iso) {
  if (!iso) return [BLANK, BLANK, BLANK]
  const [y, m, d] = String(iso).split('-')
  return [d || BLANK, m || BLANK, y || BLANK]
}

export function buildTraHangData(slip) {
  const pdf = slip.pdf
  const f = slip.form || {}
  const [ngay, thang, nam] = dmy(f.ngayLap)
  const [ngayHD, thangHD, namHD] = dmy(f.ngayHD)
  const items = (pdf.items || []).map((it, i) => ({
    stt: it.stt || i + 1,
    ten: it.ten,
    dvt: it.dvt,
    soLuong: money(it.soLuong),
    soLo: f.items?.[i]?.soLo || it.soLo || '',
    donGia: money(it.donGia),
    thanhTien: money(it.thanhTien),
  }))
  const common = {
    ngay, thang, nam,
    soHD: orBlank(f.soHD), kyHieu: orBlank(f.kyHieu), ngayHD, thangHD, namHD,
    lyDo: effectiveLyDo(pdf),
    items,
    tongTien: money(pdf.tongTien),
  }
  if (pdf.mau === 'NOIBO') {
    return {
      ...common,
      benA: orBlank(f.benA), benAChucVu: orBlank(f.benAChucVu),
      benB: orBlank(f.benB), benBChucVu: orBlank(f.benBChucVu),
      benC: orBlank(pdf.benC?.daiDien), benCChucVu: orBlank(pdf.benC?.chucVu),
    }
  }
  return {
    ...common,
    benMua: pdf.benMua?.ten || '', diaChi: pdf.benMua?.diaChi || '',
    mst: orBlank(f.mst || pdf.benMua?.mst), daiDien: pdf.benMua?.daiDien || '', chucVu: pdf.benMua?.chucVu || '',
    benBan: pdf.benBan?.ten || '', benBanDiaChi: pdf.benBan?.diaChi || '', benBanMst: pdf.benBan?.mst || '',
    benBanDaiDien: pdf.benBan?.daiDien || '', benBanChucVu: pdf.benBan?.chucVu || '',
    bangChu: pdf.bangChu || '',
  }
}

export function buildXacMinhData(slip) {
  const pdf = slip.pdf
  const f = slip.form || {}
  const [ngayXM, thangXM, namXM] = dmy(f.xmNgay)
  const gioXM = f.xmGio ? `${f.xmGio.replace(':', 'h')}’` : BLANK
  return {
    khachHangXacMinh: slip.khachHang || pdf.benMua?.ten || '',
    ngayXM, thangXM, namXM, gioXM,
    diaDiem: orBlank(f.xmDiaDiem),
    keToanVienXacMinh: orBlank(f.xmKeToan),
    ketQuaXacMinh: orBlank(f.xmKetQua),
    products: (pdf.items || []).map((it, i) => {
      const extra = f.items?.[i] || {}
      const [d, m, y] = dmy(extra.hanDung)
      return {
        stt: i + 1,
        tenHang: it.ten,
        soLo: extra.soLo || it.soLo || '',
        hanDung: extra.hanDung ? `${d}/${m}/${y}` : '',
        donViTinh: it.dvt,
        soLuongXM: money(it.soLuong),
        quyCach: extra.quyCach || '',
        tinhTrang: f.xmTinhTrang || '',
      }
    }),
  }
}

export function renderDocx(templateBuffer, data, type = 'blob') {
  const doc = new Docxtemplater(new PizZip(templateBuffer), { paragraphLoop: true, linebreaks: true })
  doc.render(data)
  return doc.getZip().generate({
    type,
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  })
}

async function loadTemplate(path) {
  const res = await fetch(path)
  if (!res.ok) throw new Error(`Không tải được file mẫu: ${path}`)
  return res.arrayBuffer()
}

function download(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function fileLabel(slip) {
  const base = slip.maPhieu || slip.khachHang || 'PhieuTraHang'
  return String(base).replace(/[\\/:*?"<>|]+/g, '-').trim().slice(0, 60)
}

export async function exportReturnSlipDocs(slip) {
  if (!slip?.pdf) throw new Error('Chưa tải file biên bản từ website cho phiếu này.')
  const loai = slipLoai(slip)
  const [traHangTpl, xacMinhTpl] = await Promise.all([
    loadTemplate(TRA_HANG_TEMPLATES[slip.pdf.mau]),
    loadTemplate(XAC_MINH_TEMPLATES[loai]),
  ])
  const label = fileLabel(slip)
  download(renderDocx(traHangTpl, buildTraHangData(slip)), `BBTH_${label}.docx`)
  download(renderDocx(xacMinhTpl, buildXacMinhData(slip)), `BBXM_${label}.docx`)
}
