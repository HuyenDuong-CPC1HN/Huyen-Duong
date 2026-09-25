import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import PizZip from 'pizzip'
import { describe, expect, it } from 'vitest'
import { buildNhapLai, buildBatchXuatKho, buildBatchXuLy } from '../exportSwapReturn'
import { batchItems, exportState, itemsSignature, lotStatus, nhapLaiItems, normalizeDateText, resolveBatches, tinhTrangFromLyDo } from '../swapReturnBatch'

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
function readCell(bytes) {
  const zip = new PizZip(bytes)
  const sheet = new DOMParser().parseFromString(zip.file('xl/worksheets/sheet1.xml').asText(), 'application/xml')
  const sst = new DOMParser().parseFromString(zip.file('xl/sharedStrings.xml').asText(), 'application/xml')
  return (row, col) => {
    const c = sheet.querySelector(`c[r="${col}${row}"]`)
    const v = c?.querySelector('v')?.textContent
    if (v === undefined) return null
    return c.getAttribute('t') === 's' ? sst.documentElement.getElementsByTagName('si')[Number(v)].textContent : v
  }
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

describe('swapReturnBatch', () => {
  it('nhận cùng lô / khác lô / chưa đủ lô theo 2 số lô', () => {
    expect(lotStatus(SAME)).toBe('same')
    expect(lotStatus(DIFF)).toBe('diff')
    expect(lotStatus(item({ loDoi: ' ' }))).toBe('empty')
  })

  it('chưa có bộ nào: bộ đang gom là Bộ 01, đợt cũ chưa có batchNo thuộc bộ đang gom', () => {
    const records = [
      { id: 'a', entity: 'donC', date: '2026-09-24', customerName: 'KH A', items: [SAME] },
      { id: 'x', entity: 'donDTP', date: '2026-09-24', customerName: 'KH DTP', items: [SAME] },
    ]
    const { openBatch, signedBatches, recordsOf } = resolveBatches('donC', [], records)
    expect(openBatch).toMatchObject({ entity: 'donC', no: 1, signedAt: null })
    expect(signedBatches).toEqual([])
    expect(recordsOf(1).map(r => r.id)).toEqual(['a'])
  })

  it('bộ đã ký giữ đúng đợt của nó; đợt mới vào bộ kế tiếp; kế toán bộ mới theo bộ ký gần nhất', () => {
    const batches = [
      { id: 'donC_1', entity: 'donC', no: 1, accountant: 'Võ Thị Ly', exported: {}, signedAt: '2026-09-20T02:00:00Z' },
      { id: 'donC_2', entity: 'donC', no: 2, accountant: 'Trần Thị Ái Lâm', exported: {}, signedAt: '2026-09-23T02:00:00Z' },
    ]
    const records = [
      { id: 'a', entity: 'donC', batchNo: 1, date: '2026-09-18', customerName: 'KH A', items: [SAME] },
      { id: 'b', entity: 'donC', batchNo: 2, date: '2026-09-22', customerName: 'KH B', items: [DIFF] },
      { id: 'c', entity: 'donC', batchNo: 3, date: '2026-09-25', customerName: 'KH C', items: [SAME] },
    ]
    const { openBatch, signedBatches, recordsOf } = resolveBatches('donC', batches, records)
    expect(openBatch).toMatchObject({ no: 3, accountant: 'Trần Thị Ái Lâm', signedAt: null })
    expect(signedBatches.map(b => b.no)).toEqual([2, 1])
    expect(recordsOf(1).map(r => r.id)).toEqual(['a'])
    expect(recordsOf(3).map(r => r.id)).toEqual(['c'])
    expect(batchItems(recordsOf(2))).toEqual([{ ...DIFF, customerName: 'KH B', date: '2026-09-22' }])
  })

  it('xuất xong mà bộ thay đổi (thêm/sửa mặt hàng) thì báo cần xuất lại', () => {
    const items = batchItems([{ customerName: 'KH', date: '2026-09-25', items: [SAME] }])
    const batch = { exported: { xuLy: { at: 'x', signature: itemsSignature(items) } } }
    expect(exportState(batch, 'xuLy', items)).toBe('ok')
    expect(exportState(batch, 'xuatKho', items)).toBe('none')
    expect(exportState(batch, 'xuLy', [...items, DIFF])).toBe('stale')
    expect(exportState(batch, 'xuLy', [{ ...items[0], soLuong: '3' }])).toBe('stale')
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

  it.each([
    ['Hàng rách, móp vỏ đổi cho DP PLT (DU262/050203)', 'Hàng rách, móp vỏ'],
    ['Lọ chảy dịch, đổi cho Nhà thuốc Phương (XU262/323881)', 'Lọ chảy dịch'],
    ['Gãy ống - Đổi cho KH Tân Thịnh', 'Gãy ống'],
    ['Lỗi vòi xịt', 'Lỗi vòi xịt'],
    ['Khách đổi mẫu mới', 'Khách đổi mẫu mới'],
    ['Đổi cho KH A', ''],
    ['', ''],
  ])('Tình trạng lấy phần Lý do trước "đổi cho": "%s" -> "%s"', (lyDo, expected) => {
    expect(tinhTrangFromLyDo(lyDo)).toBe(expected)
  })

  it('BB nhập lại kho chỉ lấy dòng khác lô', () => {
    expect(nhapLaiItems({ items: [SAME, DIFF] })).toEqual([DIFF])
  })
})

describe('exportSwapReturn — bộ xuất huỷ', () => {
  it.each([
    ['donC', 'BIEN_BAN_XU_LY_HANG_LOI_KHO_C.xlsx', '020101'],
    ['donDTP', 'BIEN_BAN_XU_LY_HANG_LOI_KHO_LGT.xlsx', '020105'],
  ])('%s: BB Xử lý thay tên kế toán gõ cứng, lấy lô hàng lỗi, cột Kho đúng theo đơn, ghi đúng ngày truyền vào', async (entity, template, expectedKho) => {
    const bytes = await buildBatchXuLy(loadBuffer(template), [SAME, DIFF], 'Võ Thị Ly', { entity, date: new Date(2026, 8, 23) })
    expect(readCell(bytes)(5, 'I')).toBe('TP.Hồ Chí Minh, Ngày 23 tháng 09 năm 2026')
    const sst = sharedStrings(bytes)
    expect(sst).toContain('Võ Thị Ly')
    expect(sst).not.toContain('Lưu Thị Thùy')
    expect(sst).toContain('010526')
    expect(sst).not.toContain('020626')
    expect(sst).toContain('Lọ chảy dịch')
    const cell = readCell(bytes)
    expect(cell(18, 'D')).toBe('011225')
    expect(cell(19, 'D')).toBe('010526')
    expect(cell(18, 'F')).toBe(expectedKho)
    expect(cell(19, 'F')).toBe(expectedKho)
  })

  it.each([
    ['donC', 'BIEN_BAN_XAC_MINH_HANG_LOI_KHO_C.docx', 'CPC1 HÀ NỘI'],
    ['donDTP', 'BIEN_BAN_XAC_MINH_HANG_LOI_KHO_LGT.docx', 'UPHARMA'],
  ])('%s: BB xác minh xuất kho có đủ dòng, STT, kế toán đã chọn', async (entity, template, company) => {
    const text = await docText(buildBatchXuatKho(loadBuffer(template), [SAME, DIFF], 'Trần Thị Ái Lâm', { entity, date: new Date(2026, 8, 27) }))
    expect(text).toContain(company)
    expect(text).toContain('Trần Thị Ái Lâm')
    expect(text).not.toContain('Lưu Thị Thuỳ')
    expect(text).toContain('ngày 27 tháng 09 năm 2026')
    expect(text).toContain('Ý kiến: Xuất xử lý')
    expect(text).toMatch(/1 \| TH00893 \| Progermila Sol 5ml \| 011225 \| 12\/05\/2028/)
    expect(text).toMatch(/2 \| TH03426 \| Golistin - soda Sol 45ml \| 010526 \| 26\/05\/2029/)
    expect(text).not.toContain('undefined')
  })

  it.each([
    'BIEN_BAN_XAC_MINH_HANG_LOI_KHO_C.docx',
    'BIEN_BAN_XAC_MINH_HANG_LOI_KHO_LGT.docx',
  ])('%s: mọi ô của dòng hàng đều có đường kẻ dưới (dòng cuối bảng không bị hở đáy)', (template) => {
    const xml = new PizZip(loadBuffer(template)).file('word/document.xml').asText()
    const loopAt = xml.indexOf('{#items}')
    const row = xml.slice(xml.lastIndexOf('<w:tr ', loopAt), xml.indexOf('</w:tr>', loopAt))
    expect(row).not.toContain('<w:bottom w:val="nil"/>')
  })

  it.each([
    ['donC', 'BIEN_BAN_XAC_MINH_HANG_LOI_KHO_C.docx', '020101'],
    ['donDTP', 'BIEN_BAN_XAC_MINH_HANG_LOI_KHO_LGT.docx', '020105'],
  ])('%s: cột Kho mặc định %s, Tình trạng lấy theo Lý do đã nhập', async (entity, template, kho) => {
    const text = await docText(buildBatchXuatKho(loadBuffer(template), [SAME, item({ lyDo: 'Gãy ống do vận chuyển' })], 'Võ Thị Ly', { entity }))
    expect(text).toContain(`1 | TH00893 | Progermila Sol 5ml | 011225 | 12/05/2028 | ${kho} | LỌ | 2 | Hộp 1 lọ | Lọ chảy dịch |`)
    expect(text).toContain(`2 | TH03426 | Golistin - soda Sol 45ml | 010526 | 26/05/2029 | ${kho} | LỌ | 2 | Hộp 1 lọ | Gãy ống do vận chuyển |`)
  })
})

describe('exportSwapReturn — BB xác minh nhập lại kho', () => {
  it.each([
    ['donC', 'BIEN_BAN_XAC_MINH_CPC1HN.docx', 'CPC1 HÀ NỘI'],
    ['donDTP', 'BIEN_BAN_XAC_MINH_UPHARMA.docx', 'UPHARMA'],
  ])('%s: đúng mẫu pháp nhân, chỉ dòng khác lô, địa điểm "Tại CN. Hồ Chí Minh"', async (entity, template, company) => {
    const record = { entity, date: '2026-09-23', customerName: 'Nhà thuốc An Phúc', accountantNhapLai: 'Lưu Thị Thuỳ', items: [SAME, item({ lyDo: 'Lọ chảy dịch đổi cho Nhà thuốc An Phúc (XU262/1)' })] }
    const text = await docText(buildNhapLai(loadBuffer(template), record))
    expect(text).toContain(company)
    expect(text).toContain('Hàng trả về của Nhà thuốc An Phúc')
    expect(text).toContain('ngày 23 tháng 09 năm 2026')
    expect(text).toContain('3. Địa điểm: Tại CN. Hồ Chí Minh')
    expect(text).not.toContain('Tại Tại')
    expect(text).toContain('Ý kiến: Nhập lại vào kho')
    expect(text).toContain('1 | Golistin - soda Sol 45ml | 010526 | 26/05/2029 | LỌ | 2 | Hộp 1 lọ | Lọ chảy dịch |')
    expect(text).not.toContain('XU262/1')
    expect(text).not.toContain('Progermila')
    expect(text).not.toContain('undefined')
    expect(text).not.toContain('Hàng nguyên vẹn')
  })

  it('đợt không có hàng khác lô thì báo lỗi, không xuất', () => {
    const record = { entity: 'donC', date: '2026-09-23', customerName: 'KH', items: [SAME] }
    expect(() => buildNhapLai(loadBuffer('BIEN_BAN_XAC_MINH_CPC1HN.docx'), record)).toThrow('không có hàng khác lô')
  })
})
