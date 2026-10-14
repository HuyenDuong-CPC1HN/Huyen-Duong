import { describe, expect, it, vi } from 'vitest'
import fixtures from './fixtures/returnSlipPdfLines.json'

const lines = vi.hoisted(() => ({ value: [] }))
vi.mock('../returnSlipPdf', () => ({ extractPdfLines: vi.fn(async () => lines.value) }))
const { readReturnPdf } = await import('../flowV2Pdf')
const { applyParsedReturn, caseReturnSlip, newCase, newItem } = await import('../flowV2')

describe('Hàng trả & huỷ — đọc biên bản trả hàng nội bộ in từ website', () => {
  it('lấy Bên C, lý do, đơn giá từ file; Bên A / B website để trống thì giữ mặc định kế toán + thủ kho', async () => {
    lines.value = fixtures.bbth_noibo
    const parsed = await readReturnPdf(new ArrayBuffer(0))
    expect(parsed.traHang.pdf.mau).toBe('NOIBO')
    expect(parsed.traHang.pdf.benC).toEqual({ daiDien: 'Nguyễn Hồng Nhung', chucVu: 'Nhân viên kinh doanh ETC' })
    expect(parsed.traHang.pdf.lyDo).toMatch(/^Bộ phận kinh doanh, kế toán và kho/)
    expect(parsed.traHang.form).toMatchObject({ benA: 'Lưu Thị Thuỳ', benB: 'Dương Thị Ngọc Huyền' })
    expect(parsed.items[0].donGia).toBeGreaterThan(0)
  })

  it('hồ sơ cũ: gắn kết quả đọc file, giữ số hoá đơn kho đã điền, điền đơn giá còn trống', async () => {
    lines.value = fixtures.bbth_noibo
    const parsed = await readReturnPdf(new ArrayBuffer(0))
    const c = newCase({ kind: 'tra', sub: 'tuChoi', kho: 'C', khachHang: 'Vạn Phúc City', items: [newItem({ tenHang: 'Zencombi', soLuong: 100 })] })
    c.traHang.form.soHD = '00038621'
    const next = applyParsedReturn(c, parsed)
    expect(next.khachHang).toBe('Vạn Phúc City')
    expect(next.traHang.form.soHD).toBe('00038621')
    expect(next.traHang.pdf.benC.daiDien).toBe('Nguyễn Hồng Nhung')
    expect(next.items[0].donGia).toBe(parsed.items[0].donGia)
    expect(caseReturnSlip(next).pdf.benC.daiDien).toBe('Nguyễn Hồng Nhung')
  })
})
