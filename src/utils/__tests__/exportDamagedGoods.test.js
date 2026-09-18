import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import PizZip from 'pizzip'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fillBienBanXuLy, todayParts, exportDamagedGoodsXuLy, exportDamagedGoodsXacMinh, exportDamagedGoodsKhoAXuLy, exportDamagedGoodsKhoAXacMinh } from '../exportDamagedGoods'

const TPL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../../public/templates')
const XULY_C_PATH = `${TPL_DIR}/BIEN_BAN_XU_LY_HANG_LOI_KHO_C.xlsx`
const XULY_DTP_PATH = `${TPL_DIR}/BIEN_BAN_XU_LY_HANG_LOI_KHO_LGT.xlsx`
const XACMINH_C_PATH = `${TPL_DIR}/BIEN_BAN_XAC_MINH_HANG_LOI_KHO_C.docx`
const XACMINH_DTP_PATH = `${TPL_DIR}/BIEN_BAN_XAC_MINH_HANG_LOI_KHO_LGT.docx`
const XULY_CAN_DATE_PATH = `${TPL_DIR}/BIEN_BAN_XU_LY_CAN_DATE.xlsx`
const XACMINH_CAN_DATE_PATH = `${TPL_DIR}/BIEN_BAN_XAC_MINH_CAN_DATE.docx`

function loadBuffer(path) {
  const buf = readFileSync(path)
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
}

// hanDung ở đây CỐ TÌNH đã là dd/mm/yyyy (không phải ISO) — đúng thật với DamagedGoodsRecordForm.jsx, nơi
// "Hạn dùng" của Kho C/DTP là 1 ô <input> gõ tay tự do, không phải ngày ISO như hàng cận date/Kho A.
function makeItem(overrides = {}) {
  return {
    maHang: 'W00517', tenHang: 'Falgankid', soLo: '020126', hanDung: '15/01/2029',
    kho: '020102', dvt: 'ONG', soLuong: 60, quyCach: 'Hộp 20 ống',
    ghiChu: 'Hàng gãy, vỡ ống đổi cho Tân Thịnh (DP Linh Hà)',
    ...overrides,
  }
}

function sheetXmlOf(bytes) { return new PizZip(bytes).file('xl/worksheets/sheet1.xml').asText() }
function sharedStringsOf(bytes) { return new PizZip(bytes).file('xl/sharedStrings.xml').asText() }
function readCells(bytes) {
  const doc = new DOMParser().parseFromString(sheetXmlOf(bytes), 'application/xml')
  const sstDoc = new DOMParser().parseFromString(sharedStringsOf(bytes), 'application/xml')
  const sharedText = i => sstDoc.documentElement.getElementsByTagName('si')[i]?.textContent || ''
  return (row, col) => {
    const c = doc.querySelector(`c[r="${col}${row}"]`)
    if (!c) return null
    const v = c.querySelector('v')?.textContent
    if (v === undefined) return null
    return c.getAttribute('t') === 's' ? sharedText(Number(v)) : v
  }
}

describe('exportDamagedGoods — Biên bản Xử lý (Excel), riêng mẫu Kho C và Kho DTP', () => {
  it.each([
    ['Kho C', XULY_C_PATH],
    ['Kho DTP (UPHARMA)', XULY_DTP_PATH],
  ])('%s: giữ nguyên style/theme gốc, điền đúng 1 dòng sản phẩm (có cột Kho)', async (_label, path) => {
    const templateBuffer = loadBuffer(path)
    const original = new PizZip(templateBuffer.slice(0))
    const bytes = await fillBienBanXuLy(templateBuffer, [makeItem()])
    const filled = new PizZip(bytes)

    expect(filled.file('xl/theme/theme1.xml').asUint8Array()).toEqual(original.file('xl/theme/theme1.xml').asUint8Array())
    expect(filled.file('xl/styles.xml').asUint8Array()).toEqual(original.file('xl/styles.xml').asUint8Array())

    const cell = readCells(bytes)
    expect(cell(18, 'A')).toBe('1')
    expect(cell(18, 'B')).toBe('W00517')
    expect(cell(18, 'C')).toBe('Falgankid')
    expect(cell(18, 'D')).toBe('020126')
    expect(cell(18, 'E')).toBe('15/01/2029') // ghi thẳng nguyên văn ô nhập tay, không reformat (khác Kho A)
    expect(cell(18, 'F')).toBe('020102') // cột Kho — khác mẫu hàng cận date, phải đúng vị trí này
    expect(cell(18, 'G')).toBe('ONG')
    expect(cell(18, 'H')).toBe('60')
    expect(cell(18, 'I')).toBe('60')
    expect(cell(18, 'J')).toBe('Hộp 20 ống')
    expect(cell(18, 'K')).toBe('Hàng gãy, vỡ ống đổi cho Tân Thịnh (DP Linh Hà)')
  })

  it('điền ngày theo đúng định dạng riêng của mẫu này ("TP.Hồ Chí Minh, Ngày ... " — có dấu phẩy, chữ Ngày viết hoa)', async () => {
    const bytes = await fillBienBanXuLy(loadBuffer(XULY_C_PATH), [makeItem()])
    const cell = readCells(bytes)
    const { ngay, thang, nam } = todayParts()
    expect(cell(5, 'I')).toBe(`TP.Hồ Chí Minh, Ngày ${ngay} tháng ${thang} năm ${nam}`)
  })

  it('2 sản phẩm (thêm đúng 1 dòng) — không được để sót dữ liệu ví dụ gốc của mẫu (W00517/TH00893) ở dòng chân', async () => {
    // Cùng đúng kịch bản đã gây lỗi thật ở exportExpiryDisposal.js (dòng nhân bản "cướp" số dòng của dòng
    // chân) — kiểm tra lại cho chắc vì đây là bản sao logic của fix đó, áp cho bố cục cột khác (có Kho).
    const bytes = await fillBienBanXuLy(loadBuffer(XULY_DTP_PATH), [
      makeItem({ maHang: 'X00001', tenHang: 'San pham 1' }),
      makeItem({ maHang: 'X00002', tenHang: 'San pham 2' }),
    ])
    const cell = readCells(bytes)
    expect(cell(18, 'A')).toBe('1')
    expect(cell(18, 'B')).toBe('X00001')
    expect(cell(19, 'A')).toBe('2')
    expect(cell(19, 'B')).toBe('X00002')
    expect(cell(20, 'A')).toContain('Phương pháp xử lý')
    expect(cell(20, 'B')).toBeNull()
    expect(cell(21, 'B')).toBe('Xuất gửi nhà máy xử lý')
  })

  it('nhiều hơn 6 dòng (extra > 5) -> không đụng "r" với các dòng trống có sẵn phía sau mẫu (r=24..89) — cùng lỗi thật đã sửa ở exportExpiryDisposal.js, mẫu này dùng chung cấu trúc', async () => {
    const items = Array.from({ length: 21 }, (_, i) => makeItem({ maHang: `X${String(i).padStart(5, '0')}`, tenHang: `San pham ${i}` }))
    const bytes = await fillBienBanXuLy(loadBuffer(XULY_C_PATH), items)

    const sheetXml = sheetXmlOf(bytes)
    const rowNums = [...sheetXml.matchAll(/<row r="(\d+)"/g)].map(m => Number(m[1]))
    const seen = new Set()
    const duplicates = rowNums.filter(n => (seen.has(n) ? true : (seen.add(n), false)))
    expect(duplicates).toEqual([])

    const cell = readCells(bytes)
    expect(cell(18, 'A')).toBe('1')
    expect(cell(38, 'A')).toBe('21')
    expect(cell(39, 'A')).toContain('Phương pháp xử lý')
    expect(cell(40, 'B')).toBe('Xuất gửi nhà máy xử lý')
    expect(cell(42, 'A')).toBe('7. Các thành phần tham gia hủy (Ký và ghi rõ họ tên)')
  })
})

describe('exportDamagedGoods — Biên bản Xác minh (Word)', () => {
  const originalCreateObjectURL = URL.createObjectURL
  const originalRevokeObjectURL = URL.revokeObjectURL
  let savedBlobs

  beforeEach(() => { savedBlobs = [] })
  afterEach(() => {
    vi.restoreAllMocks()
    URL.createObjectURL = originalCreateObjectURL
    URL.revokeObjectURL = originalRevokeObjectURL
  })

  function stubDownloads() {
    URL.createObjectURL = vi.fn((blob) => { savedBlobs.push(blob); return `blob:${savedBlobs.length}` })
    URL.revokeObjectURL = vi.fn()
  }
  function stubFetch(xacMinhPath, xuLyPath) {
    globalThis.fetch = vi.fn(async (url) => {
      const path = String(url).includes('.docx') ? xacMinhPath : xuLyPath
      const buf = readFileSync(path)
      return { ok: true, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) }
    })
  }
  function docPlainText(blobBytes) {
    const xml = new PizZip(blobBytes).file('word/document.xml').asText()
    return xml.replace(/<w:tab\/>/g, '\t').replace(/<\/w:p>/g, '\n').replace(/<\/w:tr>/g, '\n').replace(/<\/w:tc>/g, ' | ').replace(/<[^>]+>/g, '')
  }

  it('Kho C dùng đúng mẫu CPC1HN, Kho DTP dùng đúng mẫu UPHARMA — không lẫn mẫu', async () => {
    stubDownloads()
    stubFetch(XACMINH_C_PATH, XULY_C_PATH)
    await exportDamagedGoodsXacMinh({ entity: 'khoC', processedAt: '2026-08-19T00:00:00.000Z', items: [makeItem()] })
    const textC = docPlainText(new Uint8Array(await savedBlobs[0].arrayBuffer()))
    expect(textC).toContain('CÔNG TY CỔ PHẦN DƯỢC PHẨM CPC1 HÀ NỘI')
    expect(textC).toContain('W00517')
    expect(textC).toContain('020102') // cột Kho
    expect(textC).toContain('Hàng gãy, vỡ ống đổi cho Tân Thịnh (DP Linh Hà)') // Tình trạng lấy đúng ghi chú thật, không phải chữ cố định

    stubFetch(XACMINH_DTP_PATH, XULY_DTP_PATH)
    await exportDamagedGoodsXacMinh({ entity: 'khoDTP', processedAt: '2026-08-19T00:00:00.000Z', items: [makeItem()] })
    const textDTP = docPlainText(new Uint8Array(await savedBlobs[1].arrayBuffer()))
    expect(textDTP).toContain('CÔNG TY CỔ PHẦN UPHARMA')
  })

  it('exportDamagedGoodsXuLy + Xác minh cùng báo lỗi rõ ràng khi chưa có mặt hàng nào', async () => {
    await expect(exportDamagedGoodsXuLy({ entity: 'khoC', items: [] })).rejects.toThrow(/chưa có mặt hàng/i)
    await expect(exportDamagedGoodsXacMinh({ entity: 'khoC', items: [] })).rejects.toThrow(/chưa có mặt hàng/i)
  })
})

describe('exportDamagedGoodsKhoAXuLy — dùng chung mẫu + hàm điền với hàng cận date (10 cột, không có cột Kho)', () => {
  afterEach(() => { vi.restoreAllMocks() })

  function stubFetchCanDateTemplate() {
    globalThis.fetch = vi.fn(async () => {
      const buf = readFileSync(XULY_CAN_DATE_PATH)
      return { ok: true, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) }
    })
  }

  it('điền đúng dữ liệu từ phiếu xuất kho vào bảng, "Địa điểm xử lý" cố định "Kho 020110", Ghi chú cố định "Hàng cận date"', async () => {
    stubFetchCanDateTemplate()
    const originalCreateObjectURL = URL.createObjectURL
    URL.createObjectURL = vi.fn(() => 'blob:1')
    URL.revokeObjectURL = vi.fn()

    let capturedBytes
    const originalClick = HTMLAnchorElement.prototype.click
    HTMLAnchorElement.prototype.click = vi.fn()
    try {
      const record = {
        entity: 'khoA',
        processedAt: '2026-08-29T00:00:00.000Z',
        items: [
          { maHang: 'C02161', tenHang: 'Combo Aricamun', soLo: '010', hanDung: '2026-08-26', dvt: 'BO', soLuong: 14, quyCach: '' },
        ],
      }
      await exportDamagedGoodsKhoAXuLy(record)
      const blobArg = URL.createObjectURL.mock.calls[0][0]
      capturedBytes = new Uint8Array(await blobArg.arrayBuffer())
    } finally {
      HTMLAnchorElement.prototype.click = originalClick
      URL.createObjectURL = originalCreateObjectURL
    }

    const cell = readCells(capturedBytes)
    expect(cell(18, 'B')).toBe('C02161')
    expect(cell(18, 'C')).toBe('Combo Aricamun')
    expect(cell(18, 'D')).toBe('010')
    expect(cell(18, 'E')).toBe('26/08/2026')
    expect(cell(18, 'F')).toBe('BO') // không có cột Kho ở mẫu này - F là ĐVT, khác exportDamagedGoodsXuLy (khoC/DTP)
    expect(cell(18, 'G')).toBe('14')
    expect(cell(18, 'H')).toBe('14')
    expect(cell(18, 'J')).toBe('Hàng cận date') // "Tình trạng cố định" — không lấy từ record, luôn cố định

    const sheetXml = sheetXmlOf(capturedBytes)
    const sstXml = sharedStringsOf(capturedBytes)
    expect(sstXml).toContain('Kho 020110')
    expect(sheetXml).toBeTruthy()
  })

  it('báo lỗi rõ ràng khi chưa có mặt hàng nào', async () => {
    await expect(exportDamagedGoodsKhoAXuLy({ entity: 'khoA', items: [] })).rejects.toThrow(/chưa có mặt hàng/i)
  })
})

describe('exportDamagedGoodsKhoAXacMinh — dùng chung mẫu Xác minh với hàng cận date (xác nhận qua 1 file ví dụ thật)', () => {
  const originalCreateObjectURL = URL.createObjectURL
  const originalRevokeObjectURL = URL.revokeObjectURL
  let savedBlobs

  beforeEach(() => { savedBlobs = [] })
  afterEach(() => {
    vi.restoreAllMocks()
    URL.createObjectURL = originalCreateObjectURL
    URL.revokeObjectURL = originalRevokeObjectURL
  })

  function stubDownloads() {
    URL.createObjectURL = vi.fn((blob) => { savedBlobs.push(blob); return `blob:${savedBlobs.length}` })
    URL.revokeObjectURL = vi.fn()
  }
  function stubFetchXacMinhCanDate() {
    globalThis.fetch = vi.fn(async () => {
      const buf = readFileSync(XACMINH_CAN_DATE_PATH)
      return { ok: true, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) }
    })
  }
  function docPlainText(blobBytes) {
    const xml = new PizZip(blobBytes).file('word/document.xml').asText()
    return xml.replace(/<w:tab\/>/g, '\t').replace(/<\/w:p>/g, '\n').replace(/<\/w:tr>/g, '\n').replace(/<\/w:tc>/g, ' | ').replace(/<[^>]+>/g, '')
  }

  it('điền đúng dữ liệu, cột "Kho" luôn "020110" (không có tiền tố "Kho"), "Tình trạng" cố định "Hàng cận date", "3. Địa điểm" giữ nguyên chữ có sẵn của mẫu ("Tại CN.Hồ Chí Minh")', async () => {
    stubDownloads()
    stubFetchXacMinhCanDate()
    const record = {
      entity: 'khoA',
      processedAt: '2026-08-29T00:00:00.000Z',
      items: [
        { maHang: 'C02161', tenHang: 'Combo Aricamun', soLo: '010', hanDung: '2026-08-26', dvt: 'BO', soLuong: 14, quyCach: '' },
      ],
    }
    await exportDamagedGoodsKhoAXacMinh(record)
    const text = docPlainText(new Uint8Array(await savedBlobs[0].arrayBuffer()))
    expect(text).toContain('3. Địa điểm: Tại CN.Hồ Chí Minh') // chữ cố định của mẫu, không đổi theo "Kho 020110"
    expect(text).toContain('C02161')
    expect(text).toContain('Combo Aricamun')
    expect(text).toContain('26/08/2026')
    expect(text).toMatch(/010\s*\|\s*26\/08\/2026\s*\|\s*020110/) // cột Kho ngay sau Hạn dùng, đúng giá trị "020110"
    expect(text).toContain('Hàng cận date') // Tình trạng cố định
  })

  it('báo lỗi rõ ràng khi chưa có mặt hàng nào', async () => {
    await expect(exportDamagedGoodsKhoAXacMinh({ entity: 'khoA', items: [] })).rejects.toThrow(/chưa có mặt hàng/i)
  })
})
