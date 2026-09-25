import { describe, expect, it, vi } from 'vitest'

const carrierMocks = vi.hoisted(() => ({
  getCarrierFileTotal: vi.fn(),
  pickCarrierWeekIdByDate: vi.fn(() => null),
  snapshotCarrierLookup: vi.fn(() => ({})),
}))
vi.mock('../../components/carrierUtils', () => carrierMocks)

const { computeChannelSnapshot } = await import('../unifiedTrialChannelStats')

function viettelRow(maKienHang) {
  return { 'Mã kiện hàng': maKienHang, 'Đối tác vận chuyển': 'VIETTEL' }
}

// Bug thật: computeChannelSnapshot (dùng cho KPI "Tổng đơn"/"Đối tác VC" ở tab Gộp kênh) tính viettelCount
// qua getCarrierFileTotal — hàm này vốn tự "khớp theo ngày gần nhất" (closestByDate), CHƯA có cơ chế
// liveSessionKey như CarrierPanel đã sửa. Chuyển qua lại giữa 2 pill Đơn C/Đơn DTP (hoặc tuần mới chưa
// upload VTP nào) sẽ khiến KPI header hiện nhầm số VTP của kênh/tuần KHÁC, trong khi khung chi tiết bên
// dưới (CarrierPanel, đã sửa đúng) lại trống đúng — 2 chỗ lệch nhau, gây hiểu nhầm mất dữ liệu.
describe('computeChannelSnapshot — viettelCount/spxCount phải theo đúng phiên làm việc (requireSessionKey)', () => {
  it('gọi getCarrierFileTotal với requireSessionKey=true cho cả Viettel và SPX', () => {
    carrierMocks.getCarrierFileTotal.mockReturnValue(null)
    computeChannelSnapshot({
      data: [viettelRow('K1')], channelKey: 'donC', khValues: {}, chuaGuiChanh: '',
      showChanhXe: true, showSpx: true, referenceDate: '2026-09-21T08:00:00.000Z',
    })
    expect(carrierMocks.getCarrierFileTotal).toHaveBeenCalledWith(
      'unifiedTrial_donC_viettel', 'viettel', expect.any(Array), '2026-09-21T08:00:00.000Z', true,
    )
    expect(carrierMocks.getCarrierFileTotal).toHaveBeenCalledWith(
      'unifiedTrial_donC_spx', 'spx', expect.any(Array), '2026-09-21T08:00:00.000Z', true,
    )
  })

  it('chưa upload VTP trong đúng phiên này (getCarrierFileTotal trả về null) -> viettelCount đếm theo dòng thô trong file, KHÔNG hiện nhầm số tuần/kênh khác', () => {
    carrierMocks.getCarrierFileTotal.mockReturnValue(null)
    const result = computeChannelSnapshot({
      data: [viettelRow('K1'), viettelRow('K2'), viettelRow('K3')], channelKey: 'donC', khValues: {}, chuaGuiChanh: '',
      showChanhXe: true, showSpx: false, referenceDate: '2026-09-21T08:00:00.000Z',
    })
    expect(result.viettelCount).toBe(3)
  })

  it('đã có file VTP khớp đúng phiên (getCarrierFileTotal trả về total) -> dùng đúng total đó', () => {
    carrierMocks.getCarrierFileTotal.mockReturnValue({ total: 18, stats: { '24h': 10 } })
    const result = computeChannelSnapshot({
      data: [viettelRow('K1')], channelKey: 'donC', khValues: {}, chuaGuiChanh: '',
      showChanhXe: true, showSpx: false, referenceDate: '2026-09-21T08:00:00.000Z',
    })
    expect(result.viettelCount).toBe(18)
  })
})
