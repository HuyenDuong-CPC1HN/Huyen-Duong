import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import PizZip from 'pizzip'
import { describe, expect, it } from 'vitest'
import { fillBienBanXuLy, todayParts } from '../exportExpiryDisposal'

const TEMPLATE_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '../../../public/templates/BIEN_BAN_XU_LY_CAN_DATE.xlsx')

function loadTemplateBuffer() {
  const buf = readFileSync(TEMPLATE_PATH)
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
}

function makeRow(overrides = {}) {
  return {
    maHang: 'A01252',
    tenHang: 'Arimenus - Hộp 10 ống 1ml',
    soLo: '011225',
    hanDung: '2028-12-26',
    dvt: 'LO',
    soLuong: 660,
    maKho: '020101',
    quyCach: 'Hộp 10 ống',
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

describe('exportExpiryDisposal — Biên bản Xử lý (Excel)', () => {
  it('giữ nguyên file mẫu (logo/theme/style gốc) — không sửa/xoá gì ngoài nội dung cần điền', async () => {
    const templateBuffer = loadTemplateBuffer()
    const original = new PizZip(templateBuffer.slice(0))
    const bytes = await fillBienBanXuLy(templateBuffer, [makeRow()])
    const filled = new PizZip(bytes)

    const untouched = ['xl/theme/theme1.xml', 'xl/styles.xml']
    untouched.forEach(path => {
      expect(filled.file(path).asUint8Array()).toEqual(original.file(path).asUint8Array())
    })
  })

  it('trường thật rỗng (vd Quy cách — báo cáo tồn kho không có cột này) phải xoá trắng ô, không được giữ lại chữ ví dụ có sẵn trong mẫu (B01414/"Hộp 10 lọ"...)', async () => {
    const templateBuffer = loadTemplateBuffer()
    const bytes = await fillBienBanXuLy(templateBuffer, [makeRow({ quyCach: undefined })])
    const cell = readCells(bytes)

    expect(cell(18, 'A')).toBe('1')
    expect(cell(18, 'B')).toBe('A01252')
    expect(cell(18, 'I')).toBeNull() // Quy cách: trống thật, không phải "Hộp 10 lọ" của mẫu gốc
    // Đảm bảo không còn dấu vết nào của dữ liệu ví dụ gốc (B01414) sót lại trên dòng này.
    expect(cell(18, 'B')).not.toBe('B01414')
  })

  it('điền đúng 1 dòng sản phẩm vào bảng, số lượng "Theo chứng từ" và "Thực huỷ" cùng lấy từ Tồn cuối', async () => {
    const templateBuffer = loadTemplateBuffer()
    const bytes = await fillBienBanXuLy(templateBuffer, [makeRow()])
    const cell = readCells(bytes)

    expect(cell(18, 'A')).toBe('1')
    expect(cell(18, 'B')).toBe('A01252')
    expect(cell(18, 'C')).toBe('Arimenus - Hộp 10 ống 1ml')
    expect(cell(18, 'D')).toBe('011225')
    expect(cell(18, 'E')).toBe('26/12/2028')
    expect(cell(18, 'F')).toBe('LO')
    expect(cell(18, 'G')).toBe('660')
    expect(cell(18, 'H')).toBe('660')
    expect(cell(18, 'I')).toBe('Hộp 10 ống')
    expect(cell(18, 'J')).toBe('Hàng cận date')
  })

  it('điền ngày xử lý theo ngày hôm nay, không đụng "Số:" và "Căn cứ" (để anh tự điền tay)', async () => {
    const templateBuffer = loadTemplateBuffer()
    const bytes = await fillBienBanXuLy(templateBuffer, [makeRow()])
    const cell = readCells(bytes)
    const { ngay, thang, nam } = todayParts()

    expect(cell(5, 'H')).toBe(`TP.Hồ Chí Minh ngày ${ngay} tháng ${thang} năm ${nam}`)
    expect(cell(13, 'A')).toBe(`2. Thời gian xử lý: Vào lúc 08h30’, ngày ${ngay} tháng ${thang} năm ${nam}`)
    expect(cell(14, 'A')).toBe('3. Địa điểmxử lý: Kho CN Hồ Chí Minh')
    expect(cell(4, 'A')).toBe('Số: …../2025/BC-CPC1HN')
    expect(cell(7, 'A')).toContain('Quyết định số')
  })

  it('đúng 2 dòng sản phẩm (thêm đúng 1 dòng) -> dòng chân "5. Phương pháp xử lý:" phải còn nguyên, không bị dòng thêm "cướp" số dòng và bỏ sót ghi đè', async () => {
    // Kịch bản đúng như lỗi thật gặp phải: 2 sản phẩm -> ensureDataRows chỉ cần nhân bản ĐÚNG 1 dòng.
    // Bug cũ: dòng vừa nhân bản tạm thời trùng r="19" với dòng chân gốc, khiến querySelector ở bước dời
    // chân "bắt nhầm" dòng vừa nhân bản thay vì dòng chân thật — dòng sản phẩm thứ 2 (đáng lẽ ở r=19) bị
    // fillDataRows ghi đè NHẦM vào dòng chân "5. Phương pháp xử lý:", còn dòng nhân bản (giữ nguyên dữ liệu
    // ví dụ B01414 gốc) lại bị đẩy xuống chiếm chỗ dòng chân — tái hiện đúng ảnh lỗi anh gửi.
    const templateBuffer = loadTemplateBuffer()
    const rows = [
      makeRow({ maHang: 'T03774', tenHang: 'BFS-Atracu - Hộp 10 ống 5ml', soLo: '010924', quyCach: undefined }),
      makeRow({ maHang: 'X99999', tenHang: 'Hang thu hai that', soLo: 'LOT2', quyCach: undefined }),
    ]
    const bytes = await fillBienBanXuLy(templateBuffer, rows)
    const cell = readCells(bytes)

    expect(cell(18, 'A')).toBe('1')
    expect(cell(18, 'B')).toBe('T03774')
    expect(cell(19, 'A')).toBe('2')
    expect(cell(19, 'B')).toBe('X99999')
    expect(cell(19, 'C')).toBe('Hang thu hai that')
    // Dòng chân "5. Phương pháp xử lý:" phải dời đúng xuống dòng 20, còn nguyên nhãn — không bị dòng sản
    // phẩm thứ 2 hay dòng ví dụ gốc (B01414) đè lên/chiếm chỗ.
    expect(cell(20, 'A')).toContain('Phương pháp xử lý')
    expect(cell(20, 'B')).toBeNull()
    expect(cell(21, 'A')).toBe('-')
    expect(cell(21, 'B')).toBe('Xuất xử lý')
    // Không dòng nào trong bảng còn sót dữ liệu ví dụ gốc của mẫu.
    for (const row of [18, 19, 20, 21]) expect(cell(row, 'B')).not.toBe('B01414')
  })

  it('nhiều dòng sản phẩm -> tự thêm dòng (nhân bản style dòng mẫu) và dời chân ký tên xuống đúng số dòng thêm', async () => {
    const templateBuffer = loadTemplateBuffer()
    // Cố tình KHÔNG dùng "B01414" (mã có sẵn trong dữ liệu ví dụ gốc của mẫu ở dòng 18) cho bất kỳ dòng
    // nào — nếu lỡ dùng trùng, 1 dòng bị bỏ sót (bug đã gặp thật: dòng nhân bản bị "đánh cắp" số dòng bởi
    // bước dời chân, không được fillDataRows ghi đè) sẽ VẪN hiện đúng "B01414" một cách tình cờ, che mất
    // lỗi thay vì bắt được nó — đây chính là lý do bug trước không bị test này phát hiện ra.
    const rows = [
      makeRow({ maHang: 'A01252', soLo: 'LOT1' }),
      makeRow({ maHang: 'T03774', soLo: 'LOT2' }),
      makeRow({ maHang: 'C01000', soLo: 'LOT3' }),
    ]
    const bytes = await fillBienBanXuLy(templateBuffer, rows)
    const cell = readCells(bytes)
    const doc = new DOMParser().parseFromString(sheetXmlOf(bytes), 'application/xml')

    expect(cell(18, 'A')).toBe('1')
    expect(cell(18, 'B')).toBe('A01252')
    expect(cell(19, 'A')).toBe('2')
    expect(cell(19, 'B')).toBe('T03774')
    expect(cell(19, 'I')).toBe('Hộp 10 ống') // Quy cách dòng nhân bản = đúng dữ liệu thật, không phải "Hộp 10 lọ" của mẫu gốc
    expect(cell(20, 'A')).toBe('3')
    expect(cell(20, 'B')).toBe('C01000')

    // Chân ký tên gốc ở dòng 23, thêm 2 dòng (3 sản phẩm - 1 dòng mẫu sẵn) -> dời xuống dòng 25.
    expect(doc.querySelector('mergeCell[ref="A25:I25"]')).toBeTruthy()
    expect(doc.querySelector('mergeCell[ref="A23:I23"]')).toBeNull()
    expect(doc.querySelector('dimension').getAttribute('ref')).toBe('A1:J91')
  })

  it('1 dòng duy nhất thì không đụng gì tới bố cục chân ký tên gốc của mẫu', async () => {
    const templateBuffer = loadTemplateBuffer()
    const bytes = await fillBienBanXuLy(templateBuffer, [makeRow()])
    const doc = new DOMParser().parseFromString(sheetXmlOf(bytes), 'application/xml')
    expect(doc.querySelector('mergeCell[ref="A23:I23"]')).toBeTruthy()
    expect(doc.querySelector('dimension').getAttribute('ref')).toBe('A1:J89')
  })
})
