import { describe, expect, it, vi } from 'vitest'

vi.mock('../../data/workspace', () => ({ opsStore: { getItem: () => null, setItem: () => {}, removeItem: () => {} } }))
const { belongsToSession, pickSessionWeek } = await import('../carrierUtils')

const SESSION = '2026-10-03T01:00:00.000Z' // lúc tải file Đơn của tuần đang làm

describe('Nhận file VTP/SPX thuộc tuần đang làm sau khi tải lại trang', () => {
  it('có sessionKey thì so đúng sessionKey', () => {
    expect(belongsToSession({ sessionKey: SESSION, uploadedAt: '2026-09-01T00:00:00Z' }, SESSION)).toBe(true)
    expect(belongsToSession({ sessionKey: 'khác', uploadedAt: '2026-10-04T00:00:00Z' }, SESSION)).toBe(false)
  })

  it('mất sessionKey (nạp lại từ máy chủ): file tải sau file Đơn tuần này thì thuộc tuần này, file tuần trước thì không', () => {
    expect(belongsToSession({ uploadedAt: '2026-10-03T01:05:00+00:00' }, SESSION)).toBe(true)
    expect(belongsToSession({ uploadedAt: '2026-09-27T08:00:00+00:00' }, SESSION)).toBe(false)
    expect(belongsToSession({ uploadedAt: '2026-10-03T01:05:00+00:00' }, null)).toBe(false)
  })

  it('pickSessionWeek: ưu tiên file có đúng sessionKey, không thì file mới nhất tải sau file Đơn', () => {
    const weeks = [
      { id: 'old', uploadedAt: '2026-09-27T08:00:00+00:00' },
      { id: 'a', uploadedAt: '2026-10-03T02:00:00+00:00' },
      { id: 'b', uploadedAt: '2026-10-03T03:00:00+00:00' },
    ]
    expect(pickSessionWeek(weeks, SESSION).id).toBe('b')
    expect(pickSessionWeek([...weeks, { id: 'tagged', sessionKey: SESSION, uploadedAt: '2026-10-03T01:30:00Z' }], SESSION).id).toBe('tagged')
    expect(pickSessionWeek([weeks[0]], SESSION)).toBeNull()
  })
})
