import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import PizZip from 'pizzip'
import { describe, expect, it } from 'vitest'
import { fillReceiptTemplate } from '../exportGoodsReceipt'
import { parsePdfMetadata } from '../parseGoodsReceipt'

const TEMPLATE_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '../../../public/templates/BIEN_BAN_NHAP_HANG.xlsx')
const PROCESSED_AT = new Date('2026-09-04T10:00:00')

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

function stylesOf(bytes) {
  const zip = new PizZip(bytes)
  return zip.file('xl/styles.xml').asText()
}

describe('exportGoodsReceipt', () => {
  it('fills template header metadata from pdf text', () => {
    const pdfText = 'Ngày 28 tháng 08 năm 2026 Họ và tên: Đặng Thanh Hải Biển số xe: 29E-785.54 SĐT liên hệ: 0979694941'
    const meta = parsePdfMetadata(pdfText)
    expect(meta.ngayNhap).toBe('28/08/2026')
    expect(meta.benVanChuyen).toContain('Đặng Thanh Hải')
    expect(meta.benGiaoHang).toContain('28/08/2026')
  })

  it('giữ nguyên file mẫu (logo, theme, style gốc) — chỉ nối thêm 1 style số nguyên mới, không sửa/xoá style có sẵn nào', async () => {
    const templateBuffer = loadTemplateBuffer()
    const original = new PizZip(templateBuffer.slice(0))
    const bytes = await fillReceiptTemplate(templateBuffer, [makeRow()], { metadata: {}, processedAt: PROCESSED_AT })
    const filled = new PizZip(bytes)

    const untouched = ['xl/media/image1.jpeg', 'xl/drawings/drawing1.xml', 'xl/theme/theme1.xml']
    untouched.forEach(path => {
      const before = original.file(path).asUint8Array()
      const after = filled.file(path).asUint8Array()
      expect(after).toEqual(before)
    })

    // styles.xml: mọi <xf> có sẵn phải còn nguyên vẹn theo đúng thứ tự (chỉ số cellXfs không đổi cho
    // style cũ nào), chỉ nối thêm đúng 1 <xf> mới ở cuối — không style nào có sẵn bị sửa hay xoá.
    const originalStylesDoc = new DOMParser().parseFromString(original.file('xl/styles.xml').asText(), 'application/xml')
    const filledStylesDoc = new DOMParser().parseFromString(stylesOf(bytes), 'application/xml')
    const originalXfs = Array.from(originalStylesDoc.querySelector('cellXfs').children)
    const filledXfs = Array.from(filledStylesDoc.querySelector('cellXfs').children)
    expect(filledXfs.length).toBe(originalXfs.length + 1)
    originalXfs.forEach((xf, i) => expect(filledXfs[i].outerHTML).toBe(xf.outerHTML))
    expect(filledXfs.at(-1).getAttribute('numFmtId')).toBe('3')
  })

  it('điền đúng cột theo mẫu giấy — chỉ điền Hoá đơn trong nhóm Số lượng, Thực tế/Chênh lệch/Hư hỏng/Tình trạng để trống cho người kiểm hàng tự điền tay', async () => {
    const templateBuffer = loadTemplateBuffer()
    const bytes = await fillReceiptTemplate(templateBuffer, [makeRow()], { metadata: { noiNhan: 'Kho C' }, processedAt: PROCESSED_AT })
    const sheetXml = sheetXmlOf(bytes)
    const sst = sharedStringsOf(bytes)
    const doc = new DOMParser().parseFromString(sheetXml, 'application/xml')
    const sstDoc = new DOMParser().parseFromString(sst, 'application/xml')
    const sharedText = i => sstDoc.documentElement.getElementsByTagName('si')[i]?.textContent || ''

    const cell = (row, col) => doc.querySelector(`c[r="${col}${row}"]`)
    const cellText = (row, col) => {
      const c = cell(row, col)
      if (!c) return null
      const v = c.querySelector('v')?.textContent
      return c.getAttribute('t') === 's' ? sharedText(Number(v)) : v
    }

    expect(cellText(15, 'B')).toContain('A01259')
    expect(cellText(15, 'F')).toBe('2')
    expect(cellText(15, 'G')).toBe('1')
    expect(cellText(15, 'H')).toBe('7920')
    // Thực tế, Chênh lệch, Hư hỏng, Tình trạng: không tự điền — giữ nguyên ô trống của mẫu.
    expect(cell(15, 'I').querySelector('v')).toBeNull()
    expect(cell(15, 'J').querySelector('v')).toBeNull()
    expect(cell(15, 'K').querySelector('v')).toBeNull()
    expect(cell(15, 'L').querySelector('v')).toBeNull()

    // Số hóa đơn tự sinh theo mã BBGNddmmyyyy từ ngày xử lý chuyến hàng, không lấy từ PDF.
    expect(cellText(6, 'B')).toBe('Số hóa đơn : BBGN04092026')
    expect(cellText(8, 'B')).toContain('Kho C')

    // Ảnh/logo (drawing) vẫn được tham chiếu — không bị SheetJS-style xoá mất.
    expect(sheetXml).toContain('<drawing r:id="rId2"/>')
  })

  it('Kiện nguyên/Kiện lẻ bằng 0 vẫn hiện "0" (dữ liệu thật), không bị coi như trống', async () => {
    const templateBuffer = loadTemplateBuffer()
    const bytes = await fillReceiptTemplate(templateBuffer, [makeRow({ kienNguyen: 2, kienLe: 0 })], { processedAt: PROCESSED_AT })
    const doc = new DOMParser().parseFromString(sheetXmlOf(bytes), 'application/xml')
    expect(doc.querySelector('c[r="G15"] v').textContent).toBe('0')
  })

  it('3 cột Kiện nguyên/Kiện lẻ/Hoá đơn dùng chung 1 style số nguyên, không còn lệch định dạng giữa các dòng', async () => {
    const templateBuffer = loadTemplateBuffer()
    // 15 dòng để phủ cả 12 dòng có sẵn (vốn có nhiều style rời rạc khác nhau) lẫn dòng tự nhân thêm.
    const rows = Array.from({ length: 15 }, (_, i) => makeRow({ maHang: `A0${i}`, soLo: `LOT${i}` }))
    const bytes = await fillReceiptTemplate(templateBuffer, rows, { processedAt: PROCESSED_AT })
    const doc = new DOMParser().parseFromString(sheetXmlOf(bytes), 'application/xml')

    const styleIds = new Set()
    for (let i = 0; i < rows.length; i += 1) {
      const row = 15 + i
      ;['F', 'G', 'H'].forEach(col => styleIds.add(doc.querySelector(`c[r="${col}${row}"]`).getAttribute('s')))
    }
    expect(styleIds.size).toBe(1)
  })

  it('tự thêm dòng + dời chân ký tên khi số hàng vượt quá 12 dòng có sẵn trong mẫu', async () => {
    const templateBuffer = loadTemplateBuffer()
    const rows = Array.from({ length: 15 }, (_, i) => makeRow({ maHang: `A0${i}`, soLo: `LOT${i}` }))
    const bytes = await fillReceiptTemplate(templateBuffer, rows, { processedAt: PROCESSED_AT })
    const doc = new DOMParser().parseFromString(sheetXmlOf(bytes), 'application/xml')

    // 15 dòng dữ liệu -> dòng cuối là 15+15-1 = 29, chân ký tên dời xuống dòng 30 (27 + 3 dòng thêm).
    expect(doc.querySelector('dimension').getAttribute('ref')).toBe('A1:M30')
    expect(doc.querySelector('row[r="30"] c[r="B30"]')).toBeTruthy()
    expect(doc.querySelector('mergeCell[ref="E30:I30"]')).toBeTruthy()
    expect(doc.querySelector('row[r="29"] c[r="A29"] v').textContent).toBe('15')
    expect(doc.querySelector('rowBreaks')).toBeNull()
  })
})
