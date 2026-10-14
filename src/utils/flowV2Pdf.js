import { manualPdfFromInvoice, parseReturnSlipLines } from './returnSlips'
import { extractPdfLines } from './returnSlipPdf'
import { parseInvoiceLines } from './parseInvoicePdf'
import { newItem, newTraHang } from './flowV2'

const looksLikeInvoice = lines => lines.some(l => /HÓA ĐƠN GIÁ TRỊ GIA TĂNG|HOÁ ĐƠN GIÁ TRỊ GIA TĂNG|Ký hiệu\s*\(Serial\)/i.test(l))
const nameOf = block => String(block?.daiDien || '').trim()

// Đọc PDF khách trả cho tab Hàng trả & huỷ (Demo) → { khachHang, traHang, items }.
// - Hoá đơn: dựng Biên bản trả lại hàng mẫu nội bộ (giống tab Nhập trả lại), điền sẵn số / ký hiệu / ngày hoá đơn.
// - Biên bản trả hàng in từ website: giữ đúng mẫu đó, lấy luôn Bên A / Bên B / Bên C, lý do, đơn giá có trong file.
export async function readReturnPdf(arrayBuffer) {
  const lines = await extractPdfLines(arrayBuffer)
  if (looksLikeInvoice(lines)) {
    const inv = parseInvoiceLines(lines)
    const khachHang = inv.benMua?.ten || ''
    const { pdf, formPatch } = manualPdfFromInvoice(inv, { khachHang })
    const form = { ...formPatch }
    delete form.items
    delete form.xmMau
    return {
      khachHang, traHang: newTraHang({ khachHang, pdf, form }),
      items: (inv.items || []).map(it => newItem({ tenHang: it.ten || '', dvt: it.dvt || '', soLuong: it.soLuong ?? null, soLo: it.soLo || '', hanDung: it.hanDung || '', donGia: it.donGia ?? null })),
    }
  }
  const pdf = parseReturnSlipLines(lines)
  const khachHang = pdf.benMua?.ten || ''
  const form = { mst: pdf.benMua?.mst || '' }
  if (nameOf(pdf.benA)) { form.benA = nameOf(pdf.benA); if (pdf.benA.chucVu) form.benAChucVu = pdf.benA.chucVu }
  if (nameOf(pdf.benB)) { form.benB = nameOf(pdf.benB); if (pdf.benB.chucVu) form.benBChucVu = pdf.benB.chucVu }
  return {
    khachHang, traHang: newTraHang({ khachHang, pdf, form }),
    items: (pdf.items || []).map(it => newItem({ tenHang: it.ten || '', dvt: it.dvt || '', soLuong: it.soLuong ?? null, soLo: it.soLo || '', donGia: it.donGia ?? null })),
  }
}
