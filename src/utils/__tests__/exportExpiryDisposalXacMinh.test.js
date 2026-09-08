import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import PizZip from 'pizzip'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { exportExpiryDisposal } from '../exportExpiryDisposal'

const XACMINH_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '../../../public/templates/BIEN_BAN_XAC_MINH_CAN_DATE.docx')
const BBXL_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '../../../public/templates/BIEN_BAN_XU_LY_CAN_DATE.xlsx')

function docXmlText(bytes) {
  const zip = new PizZip(bytes)
  return zip.file('word/document.xml').asText()
}
function plainText(xml) {
  return xml
    .replace(/<w:tab\/>/g, '\t')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<\/w:tr>/g, '\n')
    .replace(/<\/w:tc>/g, ' | ')
    .replace(/<[^>]+>/g, '')
}

describe('exportExpiryDisposal — Biên bản Xác minh (Word)', () => {
  const originalCreateObjectURL = URL.createObjectURL
  const originalRevokeObjectURL = URL.revokeObjectURL
  let savedBlobs

  beforeEach(() => { savedBlobs = [] })

  afterEach(() => {
    vi.restoreAllMocks()
    URL.createObjectURL = originalCreateObjectURL
    URL.revokeObjectURL = originalRevokeObjectURL
  })

  it('xuất đúng 2 file (BBXL Excel + Xác minh Word), điền đủ các dòng hàng cận date vào cả 2 mẫu', async () => {
    URL.createObjectURL = vi.fn((blob) => { savedBlobs.push(blob); return `blob:${savedBlobs.length}` })
    URL.revokeObjectURL = vi.fn()

    globalThis.fetch = vi.fn(async (url) => {
      const path = String(url).includes('.docx') ? XACMINH_PATH : BBXL_PATH
      const buf = readFileSync(path)
      return { ok: true, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) }
    })

    const rows = [
      { maHang: 'A01252', tenHang: 'Arimenus - Hộp 10 ống 1ml', soLo: '011225', hanDung: '2028-12-26', dvt: 'LO', soLuong: 660, maKho: '020101', quyCach: 'Hộp 10 ống' },
      { maHang: 'B01414', tenHang: 'BFS-Pipolfen - Hộp 10 lọ 4ml', soLo: '010224', hanDung: '2026-02-09', dvt: 'LO', soLuong: 119, maKho: '020110', quyCach: 'Hộp 10 lọ' },
    ]
    await exportExpiryDisposal(rows)

    expect(savedBlobs).toHaveLength(2)
    const [xlsxBlob, docxBlob] = savedBlobs
    expect(xlsxBlob.type).toContain('spreadsheetml')
    expect(docxBlob.type).toContain('wordprocessingml')

    const docxBuf = new Uint8Array(await docxBlob.arrayBuffer())
    const text = plainText(docXmlText(docxBuf))
    expect(text).toContain('A01252')
    expect(text).toContain('Arimenus - Hộp 10 ống 1ml')
    expect(text).toContain('B01414')
    expect(text).toContain('660')
    expect(text).toContain('119')
    expect(text).toContain('020101')
    expect(text).toContain('020110')
    // Bảng "Thành phần" 3 người cố định vẫn giữ nguyên, không bị đụng vào.
    expect(text).toContain('Phương Thu')
    expect(text).toContain('Dương Thị Ngọc Huyền')
    expect(text).toContain('Lưu Thị Thuỳ')
    // Phần chữ ký/xác nhận (Dược sĩ phụ trách chuyên môn, Kế toán, Kho vận, Quản lý chi nhánh) của mẫu
    // gốc phải còn nguyên — feature này chỉ điền ngày + bảng sản phẩm, không đụng gì tới phần này.
    expect(text).toContain('Đề xuất giải quyết của Dược sĩ phụ trách chuyên môn')
    expect(text).toContain('Xác nhận của Quản lý chi nhánh')

    // Mọi phần khác của file (style, font, ảnh, theme...) phải giữ nguyên byte-for-byte so với mẫu gốc —
    // feature này chỉ được phép sửa đúng 1 file bên trong zip (word/document.xml). Riêng
    // "[Content_Types].xml" bị chính docxtemplater/PizZip tự viết lại 1 byte vô hại (whitespace) mỗi lần
    // render — không liên quan gì tới code ở đây (đã kiểm chứng: xảy ra y hệt khi render 1 mẫu hoàn toàn
    // chưa đụng tới), và không ảnh hưởng hiển thị trong Word — nên loại khỏi phép so byte-for-byte.
    const originalZip = new PizZip(readFileSync(XACMINH_PATH))
    const filledZip = new PizZip(docxBuf)
    originalZip.file(/.*/).forEach(f => {
      if (f.name === 'word/document.xml' || f.name === '[Content_Types].xml') return
      expect(filledZip.file(f.name).asUint8Array(), `file không đổi: ${f.name}`).toEqual(f.asUint8Array())
    })
  })

  it('báo lỗi rõ ràng khi danh sách rỗng, không gọi mạng/tải file mẫu', async () => {
    globalThis.fetch = vi.fn()
    await expect(exportExpiryDisposal([])).rejects.toThrow(/không có dòng nào/i)
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })
})
