import { describe, expect, it } from 'vitest'
import { computeCarrierStats, isDonCHoldAsChoLay } from '../parseCarrierExport'

const row = (status) => ({ 'Mã Vận Đơn': `VD-${status}`, 'Mã đơn hàng': 'FB1', 'Trạng Thái': status, 'Ngày tạo': '02/10/2026 08:00:00' })
const rows = [row('Đang lấy hàng'), row('Đang vận chuyển'), row('Tồn - Lấy không thành công')]

describe('Đơn C: "Đang lấy hàng" tính vào Chờ lấy', () => {
  it('bật holdAsChoLay: Đang lấy hàng vào Chờ lấy, tổng không đổi', () => {
    const s = computeCarrierStats(rows, 'viettel', null, null, null, { holdAsChoLay: true })
    expect(s.choLay).toBe(2)
    expect(s.dangVanChuyen).toBe(1)
    expect(s.total).toBe(3)
  })

  it('không bật (tuần cũ / Đơn DTP chưa có file đối chiếu): giữ cách tính cũ', () => {
    const s = computeCarrierStats(rows, 'viettel')
    expect(s.choLay).toBe(1)
    expect(s.dangVanChuyen).toBe(2)
  })

  it('chỉ áp dụng cho Đơn C Viettel, file tải từ 28/09/2026', () => {
    expect(isDonCHoldAsChoLay('unifiedTrial_donC_viettel', 'viettel', '2026-10-03T01:00:00Z')).toBe(true)
    expect(isDonCHoldAsChoLay('donC_viettel', 'viettel', '2026-09-29T01:00:00Z')).toBe(true)
    expect(isDonCHoldAsChoLay('unifiedTrial_donC_viettel', 'viettel', '2026-09-20T01:00:00Z')).toBe(false)
    expect(isDonCHoldAsChoLay('unifiedTrial_donDTP_viettel', 'viettel', '2026-10-03T01:00:00Z')).toBe(false)
    expect(isDonCHoldAsChoLay('unifiedTrial_donC_spx', 'spx', '2026-10-03T01:00:00Z')).toBe(false)
  })
})
