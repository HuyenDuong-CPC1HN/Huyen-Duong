import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const store = vi.hoisted(() => {
  const values = new Map()
  return {
    values,
    opsStore: {
      getItem: key => values.get(key) ?? null,
      setItem: (key, value) => { values.set(key, String(value)) },
      removeItem: key => { values.delete(key) },
    },
  }
})
vi.mock('../../data/workspace', () => ({ opsStore: store.opsStore }))

const exportMocks = vi.hoisted(() => ({
  exportSwapWeeklyXuLy: vi.fn().mockResolvedValue(undefined),
  exportSwapWeeklyXuatKho: vi.fn().mockResolvedValue(undefined),
  exportSwapNhapLai: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../../utils/exportSwapReturn', () => exportMocks)

const { default: SwapReturnTab } = await import('../SwapReturnTab')

const sameItem = { maHang: 'TH00893', tenHang: 'Progermila Sol 5ml', loLoi: '011225', loDoi: '011225', hanDungLoi: '12/05/2028', hanDungDoi: '12/05/2028', dvt: 'ỐNG', soLuong: '20', quyCach: 'Hộp 20 ống', lyDo: 'Ống nứt' }
const seed = [
  { id: 'r1', entity: 'donC', date: '2026-09-22', customerName: 'Nhà thuốc Minh Khôi 2', accountantNhapLai: '', items: [sameItem], createdAt: '2026-09-22T02:00:00Z' },
  { id: 'r0', entity: 'donC', date: '2026-09-16', customerName: 'Nhà thuốc Tuần Trước', accountantNhapLai: '', items: [sameItem], createdAt: '2026-09-16T02:00:00Z' },
  { id: 'rD', entity: 'donDTP', date: '2026-09-23', customerName: 'Khoa Dược DTP', accountantNhapLai: '', items: [sameItem], createdAt: '2026-09-23T02:00:00Z' },
]

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 8, 24, 10, 0))
  store.values.clear()
  store.values.set('swap_return_records', JSON.stringify(seed))
  Object.values(exportMocks).forEach(fn => fn.mockClear())
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('SwapReturnTab', () => {
  it('mở ở tuần hiện tại, chỉ hiện đợt của đúng kho và đúng tuần', () => {
    render(<SwapReturnTab type="donC" />)
    expect(screen.getByText('Tuần 39')).toBeInTheDocument()
    expect(screen.getByText('21/09/2026 – 27/09/2026')).toBeInTheDocument()
    expect(screen.getAllByText('Nhà thuốc Minh Khôi 2').length).toBeGreaterThan(0)
    expect(screen.queryByText('Nhà thuốc Tuần Trước')).toBeNull()
    expect(screen.queryByText('Khoa Dược DTP')).toBeNull()
    expect(screen.getByText('Không cần — cùng lô')).toBeInTheDocument()
  })

  it('lùi về tuần trước thì thấy đợt tuần trước', () => {
    render(<SwapReturnTab type="donC" />)
    fireEvent.click(screen.getByLabelText('Tuần trước'))
    expect(screen.getByText('Tuần 38')).toBeInTheDocument()
    expect(screen.getAllByText('Nhà thuốc Tuần Trước').length).toBeGreaterThan(0)
  })

  it('thêm đợt khác lô: bắt chọn kế toán nhập lại kho, lưu xong vào bộ tuần và có nút xuất BB nhập lại kho', async () => {
    render(<SwapReturnTab type="donC" />)
    fireEvent.click(screen.getByRole('button', { name: /Thêm đợt đổi trả/ }))
    const dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Tên khách hàng *'), { target: { value: 'Nhà thuốc An Phúc' } })
    fireEvent.change(within(dialog).getByLabelText('Mã hàng dòng 1'), { target: { value: 'TH03426' } })
    fireEvent.change(within(dialog).getByLabelText('Tên hàng dòng 1'), { target: { value: 'Golistin soda' } })
    fireEvent.change(within(dialog).getByLabelText('Số lô hàng lỗi dòng 1'), { target: { value: '010526' } })
    fireEvent.change(within(dialog).getByLabelText('Số lô hàng đổi dòng 1'), { target: { value: '020626' } })
    expect(within(dialog).getByText('Khác lô')).toBeInTheDocument()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Lưu đợt đổi trả' }))
    expect(within(dialog).getByRole('alert')).toHaveTextContent('chọn kế toán')

    fireEvent.change(within(dialog).getByLabelText('Kế toán — BB xác minh nhập lại kho *'), { target: { value: 'Võ Thị Ly' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Lưu đợt đổi trả' }))

    expect(screen.queryByRole('dialog')).toBeNull()
    const saved = JSON.parse(store.values.get('swap_return_records'))
    const added = saved.find(r => r.customerName === 'Nhà thuốc An Phúc')
    expect(added).toMatchObject({ entity: 'donC', date: '2026-09-24', accountantNhapLai: 'Võ Thị Ly' })

    const nhapLaiBtn = screen.getByRole('button', { name: /Xuất \(1 dòng\)/ })
    await act(async () => { fireEvent.click(nhapLaiBtn) })
    expect(exportMocks.exportSwapNhapLai).toHaveBeenCalledWith(expect.objectContaining({ customerName: 'Nhà thuốc An Phúc' }))
    expect(JSON.parse(store.values.get('swap_return_records')).find(r => r.id === added.id).nhapLaiExportedAt).toBeTruthy()
  })

  it('HD lô đổi bị khoá và đi theo HD lô lỗi khi cùng lô', () => {
    render(<SwapReturnTab type="donC" />)
    fireEvent.click(screen.getByRole('button', { name: /Thêm đợt đổi trả/ }))
    const dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Số lô hàng lỗi dòng 1'), { target: { value: 'A1' } })
    fireEvent.change(within(dialog).getByLabelText('Số lô hàng đổi dòng 1'), { target: { value: 'A1' } })
    fireEvent.change(within(dialog).getByLabelText('HD lô lỗi dòng 1'), { target: { value: '11/06/2029' } })
    const hdDoi = within(dialog).getByLabelText('HD lô đổi dòng 1')
    expect(hdDoi).toBeDisabled()
    expect(hdDoi).toHaveValue('11/06/2029')
  })

  it('hạn dùng: dán chữ tự chuẩn hoá, gõ tay chuẩn hoá khi rời ô, chọn từ lịch cũng được', () => {
    render(<SwapReturnTab type="donC" />)
    fireEvent.click(screen.getByRole('button', { name: /Thêm đợt đổi trả/ }))
    const dialog = screen.getByRole('dialog')
    const hdLoi = within(dialog).getByLabelText('HD lô lỗi dòng 1')
    fireEvent.paste(hdLoi, { clipboardData: { getData: () => '2029-05-26\n' } })
    expect(hdLoi).toHaveValue('26/05/2029')

    const hdDoi = within(dialog).getByLabelText('HD lô đổi dòng 1')
    fireEvent.change(hdDoi, { target: { value: '15-8-2029' } })
    fireEvent.blur(hdDoi)
    expect(hdDoi).toHaveValue('15/08/2029')

    const picker = hdDoi.parentElement.querySelector('input[type="date"]')
    fireEvent.change(picker, { target: { value: '2030-01-02' } })
    expect(hdDoi).toHaveValue('02/01/2030')
  })

  it('ô Lý do tự xuống dòng nhưng giữ nội dung 1 dòng (dán có xuống dòng thành dấu cách, Enter không tạo dòng mới)', () => {
    render(<SwapReturnTab type="donC" />)
    fireEvent.click(screen.getByRole('button', { name: /Thêm đợt đổi trả/ }))
    const lyDo = within(screen.getByRole('dialog')).getByLabelText('Lý do dòng 1')
    expect(lyDo.tagName).toBe('TEXTAREA')
    fireEvent.change(lyDo, { target: { value: 'Phương (XU262/323881)\nđổi lô mới' } })
    expect(lyDo).toHaveValue('Phương (XU262/323881) đổi lô mới')
    const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    lyDo.dispatchEvent(enter)
    expect(enter.defaultPrevented).toBe(true)
  })

  it('không cho lưu khi hạn dùng sai ngày', () => {
    render(<SwapReturnTab type="donC" />)
    fireEvent.click(screen.getByRole('button', { name: /Thêm đợt đổi trả/ }))
    const dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Tên khách hàng *'), { target: { value: 'KH' } })
    fireEvent.change(within(dialog).getByLabelText('Mã hàng dòng 1'), { target: { value: 'TH1' } })
    fireEvent.change(within(dialog).getByLabelText('HD lô lỗi dòng 1'), { target: { value: '31/02/2029' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Lưu đợt đổi trả' }))
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Hạn dùng của mặt hàng TH1 chưa đúng')
  })

  it('"Xuất cả bộ" xuất 2 file cả tuần với kế toán đã chọn và đánh dấu đã xuất', async () => {
    render(<SwapReturnTab type="donC" />)
    fireEvent.change(screen.getByLabelText('Kế toán ký bộ cuối tuần'), { target: { value: 'Trần Thị Ái Lâm' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Xuất cả bộ/ })) })

    const args = { entity: 'donC', weekStart: '2026-09-21', accountant: 'Trần Thị Ái Lâm', items: [expect.objectContaining({ maHang: 'TH00893', customerName: 'Nhà thuốc Minh Khôi 2' })] }
    expect(exportMocks.exportSwapWeeklyXuLy).toHaveBeenCalledWith(args)
    expect(exportMocks.exportSwapWeeklyXuatKho).toHaveBeenCalledWith(args)
    expect(screen.getByText(/^Đã xuất /)).toBeInTheDocument()
    const meta = JSON.parse(store.values.get('swap_return_weekly'))
    expect(meta['donC|2026-09-21']).toMatchObject({ accountant: 'Trần Thị Ái Lâm' })
    expect(meta['donC|2026-09-21'].exportedAt).toBeTruthy()
  })
})
