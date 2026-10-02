import { describe, expect, it } from 'vitest'
import { filterLookup, lookupRows, sameLot, stageLabel, summarizeLookup } from '../hangLookup'

const slips = [
  { id: 's1', maPhieu: 'DHC1', khachHang: 'Khách A', createdAt: '2026-09-29T08:00:00', stage: 'acct', form: { items: [{ soLo: '010526' }] }, pdf: { mau: 'CPC1HN', items: [{ ten: 'Actiso Viet', dvt: 'ONG', soLuong: 40 }] } },
  { id: 's2', maPhieu: 'DHC2', khachHang: 'Khách B', createdAt: '2026-08-12T08:00:00', stage: 'done', form: { items: [{ soLo: '010526' }] }, pdf: { mau: 'UPHARMA', items: [{ ten: 'Actiso Viet', dvt: 'ONG', soLuong: 10 }] } },
  { id: 's3', maPhieu: 'DHC3', khachHang: 'Chưa có file', createdAt: '2026-09-01T08:00:00', stage: 'wait' },
]
const swapRecords = [
  { id: 'r1', flow: 'v2', entity: 'donC', date: '2026-09-30', customerName: 'Nhà thuốc An', items: [{ maHang: 'L00784', tenHang: 'Laci-eye', loLoi: '010526', dvt: 'ONG', soLuong: '6', lyDo: 'Rách vỏ' }], nhapLaiSignedAt: 'x', nhapLaiDoneAt: 'x', huyBatchId: 'b1' },
  { id: 'r2', flow: 'v2', entity: 'donDTP', date: '2026-10-01', customerName: 'Nhà thuốc B', items: [{ maHang: 'X', tenHang: 'Hàng X', loLoi: 'L9', dvt: 'Lọ', soLuong: '2' }], nhapLaiSignedAt: null },
  { id: 'r3', flow: 'v2', entity: 'donC', date: '2026-10-02', customerName: 'Nhà thuốc C', items: [{ maHang: 'Y', tenHang: 'Hàng Y', loLoi: 'L8', dvt: 'Lọ', soLuong: '1' }], nhapLaiSignedAt: 'x', nhapLaiDoneAt: 'x' },
  { id: 'old', entity: 'donC', date: '2026-09-01', customerName: 'Cũ', items: [{ tenHang: 'Cũ', loLoi: '1' }], batchNo: 1 },
]
const swapBatches = [{ id: 'b1', entity: 'donC', no: 1, soPhieuXuat: 'XT2621/00837', accountedAt: null }]
const phieus = [{ id: 'h1', kho: 'C', soPhieu: 'XT2621/00837', ngayPhieu: '2026-09-30', lyDo: 'Hàng lỗi', stage: 'doing',
  items: [{ maHang: 'L00784', tenHang: 'Laci-eye', dvt: 'ONG', soLuong: 6, soLo: '010526', tinhTrang: 'Rách vỏ' }, { maHang: 'W1', tenHang: 'Falgankid', dvt: 'ONG', soLuong: 60, thucHuy: 55, soLo: '020126', tinhTrang: 'Gãy' }] }]

describe('lookupRows', () => {
  const rows = lookupRows({ slips, phieus, swapRecords, swapBatches })
  it('3 nguồn: nhập trả lại (bỏ phiếu chưa có file), đổi trả quy trình mới (bỏ đợt cũ), hàng huỷ; hướng xử lý theo nguồn', () => {
    expect(rows.filter(r => r.nguon === 'tra').map(r => [r.huong, r.kho, r.soLo])).toEqual([['nhap', 'C', '010526'], ['nhap', 'DTP', '010526']])
    expect(rows.filter(r => r.nguon === 'doitra').map(r => r.ten)).toEqual(['Laci-eye', 'Hàng X', 'Hàng Y'])
    expect(rows.some(r => r.ten === 'Cũ')).toBe(false)
    expect(rows.find(r => r.ten === 'Falgankid')).toMatchObject({ nguon: 'kho', huong: 'huy', soLuong: 55, extra: 'Gãy' })
  })
  it('hàng khách trả lỗi đã xuất huỷ chỉ hiện 1 dòng: dòng trùng (cùng phiếu xuất huỷ + hàng + lô) trong Hàng huỷ bị ẩn, dòng khác vẫn hiện', () => {
    expect(rows.filter(r => r.ten === 'Laci-eye')).toHaveLength(1)
    expect(rows.find(r => r.ten === 'Laci-eye')).toMatchObject({ nguon: 'doitra', huyPhieu: 'XT2621/00837', so: 'XT2621/00837' })
    expect(rows.filter(r => r.nguon === 'kho')).toHaveLength(1)
  })
  it('trạng thái: chờ ký → đang làm; ký chưa hoàn thành → chờ nhập; hoàn thành chưa gom → chờ gom huỷ; đã gom chưa hoàn thành → chờ xuất', () => {
    const st = Object.fromEntries(rows.filter(r => r.nguon === 'doitra').map(r => [r.ten, stageLabel(r)]))
    expect(st).toEqual({ 'Laci-eye': 'Chờ xuất', 'Hàng X': 'Đang làm / chờ ký', 'Hàng Y': 'Chờ gom huỷ' })
    expect(rows.find(r => r.nguon === 'tra' && r.so === 'DHC1').stage).toBe('nhap') // nhập trả lại ký xong, chờ kế toán nhập
    expect(stageLabel(rows.find(r => r.so === 'DHC2'))).toBe('Hoàn thành')
  })
})

describe('filterLookup / summarizeLookup / sameLot', () => {
  const rows = lookupRows({ slips, phieus, swapRecords, swapBatches })
  it('lọc kho, nguồn, hướng xử lý, tháng, trạng thái; tìm không dấu kể cả số phiếu xuất huỷ', () => {
    expect(filterLookup(rows, { nguon: 'doitra' })).toHaveLength(3)
    expect(filterLookup(rows, { huong: 'nhap' })).toHaveLength(2)
    expect(filterLookup(rows, { kho: 'DTP' }).map(r => r.ten).sort()).toEqual(['Actiso Viet', 'Hàng X'])
    expect(filterLookup(rows, { month: '2026-08' })).toHaveLength(1)
    expect(filterLookup(rows, { stage: 'wait' }).map(r => r.ten).sort()).toEqual(['Actiso Viet', 'Hàng Y', 'Laci-eye'].sort())
    expect(filterLookup(rows, { q: 'xt2621/00837' }).length).toBeGreaterThan(0)
    expect(filterLookup(rows, { q: 'khach b' })).toHaveLength(1)
  })
  it('tổng hợp cộng số lượng theo hàng + lô; sameLot nối các phiếu cùng hàng và lô, theo ngày', () => {
    const s = summarizeLookup(rows)
    expect(s.find(e => e.ten === 'Actiso Viet')).toMatchObject({ soLuong: 50 })
    const lot = sameLot(rows, rows.find(r => r.ten === 'Laci-eye'))
    expect(lot).toHaveLength(1)
    expect(sameLot(rows, { ten: 'x', soLo: '' })).toEqual([])
    expect(sameLot(rows, rows.find(r => r.so === 'DHC1')).map(r => r.so)).toEqual(['DHC2', 'DHC1'])
  })
})
