import { describe, expect, it } from 'vitest'
import { partnerType } from '../partnerType'
import { deliveryBucket } from '../deliveryDays'
import { computeChannelSnapshot } from '../unifiedTrialChannelStats'

const C = { tanThinh: true }

describe('Đối tác vận chuyển Tân Thịnh', () => {
  it('tính là Giao hàng trực tiếp, luôn ≤ 24 giờ dù giao trễ mấy ngày', () => {
    const row = { 'Mã kiện hàng': 'K1', 'Đối tác vận chuyển': 'Tân Thịnh', 'Ngày tạo kiện': '05/10/2026', 'Ngày giao hàng': '09/10/2026' }
    expect(partnerType(row, C)).toBe('tructiep')
    expect(partnerType({ 'Đối tác vận chuyển': 'CÔNG TY TAN THINH', 'Ngày tạo kiện': '06/10/2026 09:00' }, C)).toBe('tructiep')
    expect(deliveryBucket(row, C)).toBe('24')
  })
  it('chỉ áp từ tuần 05/10/2026: đơn tuần trước vẫn tính Chành xe như cũ', () => {
    const old = { 'Đối tác vận chuyển': 'Tân Thịnh', 'Ngày tạo kiện': '04/10/2026', 'Ngày giao hàng': '07/10/2026' }
    expect(partnerType(old, C)).toBe('chanhxe')
    expect(deliveryBucket(old, C)).toBe('72')
  })
  it('đối tác khác vẫn như cũ', () => {
    expect(partnerType({ 'Đối tác vận chuyển': 'Chành xe Phương Trang' })).toBe('chanhxe')
    expect(deliveryBucket({ 'Đối tác vận chuyển': 'Giao trực tiếp', 'Ngày tạo kiện': '01/10/2026', 'Ngày giao hàng': '04/10/2026' })).toBe('72')
  })
  it('Đơn C: đơn Tân Thịnh vào nhóm Giao trực tiếp, không vào Chành xe', () => {
    const snap = computeChannelSnapshot({
      data: [{ 'Mã kiện hàng': 'K1', 'Đối tác vận chuyển': 'Tân Thịnh', 'Ngày tạo kiện': '06/10/2026', 'Ngày giao hàng': '08/10/2026' }],
      channelKey: 'donC', khValues: {}, chuaGuiChanh: '', showChanhXe: true, showSpx: false, referenceDate: null,
    })
    expect(snap.trucTiepStats['24h']).toBe(1)
    expect(snap.chanhXeCount).toBe(0)
  })
  it('Đơn DTP không áp quy tắc này: giữ nguyên như cũ', () => {
    const row = { 'Mã kiện hàng': 'K1', 'Đối tác vận chuyển': 'Tân Thịnh', 'Ngày tạo kiện': '06/10/2026', 'Ngày giao hàng': '09/10/2026' }
    expect(partnerType(row)).toBe('chanhxe')
    expect(deliveryBucket(row)).toBe('72')
    const snap = computeChannelSnapshot({ data: [row], channelKey: 'donDTP', khValues: {}, chuaGuiChanh: '', showChanhXe: false, showSpx: true, referenceDate: null })
    expect(snap.trucTiepStats['24h']).toBe(0)
  })
})
