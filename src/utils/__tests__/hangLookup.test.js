import { describe, expect, it } from 'vitest'
import { filterLookup, lookupRows, summarizeLookup } from '../hangLookup'

const slips = [
  { id: 's1', maPhieu: 'DHC1', khachHang: 'Khách A', createdAt: '2026-09-29T08:00:00', stage: 'acct', form: { items: [{ soLo: '010526' }] }, pdf: { mau: 'CPC1HN', items: [{ ten: 'Actiso Viet', dvt: 'ONG', soLuong: 40, thanhTien: 215000 }] } },
  { id: 's2', maPhieu: 'DHC2', khachHang: 'Khách B', createdAt: '2026-08-12T08:00:00', stage: 'done', form: { items: [{ soLo: '010526' }, { soLo: '010924' }] }, pdf: { mau: 'UPHARMA', items: [{ ten: 'Actiso Viet', dvt: 'ONG', soLuong: 10 }, { ten: 'Tranfast', dvt: 'GOI', soLuong: 100 }] } },
  { id: 's3', maPhieu: 'DHC3', khachHang: 'Chưa có file', createdAt: '2026-09-01T08:00:00', stage: 'wait' },
]
const phieus = [
  { id: 'h1', kho: 'C', soPhieu: 'XT1', ngayPhieu: '2026-09-30', lyDo: 'Hàng lỗi', stage: 'doing', items: [{ maHang: 'W00520', tenHang: 'Falgankid', dvt: 'ONG', soLuong: 60, thucHuy: 55, soLo: '020126', tinhTrang: 'Gãy ống' }] },
]

describe('lookupRows', () => {
  it('nhập trả lại: mỗi dòng hàng 1 hàng, bỏ phiếu chưa có file, lô lấy từ form, kho theo mẫu', () => {
    const r = lookupRows('tra', { slips })
    expect(r).toHaveLength(3)
    expect(r.map(x => [x.ten, x.soLo, x.kho, x.soLuong])).toEqual([['Actiso Viet', '010526', 'C', 40], ['Actiso Viet', '010526', 'DTP', 10], ['Tranfast', '010924', 'DTP', 100]])
  })
  it('hàng huỷ: lấy số lượng thực huỷ, mã hàng, tình trạng', () => {
    expect(lookupRows('huy', { phieus })[0]).toMatchObject({ ma: 'W00520', soLuong: 55, extra: 'Gãy ống', so: 'XT1', kho: 'C' })
  })
})

describe('filterLookup / summarizeLookup', () => {
  const rows = lookupRows('tra', { slips })
  it('tìm không dấu theo tên/lô/khách, lọc kho, tháng, trạng thái', () => {
    expect(filterLookup(rows, { q: 'actiso' })).toHaveLength(2)
    expect(filterLookup(rows, { q: '010924' })).toHaveLength(1)
    expect(filterLookup(rows, { q: 'khach b' })).toHaveLength(2)
    expect(filterLookup(rows, { kho: 'C' })).toHaveLength(1)
    expect(filterLookup(rows, { month: '2026-08' })).toHaveLength(2)
    expect(filterLookup(rows, { stage: 'acct' })).toHaveLength(1)
    expect(filterLookup(rows, { stage: 'done', q: 'tranfast' })).toHaveLength(1)
  })
  it('tổng hợp cộng số lượng theo hàng + lô', () => {
    const s = summarizeLookup(rows)
    expect(s.map(e => [e.ten, e.soLo, e.soLuong, e.phieu.size])).toEqual([['Tranfast', '010924', 100, 1], ['Actiso Viet', '010526', 50, 2]])
  })
})
