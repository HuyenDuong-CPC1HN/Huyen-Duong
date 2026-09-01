import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'
import * as XLSX from 'xlsx'
import { fillReceiptSheet, workbookFromTemplateBuffer } from '../exportGoodsReceipt'
import { parsePdfMetadata } from '../parseGoodsReceipt'

describe('exportGoodsReceipt', () => {
  const templatePath = path.join(process.cwd(), 'public/templates/BIEN_BAN_NHAP_HANG.xlsx')
  const templateBuffer = fs.readFileSync(templatePath)

  it('fills template header metadata from pdf text', () => {
    const pdfText = 'Ngày 28 tháng 08 năm 2026 Họ và tên: Đặng Thanh Hải Biển số xe: 29E-785.54 SĐT liên hệ: 0979694941'
    const meta = parsePdfMetadata(pdfText)
    expect(meta.ngayNhap).toBe('28/08/2026')
    expect(meta.benVanChuyen).toContain('Đặng Thanh Hải')
    expect(meta.benGiaoHang).toContain('28/08/2026')
  })

  it('writes data rows with chenh lech formulas into company template', () => {
    const wb = workbookFromTemplateBuffer(templateBuffer, [
      {
        maHang: 'A01259',
        tenHang: 'Aricamun - 2 vỉ x 15 viên',
        dvt: 'VIEN',
        soLo: '010426',
        hanDung: '2028-04-23',
        slHoaDon: 7920,
        slThucTe: null,
        ghiChu: '',
      },
    ], { warehouseLabel: 'KHO C', metadata: { ngayNhap: '28/08/2026' } })

    const ws = wb.Sheets['BIEN BAN NHAP HANG']
    expect(ws.B13.v).toBe('A01259')
    expect(ws.G13.v).toBe(7920)
    expect(ws.I13.f).toContain('IF(H13>G13')
    expect(ws.A4.v).toContain('KHO C')
  })
})
