import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import PizZip from 'pizzip'
import { describe, expect, it } from 'vitest'
import fixtures from './fixtures/invoiceLines.json'
import { parseInvoiceLines } from '../parseInvoicePdf'
import { manualPdfFromInvoice, newSlipForm, switchManualMau } from '../returnSlips'
import { buildTraHangData, buildXacMinhData, renderDocx } from '../exportReturnSlip'

const TPL = resolve(dirname(fileURLToPath(import.meta.url)), '../../../public/templates')
const load = name => { const b = readFileSync(`${TPL}/${name}`); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) }
const text = bytes => new PizZip(bytes).file('word/document.xml').asText().replace(/<\/w:p>/g, '\n').replace(/<[^>]+>/g, '')

describe('xuất Word cho đơn nhập tay từ hoá đơn (Đơn DTP)', () => {
  const inv = parseInvoiceLines(fixtures.dtp_1item)
  const { pdf, formPatch } = manualPdfFromInvoice(inv, { khachHang: '' })
  const slip = { khachHang: inv.benMua.ten, pdf, form: { ...newSlipForm(1, new Date('2026-09-30T09:00:00')), ...formPatch } }

  it('mặc định mẫu nội bộ: BB trả lại hàng có hoá đơn, hàng, số lô, tiền (không có bên mua/bán)', () => {
    expect(pdf.mau).toBe('NOIBO')
    const t = text(renderDocx(load('BBTH_NOIBO.docx'), buildTraHangData(slip), 'uint8array'))
    for (const s of ['00581703', '1C26MNT', 'Topi Nebuliser - Hộp 10 ống 5ml', '011125', '84,000', '2,520,000']) expect(t).toContain(s)
  })

  it('đổi sang mẫu UPHARMA: có bên bán, bên mua, bằng chữ', () => {
    const u = { ...slip, pdf: switchManualMau(pdf, 'UPHARMA') }
    const t = text(renderDocx(load('BBTH_UPHARMA.docx'), buildTraHangData(u), 'uint8array'))
    for (const s of ['00581703', 'CÔNG TY CỔ PHẦN UPHARMA', '0109313177', 'Nguyễn Văn A', 'Hai triệu năm trăm hai mươi nghìn đồng./.']) expect(t).toContain(s)
  })

  it('BB xác minh (mẫu U) có số lô và hạn dùng lấy từ hoá đơn', () => {
    const t = text(renderDocx(load('BIEN_BAN_XAC_MINH_UPHARMA.docx'), buildXacMinhData(slip), 'uint8array'))
    expect(t).toContain('011125')
    expect(t).toContain('28/11/2028')
  })
})
