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

function seedDonTruyenThong(rows) {
  store.opsStore.setItem('unified_trial_donTT_rows', JSON.stringify(rows))
  store.opsStore.setItem('unified_trial_donTT_meta', JSON.stringify({ fileName: 'tt.xlsx', uploadedAt: new Date().toISOString() }))
}

// Ô tick "Tính cả đơn lệch kho" mới thêm cạnh nút "Nhân sự kho HCM" — đơn LỆCH kho (chỉ 1 trong 2
// Bốc hàng/Đóng hàng khớp danh sách) mặc định bị loại khỏi thống kê, chỉ hiện cảnh báo; tick ô này để
// gộp các đơn đó vào tổng. Đơn KHÔNG THUỘC kho HCM (cả 2 đều không khớp) luôn luôn bị loại, không có
// tuỳ chọn bật/tắt cho nhóm này.
describe('UnifiedTrialTab — ô tick "Tính cả đơn lệch kho"', () => {
  it('mặc định tắt (chưa có cờ lưu) để giữ hành vi cũ — đơn lệch kho không tính', () => {
    render(<UnifiedTrialTab />)
    expect(screen.getByRole('checkbox', { name: 'Tính cả đơn lệch kho' })).not.toBeChecked()
  })

  it('tick -> lưu cờ bật; load lại vẫn giữ trạng thái đã bật', () => {
    const { unmount } = render(<UnifiedTrialTab />)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Tính cả đơn lệch kho' }))
    expect(JSON.parse(store.opsStore.getItem('unified_trial_hcm_count_mismatch'))).toBe(true)
    unmount()

    render(<UnifiedTrialTab />)
    expect(screen.getByRole('checkbox', { name: 'Tính cả đơn lệch kho' })).toBeChecked()
  })

  it('đơn không thuộc kho HCM luôn bị loại; đơn lệch kho chỉ được tính khi tick', async () => {
    store.opsStore.setItem('unified_trial_hcm_staff_roster', JSON.stringify('Nguyen Van A (0900000001)'))
    seedDonTruyenThong([
      { 'Mã kiện hàng': 'K1', 'Người tạo kiện': 'NV1', 'Bốc hàng': 'Nguyen Van A (0900000001)', 'Đóng hàng': 'Nguyen Van A (0900000001)' }, // kho HCM
      { 'Mã kiện hàng': 'K2', 'Người tạo kiện': 'NV1', 'Bốc hàng': 'Nguyen Van A (0900000001)', 'Đóng hàng': 'Someone Else (0900000002)' }, // lệch kho
      { 'Mã kiện hàng': 'K3', 'Người tạo kiện': 'NV1', 'Bốc hàng': 'X (0900000003)', 'Đóng hàng': 'Y (0900000004)' }, // không thuộc kho HCM
    ])

    render(<UnifiedTrialTab />)
    fireEvent.click(screen.getByRole('button', { name: 'Đơn truyền thống' }))

    expect(await screen.findByRole('button', { name: 'Đơn C (1)' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('checkbox', { name: 'Tính cả đơn lệch kho' }))
    expect(await screen.findByRole('button', { name: 'Đơn C (2)' })).toBeInTheDocument()
  })
})
