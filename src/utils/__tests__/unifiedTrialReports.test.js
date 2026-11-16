import { describe, expect, it } from 'vitest'
import { reportWeekDate, reportYm } from '../unifiedTrialReports'

describe('reportWeekDate / reportYm — xếp tuần đã lưu theo Năm > Tháng', () => {
  it('đọc khoảng ngày trong tên tuần, tuần vắt 2 tháng vào tháng có nhiều ngày hơn', () => {
    expect(reportYm({ label: 'Đơn SO - Tuần 07/11 - 13/11/2026' })).toBe('2026-11')
    expect(reportYm({ label: 'Đơn SO - Tuần 31/10 - 06/11/2026' })).toBe('2026-11')
    expect(reportYm({ label: 'Đơn SO - Tuần 26/09 - 02/10/2026' })).toBe('2026-09')
    expect(reportYm({ label: 'Tuần 12.09 - 18.09.2026' })).toBe('2026-09')
    expect(reportYm({ label: 'Tuần 29/12 - 04/01/2027' })).toBe('2027-01')
  })
  it('tên không có khoảng ngày thì lấy ngày upload', () => {
    expect(reportYm({ label: 'so.xlsx · 3/10/2026', id: '2026-10-03T08:00:00.000Z' })).toBe('2026-10')
    expect(reportWeekDate({ label: 'x' }).getTime()).toBe(0)
  })
})
