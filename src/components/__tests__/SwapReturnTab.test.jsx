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
  exportSwapBatchXuLy: vi.fn().mockResolvedValue(undefined),
  exportSwapBatchXuatKho: vi.fn().mockResolvedValue(undefined),
  exportSwapNhapLai: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../../utils/exportSwapReturn', () => exportMocks)

const { default: SwapReturnTab } = await import('../SwapReturnTab')

const sameItem = { maHang: 'TH00893', tenHang: 'Progermila Sol 5ml', loLoi: '011225', loDoi: '011225', hanDungLoi: '12/05/2028', hanDungDoi: '12/05/2028', dvt: 'ỐNG', soLuong: '20', quyCach: 'Hộp 20 ống', lyDo: 'Ống nứt' }
// Đợt tạo trước khi có tính năng bộ: chưa có batchNo.
const seed = [
  { id: 'r1', entity: 'donC', date: '2026-09-22', customerName: 'Nhà thuốc Minh Khôi 2', accountantNhapLai: '', items: [sameItem], createdAt: '2026-09-22T02:00:00Z' },
  { id: 'rD', entity: 'donDTP', date: '2026-09-23', customerName: 'Khoa Dược DTP', accountantNhapLai: '', items: [sameItem], createdAt: '2026-09-23T02:00:00Z' },
]
const readStore = key => JSON.parse(store.values.get(key) || '[]')
const signBox = name => screen.getByLabelText(`Đã trình ký ${name}`)

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 8, 25, 10, 0))
  store.values.clear()
  store.values.set('swap_return_records', JSON.stringify(seed))
  Object.values(exportMocks).forEach(fn => fn.mockClear())
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

async function exportBoth() {
  const buttons = screen.getAllByRole('button', { name: /^Xuất$|^Xuất lại$/ }).slice(0, 2)
  for (const btn of buttons) await act(async () => { fireEvent.click(btn) })
}

function addRecord({ customer, maHang, loLoi, loDoi, accountant }) {
  fireEvent.click(screen.getByRole('button', { name: /Thêm đợt đổi trả/ }))
  const dialog = screen.getByRole('dialog')
  fireEvent.change(within(dialog).getByLabelText('Tên khách hàng *'), { target: { value: customer } })
  fireEvent.change(within(dialog).getByLabelText('Mã hàng dòng 1'), { target: { value: maHang } })
  fireEvent.change(within(dialog).getByLabelText('Tên hàng dòng 1'), { target: { value: `Thuốc ${maHang}` } })
  fireEvent.change(within(dialog).getByLabelText('Số lô hàng lỗi dòng 1'), { target: { value: loLoi } })
  fireEvent.change(within(dialog).getByLabelText('Số lô hàng đổi dòng 1'), { target: { value: loDoi } })
  if (accountant) fireEvent.change(within(dialog).getByLabelText('Kế toán — BB xác minh nhập lại kho *'), { target: { value: accountant } })
  fireEvent.click(within(dialog).getByRole('button', { name: 'Lưu đợt đổi trả' }))
}

describe('SwapReturnTab — bộ xuất huỷ và checklist trình ký', () => {
  it('đợt cũ chưa thuộc bộ nào nằm trong Bộ 01 đang gom; chỉ hiện đợt của đúng kho', () => {
    render(<SwapReturnTab type="donC" />)
    expect(screen.getByText('Bộ 01 — bộ xuất huỷ đang gom')).toBeInTheDocument()
    expect(screen.getByText('Nhà thuốc Minh Khôi 2')).toBeInTheDocument()
    expect(screen.queryByText('Khoa Dược DTP')).toBeNull()
  })

  it('ô "Đã trình ký" chỉ tick được khi đã xuất đủ 2 file; tick xong bộ khoá lại và mở bộ mới', async () => {
    render(<SwapReturnTab type="donC" />)
    fireEvent.change(screen.getByLabelText('Kế toán ký bộ này'), { target: { value: 'Trần Thị Ái Lâm' } })
    expect(signBox('Bộ 01')).toBeDisabled()

    await exportBoth()
    const args = expect.objectContaining({ entity: 'donC', batchNo: 1, accountant: 'Trần Thị Ái Lâm', items: [expect.objectContaining({ maHang: 'TH00893' })] })
    expect(exportMocks.exportSwapBatchXuLy).toHaveBeenCalledWith(args)
    expect(exportMocks.exportSwapBatchXuatKho).toHaveBeenCalledWith(args)
    expect(signBox('Bộ 01')).toBeEnabled()

    fireEvent.click(signBox('Bộ 01'))
    expect(window.confirm).toHaveBeenCalled()
    expect(screen.getByText('Bộ 02 — bộ xuất huỷ đang gom')).toBeInTheDocument()
    expect(screen.getByText(/Bộ 02 chưa có mặt hàng nào/)).toBeInTheDocument()

    const batches = readStore('swap_return_batches')
    expect(batches.find(b => b.no === 1)).toMatchObject({ entity: 'donC', accountant: 'Trần Thị Ái Lâm' })
    expect(batches.find(b => b.no === 1).signedAt).toBeTruthy()
    expect(readStore('swap_return_records').find(r => r.id === 'r1').batchNo).toBe(1)
  })

  it('huỷ xác nhận thì không khoá bộ', async () => {
    window.confirm.mockReturnValue(false)
    render(<SwapReturnTab type="donC" />)
    await exportBoth()
    fireEvent.click(signBox('Bộ 01'))
    expect(screen.getByText('Bộ 01 — bộ xuất huỷ đang gom')).toBeInTheDocument()
  })

  it('xuất xong mà thêm đợt mới thì báo cần xuất lại và không cho trình ký', async () => {
    render(<SwapReturnTab type="donC" />)
    await exportBoth()
    addRecord({ customer: 'Nhà thuốc Mới', maHang: 'TB1', loLoi: 'L1', loDoi: 'L1' })
    expect(screen.getAllByText(/cần xuất lại/).length).toBe(2)
    expect(signBox('Bộ 01')).toBeDisabled()
    expect(readStore('swap_return_records').find(r => r.customerName === 'Nhà thuốc Mới').batchNo).toBe(1)
  })

  it('đợt mới sau khi ký vào bộ mới, bộ đã ký giữ nguyên; tải lại file bộ đã ký dùng đúng ngày xuất lần đầu', async () => {
    render(<SwapReturnTab type="donC" />)
    await exportBoth()
    fireEvent.click(signBox('Bộ 01'))
    vi.setSystemTime(new Date(2026, 8, 28, 9, 0))
    addRecord({ customer: 'Nhà thuốc Sau Ký', maHang: 'TB2', loLoi: 'L2', loDoi: 'L2' })

    expect(screen.getByText('Nhà thuốc Sau Ký')).toBeInTheDocument()
    expect(readStore('swap_return_records').find(r => r.customerName === 'Nhà thuốc Sau Ký').batchNo).toBe(2)

    fireEvent.click(screen.getByText('Bộ đã trình ký'))
    const row = screen.getByText('Bộ 01').closest('tr')
    await act(async () => { fireEvent.click(within(row).getByRole('button', { name: /BB Xử lý/ })) })
    const call = exportMocks.exportSwapBatchXuLy.mock.calls.at(-1)[0]
    expect(call).toMatchObject({ batchNo: 1, items: [expect.objectContaining({ maHang: 'TH00893' })] })
    expect(call.date.getDate()).toBe(25)
  })

  it('bỏ tick bộ ký gần nhất khi bộ đang gom còn trống thì mở lại bộ đó; đã có hàng thì không bỏ được', async () => {
    render(<SwapReturnTab type="donC" />)
    await exportBoth()
    fireEvent.click(signBox('Bộ 01'))

    const undo = screen.getByLabelText('Bỏ đánh dấu trình ký Bộ 01')
    expect(undo).toBeEnabled()
    fireEvent.click(undo)
    expect(screen.getByText('Bộ 01 — bộ xuất huỷ đang gom')).toBeInTheDocument()

    fireEvent.click(signBox('Bộ 01'))
    addRecord({ customer: 'Nhà thuốc Chặn', maHang: 'TB3', loLoi: 'L3', loDoi: 'L3' })
    expect(screen.getByLabelText('Bỏ đánh dấu trình ký Bộ 01')).toBeDisabled()
  })

  it('BB nhập lại kho: đợt khác lô bắt chọn kế toán; xuất rồi mới tick được "Đã trình ký"', async () => {
    render(<SwapReturnTab type="donC" />)
    fireEvent.click(screen.getByRole('button', { name: /Thêm đợt đổi trả/ }))
    const dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Tên khách hàng *'), { target: { value: 'Nhà thuốc An Phúc' } })
    fireEvent.change(within(dialog).getByLabelText('Mã hàng dòng 1'), { target: { value: 'TH03426' } })
    fireEvent.change(within(dialog).getByLabelText('Số lô hàng lỗi dòng 1'), { target: { value: '010526' } })
    fireEvent.change(within(dialog).getByLabelText('Số lô hàng đổi dòng 1'), { target: { value: '020626' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Lưu đợt đổi trả' }))
    expect(within(dialog).getByRole('alert')).toHaveTextContent('chọn kế toán')
    fireEvent.change(within(dialog).getByLabelText('Kế toán — BB xác minh nhập lại kho *'), { target: { value: 'Võ Thị Ly' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Lưu đợt đổi trả' }))

    expect(screen.getByText('1 chưa ký')).toBeInTheDocument()
    const tick = screen.getByLabelText('Đã trình ký BB nhập lại kho Nhà thuốc An Phúc')
    expect(tick).toBeDisabled()

    const row = tick.closest('tr')
    await act(async () => { fireEvent.click(within(row).getByRole('button', { name: /Xuất/ })) })
    expect(exportMocks.exportSwapNhapLai).toHaveBeenCalledWith(expect.objectContaining({ customerName: 'Nhà thuốc An Phúc', accountantNhapLai: 'Võ Thị Ly' }))

    fireEvent.click(screen.getByLabelText('Đã trình ký BB nhập lại kho Nhà thuốc An Phúc'))
    expect(screen.getByText('Đã ký hết')).toBeInTheDocument()
    expect(readStore('swap_return_records').find(r => r.customerName === 'Nhà thuốc An Phúc').nhapLaiSignedAt).toBeTruthy()
  })
})

describe('SwapReturnTab — form nhập đợt', () => {
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

  it('ô Tên hàng và Lý do tự xuống dòng nhưng giữ nội dung 1 dòng (dán có xuống dòng thành dấu cách, Enter không tạo dòng mới)', () => {
    render(<SwapReturnTab type="donC" />)
    fireEvent.click(screen.getByRole('button', { name: /Thêm đợt đổi trả/ }))
    expect(within(screen.getByRole('dialog')).getByLabelText('Tên hàng dòng 1').tagName).toBe('TEXTAREA')
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
})
