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

function seedMismatchData() {
  store.opsStore.setItem('unified_trial_hcm_staff_roster', JSON.stringify('Nguyen Van A (0900000001)'))
  seedDonTruyenThong([
    { 'Mã kiện hàng': 'K1', 'Người tạo kiện': 'NV1', 'Bốc hàng': 'Nguyen Van A (0900000001)', 'Đóng hàng': 'Nguyen Van A (0900000001)' }, // kho HCM
    { 'Mã kiện hàng': 'K2', 'Người tạo kiện': 'NV1', 'Bốc hàng': 'Nguyen Van A (0900000001)', 'Đóng hàng': 'Someone Else (0900000002)' }, // lệch kho
    { 'Mã kiện hàng': 'K3', 'Người tạo kiện': 'NV1', 'Bốc hàng': 'X (0900000003)', 'Đóng hàng': 'Y (0900000004)' }, // không thuộc kho HCM
  ])
}

// Ô tick "Tính cả đơn lệch kho" nằm NGAY TRONG khung cảnh báo "đơn lệch kho/không thuộc kho HCM" (đặt
// cạnh "Nhân sự kho HCM" ở header trước đây theo yêu cầu người dùng, nay dời vào đúng ngữ cảnh — chỉ
// hiện khi có đơn lệch kho/không thuộc kho HCM thật sự). Đơn LỆCH kho (chỉ 1 trong 2 Bốc hàng/Đóng hàng
// khớp danh sách) mặc định bị loại khỏi thống kê, chỉ hiện cảnh báo; tick ô này để gộp vào tổng. Đơn
// KHÔNG THUỘC kho HCM (cả 2 đều không khớp) luôn luôn bị loại, không có tuỳ chọn bật/tắt cho nhóm này.
describe('UnifiedTrialTab — ô tick "Tính cả đơn lệch kho" (trong khung cảnh báo)', () => {
  it('chưa có đơn lệch/không thuộc kho HCM -> không hiện khung cảnh báo lẫn ô tick', () => {
    render(<UnifiedTrialTab />)
    expect(screen.queryByRole('checkbox', { name: 'Tính cả đơn lệch kho' })).not.toBeInTheDocument()
  })

  it('mặc định tắt (chưa có cờ lưu) để giữ hành vi cũ — đơn lệch kho không tính', async () => {
    seedMismatchData()
    render(<UnifiedTrialTab />)
    fireEvent.click(screen.getByRole('button', { name: 'Đơn truyền thống' }))
    expect(await screen.findByRole('checkbox', { name: 'Tính cả đơn lệch kho' })).not.toBeChecked()
  })

  it('tick -> lưu cờ bật; load lại vẫn giữ trạng thái đã bật', async () => {
    seedMismatchData()
    const { unmount } = render(<UnifiedTrialTab />)
    fireEvent.click(screen.getByRole('button', { name: 'Đơn truyền thống' }))
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Tính cả đơn lệch kho' }))
    expect(JSON.parse(store.opsStore.getItem('unified_trial_hcm_count_mismatch'))).toBe(true)
    unmount()

    render(<UnifiedTrialTab />)
    fireEvent.click(screen.getByRole('button', { name: 'Đơn truyền thống' }))
    expect(await screen.findByRole('checkbox', { name: 'Tính cả đơn lệch kho' })).toBeChecked()
  })

  it('đơn không thuộc kho HCM luôn bị loại; đơn lệch kho chỉ được tính khi tick', async () => {
    seedMismatchData()

    render(<UnifiedTrialTab />)
    fireEvent.click(screen.getByRole('button', { name: 'Đơn truyền thống' }))

    expect(await screen.findByRole('button', { name: 'Đơn C (1)' })).toBeInTheDocument()

    fireEvent.click(await screen.findByRole('checkbox', { name: 'Tính cả đơn lệch kho' }))
    expect(await screen.findByRole('button', { name: 'Đơn C (2)' })).toBeInTheDocument()
  })
})

// Tuần Đơn SO đã lưu phải giữ được Mốc 1 (Sales order lấy từ file Đơn SO) — nếu không, mở lại tuần đã lưu
// thì mọi đơn SPX đều "không khớp Mã đơn" và mục D) Phân tích đơn giao trễ hạn 48h biến mất.
describe('UnifiedTrialTab — tuần Đơn SO đã lưu vẫn có mục D) Phân tích đơn giao trễ hạn 48h', () => {
  it('Mốc 1 lấy từ autoSalesLookup đã chốt trong báo cáo tuần', async () => {
    store.opsStore.setItem('carrier_weeks_unifiedTrial_donSO_spx', JSON.stringify([{
      id: 'spx-w1', fileName: 'spx.xlsx', uploadedAt: '2026-10-03T01:00:00.000Z',
      rows: [{
        'Mã vận đơn': 'SPXVN1', 'Mã khách hàng': 'ORD1', 'Trạng thái hiện tại': 'Đã giao hàng',
        'Thời gian lấy hàng/gửi hàng': '2026-09-28 12:00', 'Thời gian giao hàng': '2026-10-01 10:00',
        'Tỉnh nhận': 'Thành phố Hồ Chí Minh', 'Tỉnh gửi': 'Thành phố Hồ Chí Minh', 'Phường/Xã nhận': 'Phường Bến Thành',
      }],
    }]))
    store.opsStore.setItem('unified_trial_reports_donSO', JSON.stringify([{
      id: 'r-week', label: 'Tuần 28/09', fileName: 'so.xlsx', createdAt: new Date().toISOString(),
      total: 1, tmdtCount: 0, ngoaiSanCount: 1, otherCount: 0, mismatchCount: 0,
      shops: [], spxWeekId: 'spx-w1', carrierLookup: {},
      autoSalesLookup: { SPXVN1: new Date(2026, 8, 28, 10, 0).toISOString() },
    }]))

    render(<UnifiedTrialTab />)
    fireEvent.change(await screen.findByRole('combobox'), { target: { value: 'r-week' } })
    expect(await screen.findByText('D) Phân tích đơn giao trễ hạn 48h')).toBeInTheDocument()
    expect(screen.getByText(/1 đơn giao quá 48h\. Trong đó có/)).toBeInTheDocument()
  })
})

describe('UnifiedTrialTab — file SPX của tuần đã lưu không bị dọn mất, mất thì tải lại gắn đúng tuần', () => {
  it('tải file vào tuần đã lưu đang thiếu file -> gắn vào báo cáo, không xoá file của tuần đã lưu khác', async () => {
    const XLSX = await import('xlsx')
    const many = Array.from({ length: 9 }, (_, i) => ({ id: `extra-${i}`, fileName: `x${i}.xlsx`, uploadedAt: `2026-09-0${i + 1}T00:00:00.000Z`, rows: [] }))
    store.opsStore.setItem('carrier_weeks_unifiedTrial_donSO_spx', JSON.stringify([
      ...many,
      { id: 'kept-week', fileName: 'tuan-khac.xlsx', uploadedAt: '2026-08-01T00:00:00.000Z', rows: [] },
    ]))
    store.opsStore.setItem('unified_trial_reports_donSO', JSON.stringify([
      { id: 'r-missing', label: 'Tuần 19/09', fileName: 'so-19.xlsx', createdAt: new Date().toISOString(), total: 1, tmdtCount: 0, ngoaiSanCount: 1, otherCount: 0, mismatchCount: 0, shops: [], spxWeekId: 'da-bi-xoa', carrierLookup: {} },
      { id: 'r-other', label: 'Tuần khác', fileName: 'so-khac.xlsx', createdAt: new Date().toISOString(), total: 1, tmdtCount: 0, ngoaiSanCount: 1, otherCount: 0, mismatchCount: 0, shops: [], spxWeekId: 'kept-week', carrierLookup: {} },
    ]))

    render(<UnifiedTrialTab />)
    fireEvent.change(await screen.findByRole('combobox'), { target: { value: 'r-missing' } })
    expect(await screen.findByText(/đã gắn với tuần này không còn trên hệ thống/)).toBeInTheDocument()

    const ws = XLSX.utils.aoa_to_sheet([['Mã vận đơn', 'Mã khách hàng', 'Trạng thái hiện tại'], ['SPXVN9', 'ORD9', 'Đã giao hàng']])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
    const file = new File([XLSX.write(wb, { type: 'array', bookType: 'xlsx' })], 'spx-19-25.xlsx')
    fireEvent.change(document.querySelector('input[type="file"]'), { target: { files: [file] } })

    await waitFor(() => {
      const report = JSON.parse(store.opsStore.getItem('unified_trial_reports_donSO')).find(r => r.id === 'r-missing')
      expect(report.spxWeekId).not.toBe('da-bi-xoa')
      const weeks = JSON.parse(store.opsStore.getItem('carrier_weeks_unifiedTrial_donSO_spx'))
      expect(weeks.some(w => w.id === report.spxWeekId)).toBe(true)
      expect(weeks.some(w => w.id === 'kept-week')).toBe(true) // file của tuần đã lưu khác vẫn còn
    })
    expect(await screen.findByText('spx-19-25.xlsx')).toBeInTheDocument()
  })
})
