import { beforeEach, describe, expect, it } from 'vitest'
import { clearLoginDay, loginExpired, markLoginToday } from '../dailyLogin'

describe('dailyLogin', () => {
  beforeEach(() => window.localStorage.clear())
  it('chưa ghi ngày → hết hạn; đăng nhập hôm nay → còn hạn; sang ngày hôm sau → hết hạn', () => {
    expect(loginExpired(new Date('2026-10-02T09:00:00'))).toBe(true)
    markLoginToday(new Date('2026-10-02T09:00:00'))
    expect(loginExpired(new Date('2026-10-02T23:59:00'))).toBe(false)
    expect(loginExpired(new Date('2026-10-03T00:01:00'))).toBe(true)
    clearLoginDay()
    expect(loginExpired(new Date('2026-10-02T09:00:00'))).toBe(true)
  })
})
