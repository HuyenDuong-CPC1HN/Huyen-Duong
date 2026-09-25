import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import UnifiedTrialTab from '../UnifiedTrialTab'

const store = vi.hoisted(() => {
  const values = new Map()
  return {
    values,
    opsStore: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => { values.set(key, String(value)) },
      removeItem: (key) => values.delete(key),
    },
  }
})

vi.mock('../../data/workspace', () => ({ opsStore: store.opsStore }))

afterEach(() => {
  cleanup()
  store.values.clear()
  vi.restoreAllMocks()
})

function seedDonSOReport(id, label) {
  const reports = JSON.parse(store.opsStore.getItem('unified_trial_reports_donSO') || '[]')
  reports.unshift({
    id, label, fileName: `${label}.xlsx`, createdAt: new Date().toISOString(),
    total: 100, tmdtCount: 60, ngoaiSanCount: 40, otherCount: 0, mismatchCount: 0,
    shops: [], spxWeekId: null, carrierLookup: {},
  })
  store.opsStore.setItem('unified_trial_reports_donSO', JSON.stringify(reports))
}

// Nút "Xoá báo cáo" mới thêm (cạnh nút sửa tên) — trước đây chỉ sửa được tên, không xoá được báo cáo đã
// lưu sai/thừa ra khỏi danh sách "Chọn tuần so sánh".
describe('UnifiedTrialTab — SavedWeekPicker: nút "Xoá báo cáo tuần này"', () => {
  it('bấm xoá + xác nhận -> báo cáo biến mất khỏi dropdown, các báo cáo khác không bị ảnh hưởng', async () => {
    seedDonSOReport('r-old', 'Tuần lỗi cần xoá')
    seedDonSOReport('r-keep', 'Tuần giữ lại')
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    render(<UnifiedTrialTab />)

    const select = await screen.findByRole('combobox')
    fireEvent.change(select, { target: { value: 'r-old' } })
    await screen.findByText('Tuần lỗi cần xoá.xlsx')

    fireEvent.click(screen.getByTitle('Xoá báo cáo tuần này'))
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('Tuần lỗi cần xoá'))

    await waitFor(() => {
      const options = [...select.querySelectorAll('option')].map(o => o.textContent)
      expect(options).not.toContain('Tuần lỗi cần xoá')
      expect(options).toContain('Tuần giữ lại')
    })

    const stored = JSON.parse(store.opsStore.getItem('unified_trial_reports_donSO'))
    expect(stored.map(r => r.id)).toEqual(['r-keep'])
  })

  it('bấm xoá nhưng huỷ xác nhận -> báo cáo vẫn còn nguyên', async () => {
    seedDonSOReport('r-old2', 'Tuần không muốn xoá')
    vi.spyOn(window, 'confirm').mockReturnValue(false)

    render(<UnifiedTrialTab />)

    const select = await screen.findByRole('combobox')
    fireEvent.change(select, { target: { value: 'r-old2' } })
    await screen.findByText('Tuần không muốn xoá.xlsx')

    fireEvent.click(screen.getByTitle('Xoá báo cáo tuần này'))

    const stored = JSON.parse(store.opsStore.getItem('unified_trial_reports_donSO'))
    expect(stored.map(r => r.id)).toEqual(['r-old2'])
  })
})
