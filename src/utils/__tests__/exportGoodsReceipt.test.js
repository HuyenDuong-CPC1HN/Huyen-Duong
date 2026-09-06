import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import PizZip from 'pizzip'
import { describe, expect, it } from 'vitest'
import { fillReceiptTemplate } from '../exportGoodsReceipt'
import { parsePdfMetadata } from '../parseGoodsReceipt'

const TEMPLATE_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '../../../public/templates/BIEN_BAN_NHAP_HANG.xlsx')

function loadTemplateBuffer() {
  const buf = readFileSync(TEMPLATE_PATH)
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
}

function makeRow(overrides = {}) {
  return {
    maHang: 'A01259',
    tenHang: 'Aricamun - 2 vỉ x 15 viên',
    dvt: 'VIEN',
    soLo: '010426',
    hanDung: '2028-04-23',
    kienNguyen: 2,
    kienLe: 1,
    slHoaDon: 7920,
    slThucTe: 7900,
    ghiChu: '',
    ...overrides,
  }
}

function sheetXmlOf(bytes) {
  const zip = new PizZip(bytes)
  return zip.file('xl/worksheets/sheet1.xml').asText()
}

function sharedStringsOf(bytes) {
  const zip = new PizZip(bytes)
  return zip.file('xl/sharedStrings.xml').asText()
}

describe('exportGoodsReceipt', () => {
  it('fills template header metadata from pdf text', () => {
    const pdfText = 'Ngày 28 tháng 08 năm 2026 Họ và tên: Đặng Thanh Hải Biển số xe: 29E-785.54 SĐT liên hệ: 0979694941'
    const meta = parsePdfMetadata(pdfText)
    expect(meta.ngayNhap).toBe('28/08/2026')
    expect(meta.benVanChuyen).toContain('Đặng Thanh Hải')
    expect(meta.benGiaoHang).toContain('28/08/2026')
  })

  it('giữ nguyên toàn bộ file mẫu (logo, style, theme) — chỉ sửa sheet dữ liệu + sharedStrings', async () => {
    const templateBuffer = loadTemplateBuffer()
    const original = new PizZip(templateBuffer.slice(0))
    const bytes = await fillReceiptTemplate(templateBuffer, [makeRow()], { metadata: {} })
    const filled = new PizZip(bytes)

    const untouched = ['xl/media/image1.jpeg', 'xl/drawings/drawing1.xml', 'xl/styles.xml', 'xl/theme/theme1.xml']
    untouched.forEach(path => {
      const before = original.file(path).asUint8Array()
      const after = filled.file(path).asUint8Array()
      expect(after).toEqual(before)
    })
  })

  it('điền đúng cột theo mẫu giấy (Kiện nguyên/Kiện lẻ sau Hạn dùng, Chênh lệch tự tính từ SL thực tế)', async () => {
    const templateBuffer = loadTemplateBuffer()
    const bytes = await fillReceiptTemplate(templateBuffer, [makeRow()], { metadata: { ngayNhap: '28/08/2026', noiNhan: 'Kho C' } })
    const sheetXml = sheetXmlOf(bytes)
    const sst = sharedStringsOf(bytes)
    const doc = new DOMParser().parseFromString(sheetXml, 'application/xml')
    const sstDoc = new DOMParser().parseFromString(sst, 'application/xml')
    const sharedText = i => sstDoc.documentElement.getElementsByTagName('si')[i]?.textContent || ''

    const cellText = (row, col) => {
      const cell = doc.querySelector(`c[r="${col}${row}"]`)
      if (!cell) return null
      const v = cell.querySelector('v')?.textContent
      return cell.getAttribute('t') === 's' ? sharedText(Number(v)) : v
    }

    expect(cellText(15, 'B')).toContain('A01259')
    expect(cellText(15, 'F')).toBe('2')
    expect(cellText(15, 'G')).toBe('1')
    expect(cellText(15, 'H')).toBe('7920')
    expect(cellText(15, 'I')).toBe('7900')
    expect(cellText(15, 'J')).toBe('20')
    expect(cellText(8, 'B')).toContain('Kho C')

    // Ảnh/logo (drawing) vẫn được tham chiếu — không bị SheetJS-style xoá mất.
    expect(sheetXml).toContain('<drawing r:id="rId2"/>')
  })

  it('bỏ trống Chênh lệch khi chưa có SL thực tế, không tự suy đoán', async () => {
    const templateBuffer = loadTemplateBuffer()
    const bytes = await fillReceiptTemplate(templateBuffer, [makeRow({ slThucTe: null })], {})
    const doc = new DOMParser().parseFromString(sheetXmlOf(bytes), 'application/xml')
    const cell = doc.querySelector('c[r="J15"]')
    expect(cell.querySelector('v').textContent).toBe('')
    expect(cell.querySelector('f').textContent).toContain('IF(I15')
  })

  it('tự thêm dòng + dời chân ký tên khi số hàng vượt quá 12 dòng có sẵn trong mẫu', async () => {
    const templateBuffer = loadTemplateBuffer()
    const rows = Array.from({ length: 15 }, (_, i) => makeRow({ maHang: `A0${i}`, soLo: `LOT${i}` }))
    const bytes = await fillReceiptTemplate(templateBuffer, rows, {})
    const doc = new DOMParser().parseFromString(sheetXmlOf(bytes), 'application/xml')

    // 15 dòng dữ liệu -> dòng cuối là 15+15-1 = 29, chân ký tên dời xuống dòng 30 (27 + 3 dòng thêm).
    expect(doc.querySelector('dimension').getAttribute('ref')).toBe('A1:M30')
    expect(doc.querySelector('row[r="30"] c[r="B30"]')).toBeTruthy()
    expect(doc.querySelector('mergeCell[ref="E30:I30"]')).toBeTruthy()
    expect(doc.querySelector('row[r="29"] c[r="A29"] v').textContent).toBe('15')
    expect(doc.querySelector('rowBreaks')).toBeNull()
  })
})
