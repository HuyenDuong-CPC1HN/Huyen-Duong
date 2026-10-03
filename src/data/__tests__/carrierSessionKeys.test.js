import { describe, expect, it, vi } from 'vitest'

vi.mock('../../supabase', () => ({ supabase: null }))
const { mergeSessionKeyMap, applySessionKeys } = await import('../workspace')

describe('Giữ "phiên làm việc" của file đã tải qua reload', () => {
  it('ghi lại sessionKey theo từng file, xoá khi không còn file nào có phiên', () => {
    const weeks = [{ id: 'a', sessionKey: '2026-10-03T01:00:00Z' }, { id: 'b' }]
    const map = mergeSessionKeyMap({ other: { x: 'y' } }, 'carrier_weeks_unifiedTrial_donSO_spx', weeks)
    expect(map).toEqual({ other: { x: 'y' }, carrier_weeks_unifiedTrial_donSO_spx: { a: '2026-10-03T01:00:00Z' } })
    expect(mergeSessionKeyMap(map, 'carrier_weeks_unifiedTrial_donSO_spx', [{ id: 'b' }])).toEqual({ other: { x: 'y' } })
  })

  it('nạp lại từ máy chủ: gắn lại sessionKey đúng file, không đè phiên đã có', () => {
    const loaded = [{ id: 'a', rows: [1] }, { id: 'b', rows: [2] }, { id: 'c', sessionKey: 'cũ' }]
    const out = applySessionKeys(loaded, { a: 'S1', c: 'S2' })
    expect(out[0]).toEqual({ id: 'a', rows: [1], sessionKey: 'S1' })
    expect(out[1].sessionKey).toBeUndefined()
    expect(out[2].sessionKey).toBe('cũ')
  })
})
