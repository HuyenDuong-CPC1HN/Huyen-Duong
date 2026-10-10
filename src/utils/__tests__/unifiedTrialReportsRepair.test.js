import { describe, expect, it, vi } from 'vitest'

const store = vi.hoisted(() => {
  const values = new Map()
  return { values, opsStore: { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, String(v)), removeItem: k => values.delete(k) } }
})
vi.mock('../../data/workspace', () => ({ opsStore: store.opsStore }))

const { repairChannelSnapshot, readTrialReports } = await import('../unifiedTrialReports')
const { unwrapSessionValue, computeChannelSnapshot } = await import('../unifiedTrialChannelStats')

describe('Lưu tuần Đơn truyền thống — ô nhập tay dạng { sessionKey, value }', () => {
  const ref = '2026-10-10T02:00:00.000Z'
  it('unwrapSessionValue lấy đúng giá trị của phiên; khác phiên / thiếu thì fallback', () => {
    expect(unwrapSessionValue({ sessionKey: ref, value: { bv: '10' } }, ref, {})).toEqual({ bv: '10' })
    expect(unwrapSessionValue({ sessionKey: 'khac', value: '5' }, ref, '')).toBe('')
    expect(unwrapSessionValue(null, ref, {})).toEqual({})
  })
  it('lưu với giá trị đã unwrap: số tổng là số thật, không còn NaN/null', () => {
    const snap = computeChannelSnapshot({
      data: [{ 'Mã kiện hàng': 'K1', 'Đối tác vận chuyển': 'Chành xe A' }], channelKey: 'donC',
      khValues: unwrapSessionValue({ sessionKey: ref, value: { bv: '10', nt: '6' } }, ref, {}),
      chuaGuiChanh: unwrapSessionValue({ sessionKey: ref, value: '3' }, ref, ''),
      showChanhXe: true, showSpx: false, referenceDate: ref,
    })
    expect(snap.khBreakdownSum).toBe(16)
    expect(snap.chanhXeBadge).toBe(4)
    expect(Number.isFinite(snap.total)).toBe(true)
  })
})

describe('repairChannelSnapshot — tuần đã lưu bằng bản lỗi', () => {
  const broken = JSON.parse(JSON.stringify({
    total: Number.NaN, trucTiepBadge: 334, trucTiepDelivered: 334, khBreakdownSum: 0,
    khValues: { sessionKey: 'x', value: { bv: '10', nt: '6', onl: '' } },
    chanhXeBadge: Number.NaN, chanhXeCount: 252, chuaGuiChanh: Number.NaN, doitacTotal: 19,
  }))
  it('dựng lại chưa giao theo khách hàng, Chành xe và Tổng đơn', () => {
    const r = repairChannelSnapshot(broken)
    expect(r.khValues).toEqual({ bv: '10', nt: '6', onl: '' })
    expect(r.khBreakdownSum).toBe(16)
    expect(r.trucTiepBadge).toBe(350)
    expect(r.chanhXeBadge).toBe(252)
    expect(r.total).toBe(350 + 252 + 19)
  })
  it('tuần lưu đúng thì giữ nguyên', () => {
    const ok = { total: 10, trucTiepBadge: 5, chanhXeBadge: 3, doitacTotal: 2, khValues: { bv: '1' }, khBreakdownSum: 1 }
    expect(repairChannelSnapshot(ok)).toBe(ok)
  })
  it('readTrialReports tự sửa khi đọc tuần Đơn truyền thống', () => {
    store.opsStore.setItem('unified_trial_reports_donTruyenThong', JSON.stringify([{ id: 'w', donC: broken, donDTP: { total: 660, trucTiepBadge: 600, chanhXeBadge: 0, doitacTotal: 60, khValues: {} } }]))
    const [w] = readTrialReports('donTruyenThong')
    expect(w.donC.total).toBe(621)
    expect(w.donDTP.total).toBe(660)
  })
})
