import { describe, expect, it } from 'vitest'
import { huyReminders, missingHuyFields, newHuyPhieu, nextSoBienBan } from '../hangHuy'

const parsed = {
  kho: 'DTP', soPhieu: 'XK2621/00104', ngayPhieu: '2026-09-30', khoXuat: '020105', lyDo: 'Xuất hủy hàng lỗi',
  items: [
    { maHang: 'TH00893', tenHang: 'Progermila', dvt: 'Ống', soLuong: 100, soLo: '011225', hanDung: '2028-12-15' },
    { maHang: 'TH00899', tenHang: 'Golistin-enema', dvt: 'Lọ', soLuong: null, soLo: '13326G02', hanDung: '2031-07-11' },
  ],
}

describe('newHuyPhieu', () => {
  it('thực huỷ mặc định = SL phiếu (dòng không có SL để trống), quy cách + tình trạng để trống', () => {
    const p = newHuyPhieu(parsed, 'a.pdf', [], new Date('2026-09-30T09:00:00'))
    expect(p).toMatchObject({ kho: 'DTP', stage: 'todo', fileName: 'a.pdf' })
    expect(p.items.map(i => [i.thucHuy, i.quyCach, i.tinhTrang])).toEqual([[100, '', ''], [null, '', '']])
    expect(p.form).toMatchObject({ soBB: '1', ngayLap: '2026-09-30', xlGio: '08:30', diaDiem: 'Kho CN Hồ Chí Minh', phuongPhap: 'Xuất gửi nhà máy xử lý' })
  })

  it('số biên bản gợi ý = số lớn nhất trong năm + 1, dùng chung cho Kho C và Kho DTP; năm khác thì bắt đầu lại', () => {
    const c = newHuyPhieu({ ...parsed, kho: 'C' }, 'c.pdf', [], new Date('2026-09-30T09:00:00'))
    c.form.soBB = '12'
    const other = { form: { soBB: '30', ngayLap: '2025-12-31' } }
    expect(nextSoBienBan([c, other], 2026)).toBe('13')
    expect(newHuyPhieu(parsed, 'd.pdf', [c, other], new Date('2026-10-01T09:00:00')).form.soBB).toBe('13')
    expect(nextSoBienBan([c, other], 2027)).toBe('1')
  })
})

describe('missingHuyFields', () => {
  it('nhắc số quyết định, số lượng thực huỷ, quy cách, tình trạng còn trống', () => {
    const p = newHuyPhieu(parsed, 'a.pdf', [], new Date('2026-09-30T09:00:00'))
    expect(missingHuyFields(p)).toEqual(['số quyết định', 'ngày quyết định', 'số lượng thực huỷ', 'quy cách', 'tình trạng'])
    p.form.soQD = '05'; p.form.ngayQD = '2026-09-28'
    p.items = p.items.map(i => ({ ...i, thucHuy: 1, quyCach: 'Hộp', tinhTrang: 'Hàng vỡ' }))
    expect(missingHuyFields(p)).toEqual([])
  })
})

describe('huyReminders', () => {
  const now = new Date('2026-10-02T08:00:00')
  it('chưa làm/đang điền quá 1 ngày kể từ lúc tải; đã xuất chưa ký quá 3 ngày; đã ký thì không nhắc', () => {
    const list = huyReminders([
      { id: 'a', stage: 'todo', importedAt: '2026-10-01T07:00:00' },
      { id: 'b', stage: 'doing', importedAt: '2026-10-02T07:00:00' }, // chưa quá 1 ngày
      { id: 'c', stage: 'exported', exportedAt: '2026-09-28T08:00:00' },
      { id: 'd', stage: 'exported', exportedAt: '2026-10-01T08:00:00' }, // chưa quá 3 ngày
      { id: 'e', stage: 'done', importedAt: '2026-01-01T08:00:00' },
    ], now)
    expect(list.map(r => [r.slip.id, r.kind, r.days])).toEqual([['c', 'sign', 4], ['a', 'todo', 1]])
  })
})
