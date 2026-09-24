import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import PizZip from 'pizzip'
import { describe, expect, it } from 'vitest'
import { buildNhapLai, buildWeeklyXuatKho, buildWeeklyXuLy } from '../exportSwapReturn'
import { isoWeekNumber, lotStatus, mondayOf, nhapLaiItems, normalizeDateText, weeklyItems } from '../swapReturnWeek'

const TPL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../../public/templates')
function loadBuffer(name) {
  const buf = readFileSync(`${TPL_DIR}/${name}`)
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
}
async function docText(blob) {
  const xml = new PizZip(new Uint8Array(await blob.arrayBuffer())).file('word/document.xml').asText()
  return xml.replace(/<\/w:p>/g, ' ').replace(/<\/w:tc>/g, ' | ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ')
}
function sharedStrings(bytes) {
  return new PizZip(bytes).file('xl/sharedStrings.xml').asText()
}

function item(overrides = {}) {
  return {
    maHang: 'TH03426', tenHang: 'Golistin - soda Sol 45ml', loLoi: '010526', loDoi: '020626',
    hanDungLoi: '26/05/2029', hanDungDoi: '15/08/2029', dvt: 'LỌ', soLuong: '2', quyCach: 'Hộp 1 lọ', lyDo: 'Lọ chảy dịch',
    ...overrides,
  }
}
const SAME = item({ maHang: 'TH00893', tenHang: 'Progermila Sol 5ml', loLoi: '011225', loDoi: '011225', hanDungLoi: '12/05/2028', hanDungDoi: '12/05/2028' })
const DIFF = item()

describe('swapReturnWeek', () => {
  it('nhận cùng lô / khác lô / chưa đủ lô theo 2 số lô', () => {
    expect(lotStatus(SAME)).toBe('same')
    expect(lotStatus(DIFF)).toBe('diff')
    expect(lotStatus(item({ loDoi: ' ' }))).toBe('empty')
  })

  it('tuần tính từ Thứ 2 đến Chủ nhật, số tuần theo ISO', () => {
    expect(mondayOf('2026-09-24')).toBe('2026-09-21')
    expect(mondayOf('2026-09-27')).toBe('2026-09-21')
    expect(mondayOf('2026-09-28')).toBe('2026-09-28')
    expect(isoWeekNumber('2026-09-21')).toBe(39)
    expect(isoWeekNumber('2026-01-01')).toBe(1)
  })

  it('bộ cuối tuần gom mọi mặt hàng trong tuần (cả cùng lô lẫn khác lô), bỏ đợt ngoài tuần', () => {
    const records = [
      { id: 'a', date: '2026-09-22', customerName: 'KH A', items: [SAME] },
      { id: 'b', date: '2026-09-27', customerName: 'KH B', items: [DIFF, item({ loDoi: '' })] },
      { id: 'c', date: '2026-09-28', customerName: 'KH C', items: [SAME] },
    ]
    const items = weeklyItems(records, '2026-09-21')
    expect(items.map(i => i.customerName)).toEqual(['KH A', 'KH B', 'KH B'])
  })

  it.each([
    ['26/05/2029', '26/05/2029'],
    ['26-5-2029', '26/05/2029'],
    ['26.05.29', '26/05/2029'],
    ['2029-05-26', '26/05/2029'],
    ['26052029', '26/05/2029'],
    ['26/05/2029 00:00:00', '26/05/2029'],
    ['5/26/2029', '26/05/2029'],
    ['  11/6/2029\t', '11/06/2029'],
    ['31/02/2029', '31/02/2029'],
    ['abc', 'abc'],
    ['', ''],
  ])('chuẩn hoá hạn dùng dán/gõ: "%s" -> "%s"', (input, expected) => {
    expect(normalizeDateText(input)).toBe(expected)
  })

  it('BB nhập lại kho chỉ lấy dòng khác lô', () => {
    expect(nhapLaiItems({ items: [SAME, DIFF] })).toEqual([DIFF])
  })
})

describe('exportSwapReturn — bộ xuất huỷ cuối tuần', () => {
  it.each([
    ['Đơn C', 'BIEN_BAN_XU_LY_HANG_LOI_KHO_C.xlsx'],
    ['Đơn DTP', 'BIEN_BAN_XU_LY_HANG_LOI_KHO_LGT.xlsx'],
  ])('%s: BB Xử lý thay tên kế toán gõ cứng bằng kế toán đã chọn, lấy lô hàng lỗi', async (_label, template) => {
    const bytes = await buildWeeklyXuLy(loadBuffer(template), [SAME, DIFF], 'Võ Thị Ly')
    const sst = sharedStrings(bytes)
    expect(sst).toContain('Võ Thị Ly')
    expect(sst).not.toContain('Lưu Thị Thùy')
    expect(sst).toContain('010526')
    expect(sst).not.toContain('020626')
    expect(sst).toContain('Lọ chảy dịch')
  })

  it.each([
    ['Đơn C', 'BIEN_BAN_XAC_MINH_HANG_LOI_KHO_C.docx', 'CPC1 HÀ NỘI'],
    ['Đơn DTP', 'BIEN_BAN_XAC_MINH_HANG_LOI_KHO_LGT.docx', 'UPHARMA'],
  ])('%s: BB xác minh xuất kho có đủ dòng, STT, kế toán đã chọn, Tình trạng để trống', async (_label, template, company) => {
    const text = await docText(buildWeeklyXuatKho(loadBuffer(template), [SAME, DIFF], 'Trần Thị Ái Lâm', new Date(2026, 8, 27)))
    expect(text).toContain(company)
    expect(text).toContain('Trần Thị Ái Lâm')
    expect(text).not.toContain('Lưu Thị Thuỳ')
    expect(text).toContain('ngày 27 tháng 09 năm 2026')
    expect(text).toContain('Ý kiến: Xuất xử lý')
    expect(text).toMatch(/1 \| TH00893 \| Progermila Sol 5ml \| 011225 \| 12\/05\/2028/)
    expect(text).toMatch(/2 \| TH03426 \| Golistin - soda Sol 45ml \| 010526 \| 26\/05\/2029/)
    expect(text).not.toContain('undefined')
  })
})

describe('exportSwapReturn — BB xác minh nhập lại kho', () => {
  it.each([
    ['donC', 'BIEN_BAN_XAC_MINH_CPC1HN.docx', 'CPC1 HÀ NỘI'],
    ['donDTP', 'BIEN_BAN_XAC_MINH_UPHARMA.docx', 'UPHARMA'],
  ])('%s: đúng mẫu pháp nhân, chỉ dòng khác lô, địa điểm "Tại CN. Hồ Chí Minh"', async (entity, template, company) => {
    const record = { entity, date: '2026-09-23', customerName: 'Nhà thuốc An Phúc', accountantNhapLai: 'Lưu Thị Thuỳ', items: [SAME, DIFF] }
    const text = await docText(buildNhapLai(loadBuffer(template), record))
    expect(text).toContain(company)
    expect(text).toContain('Hàng trả về của Nhà thuốc An Phúc')
    expect(text).toContain('ngày 23 tháng 09 năm 2026')
    expect(text).toContain('3. Địa điểm: Tại CN. Hồ Chí Minh')
    expect(text).not.toContain('Tại Tại')
    expect(text).toContain('Ý kiến: Nhập lại vào kho')
    expect(text).toMatch(/1 \| Golistin - soda Sol 45ml \| 010526 \| 26\/05\/2029/)
    expect(text).not.toContain('Progermila')
    expect(text).not.toContain('undefined')
    expect(text).not.toContain('Hàng nguyên vẹn')
  })

  it('đợt không có hàng khác lô thì báo lỗi, không xuất', () => {
    const record = { entity: 'donC', date: '2026-09-23', customerName: 'KH', items: [SAME] }
    expect(() => buildNhapLai(loadBuffer('BIEN_BAN_XAC_MINH_CPC1HN.docx'), record)).toThrow('không có hàng khác lô')
  })
})
