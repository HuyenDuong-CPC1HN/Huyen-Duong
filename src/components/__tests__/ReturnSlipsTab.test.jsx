import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fixtures from '../../utils/__tests__/fixtures/returnSlipPdfLines.json'
import ReturnSlipsTab from '../ReturnSlipsTab'
import ReturnReminderBell from '../ReturnReminderBell'

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

const pdfMock = vi.hoisted(() => ({ lines: null }))
vi.mock('../../utils/returnSlipPdf', () => ({ extractPdfLines: vi.fn(async () => pdfMock.lines) }))

const exportMock = vi.hoisted(() => vi.fn(async () => {}))
vi.mock('../../utils/exportReturnSlip', () => ({ exportReturnSlipDocs: exportMock }))

const readSlipsFromStore = () => JSON.parse(store.values.get('return_slips') || '[]')

beforeEach(() => {
  store.values.clear()
  window.localStorage.clear() // bộ lọc Đơn C/DTP được nhớ trong trình duyệt
  exportMock.mockClear()
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(new Date('2026-09-30T08:00:00'))
})
afterEach(() => { cleanup(); vi.useRealTimers() })

const rowOf = (ma) => screen.getAllByRole('row').find(r => r.textContent.includes(ma))
function seed(slips) { store.values.set('return_slips', JSON.stringify(slips)) }

describe('ReturnSlipsTab — Theo dõi nhập trả lại', () => {
  it('thêm phiếu chờ duyệt; qua ngày hôm sau hiện trong Nhắc việc; bấm "Đã duyệt" chuyển sang chưa làm biên bản', async () => {
    const { unmount } = render(<ReturnSlipsTab />)
    fireEvent.click(screen.getByRole('button', { name: /Thêm phiếu/ }))
    fireEvent.change(screen.getByLabelText(/Mã phiếu \*/), { target: { value: 'DHC280926/01306' } })
    fireEvent.change(screen.getByLabelText(/Khách hàng \*/), { target: { value: 'Công ty TNHH Dược phẩm Hoa Lâm' } })
    fireEvent.change(screen.getByLabelText(/Ngày tạo phiếu/), { target: { value: '2026-09-28' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu phiếu' }))

    expect(readSlipsFromStore()).toMatchObject([{ maPhieu: 'DHC280926/01306', stage: 'wait' }])
    const panel = screen.getByRole('region', { name: 'Nhắc việc' })
    expect(within(panel).getByText(/Chờ duyệt quá 1 ngày/)).toBeInTheDocument()
    expect(within(panel).getByText('Công ty TNHH Dược phẩm Hoa Lâm')).toBeInTheDocument()

    fireEvent.click(within(panel).getByRole('button', { name: /Đã duyệt/ }))
    expect(readSlipsFromStore()[0]).toMatchObject({ stage: 'todo' })
    expect(screen.queryByRole('region', { name: 'Nhắc việc' })).not.toBeInTheDocument()
    expect(screen.getByText('Chưa làm biên bản')).toBeInTheDocument()
    unmount()
  })

  it('"Chưa duyệt, nhắc lại mai" ẩn khỏi nhắc việc đến sáng hôm sau', () => {
    seed([{ id: 's1', maPhieu: 'DHC1', khachHang: 'Khách A', stage: 'wait', createdAt: '2026-09-27T08:00:00' }])
    render(<ReturnSlipsTab />)
    const panel = screen.getByRole('region', { name: 'Nhắc việc' })
    fireEvent.click(within(panel).getByRole('button', { name: /nhắc lại mai/ }))
    expect(screen.queryByRole('region', { name: 'Nhắc việc' })).not.toBeInTheDocument()
    expect(new Date(readSlipsFromStore()[0].snoozeUntil).getDate()).toBe(1)
  })

  it('lọc Đơn C / Đơn DTP có số đếm; nhãn đỏ Đơn C, xanh dương Đơn DTP', () => {
    const c = parseLike('bbth_1'); const u = parseLike('bbth_2')
    seed([
      { id: 'c', maPhieu: 'C1', khachHang: 'Khách C', stage: 'doing', createdAt: '2026-09-10T08:00:00', approvedAt: '2026-09-29T20:00:00', pdf: c, form: {} },
      { id: 'u', maPhieu: 'U1', khachHang: 'Khách U', stage: 'doing', createdAt: '2026-09-11T08:00:00', approvedAt: '2026-09-29T20:00:00', pdf: u, form: {} },
    ])
    render(<ReturnSlipsTab />)
    expect(screen.getByRole('button', { name: 'Đơn C (1)' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Đơn DTP (1)' })).toBeInTheDocument()
    expect(screen.getByText('Đơn C', { selector: 'span' }).className).toContain('text-red-700')
    expect(screen.getByText('Đơn DTP', { selector: 'span' }).className).toContain('text-blue-700')
    fireEvent.click(screen.getByRole('button', { name: 'Đơn DTP (1)' }))
    expect(screen.queryByText('Khách C')).not.toBeInTheDocument()
    expect(screen.getByText('Khách U')).toBeInTheDocument()
  })

  it('mở phiếu đã duyệt, tải PDF website: nhận mẫu, điền chỗ trống, xem trước, xuất Word rồi đánh dấu đã ký', async () => {
    seed([{ id: 's1', maPhieu: 'DHC100926/01188', khachHang: 'Phòng xét nghiệm chuẩn đoán y khoa Số 9', stage: 'todo', createdAt: '2026-09-10T12:36:00', approvedAt: '2026-09-15T09:32:00', form: null, pdf: null }])
    pdfMock.lines = fixtures.bbth_1
    render(<ReturnSlipsTab />)
    fireEvent.click(rowOf('DHC100926/01188'))

    const file = new File(['%PDF'], 'bbth_1.pdf', { type: 'application/pdf' })
    fireEvent.change(document.querySelector('input[type="file"]'), { target: { files: [file] } })
    await waitFor(() => expect(screen.getByText(/Mẫu CPC1HN/)).toBeInTheDocument())
    expect(readSlipsFromStore()[0]).toMatchObject({ stage: 'doing', pdf: { mau: 'CPC1HN' } })

    fireEvent.change(screen.getByLabelText(/Hoá đơn số/), { target: { value: '00001523' } })
    fireEvent.change(screen.getByLabelText('Số lô Tranfast'), { target: { value: '010924' } })
    expect(readSlipsFromStore()[0].form).toMatchObject({ soHD: '00001523', items: [{ soLo: '010924' }] })
    expect(screen.getAllByText('00001523').length).toBeGreaterThan(0) // hiện trên bản xem trước

    fireEvent.click(screen.getByRole('button', { name: /Xuất BB trả lại hàng \+ BB xác minh/ }))
    await waitFor(() => expect(exportMock).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(readSlipsFromStore()[0].stage).toBe('exported'))
    fireEvent.click(screen.getByRole('button', { name: /Đã ký đủ, nhập kho/ }))
    expect(readSlipsFromStore()[0].stage).toBe('done')
  })

  it('phiếu đang điền (đã ký ngoài app): bấm "Đã ký" ngay trên dòng để chuyển sang đã ký, nhập kho', () => {
    seed([{ id: 's1', maPhieu: 'DHC1', khachHang: 'Khách A', stage: 'doing', createdAt: '2026-09-29T08:00:00', approvedAt: '2026-09-29T09:00:00' }])
    render(<ReturnSlipsTab />)
    fireEvent.click(screen.getByRole('button', { name: /Đánh dấu đã ký DHC1/ }))
    expect(readSlipsFromStore()[0]).toMatchObject({ stage: 'done' })
    expect(screen.queryByRole('button', { name: /Đánh dấu đã ký/ })).not.toBeInTheDocument()
  })

  it('phiếu đã làm biên bản, đang chờ ký: bấm "Đã làm xong, chờ ký" trong nhắc việc → chuyển Đã xuất, chờ ký, hết nhắc "chưa làm"', () => {
    seed([{ id: 's1', maPhieu: 'DHC1', khachHang: 'Khách A', stage: 'doing', createdAt: '2026-09-27T08:00:00', approvedAt: '2026-09-27T09:00:00' }])
    render(<ReturnSlipsTab />)
    fireEvent.click(screen.getByRole('button', { name: /Đã làm xong, chờ ký/ }))
    expect(readSlipsFromStore()[0]).toMatchObject({ stage: 'exported' })
    expect(readSlipsFromStore()[0].exportedAt).toBeTruthy()
    expect(screen.queryByText(/Đã duyệt, chưa làm xong biên bản/)).not.toBeInTheDocument()
  })

  it('"Tạo đơn thủ công": tạo phiếu trống, mở thẳng màn làm biên bản với nút Nhập tay theo mẫu', () => {
    render(<ReturnSlipsTab />)
    fireEvent.click(screen.getByRole('button', { name: /Tạo đơn thủ công/ }))
    expect(readSlipsFromStore()).toMatchObject([{ stage: 'doing', pdf: null }])
    expect(screen.getByRole('button', { name: /Nhập tay · Đơn DTP/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Đọc từ hoá đơn/ })).toBeInTheDocument()
  })

  it('file của khách khác phiếu đang chọn thì cảnh báo', async () => {
    seed([{ id: 's1', maPhieu: 'DHC160926/01227', khachHang: 'Phòng khám Bác sĩ Gia đình DOMED', stage: 'todo', createdAt: '2026-09-16T13:54:00', approvedAt: '2026-09-25T15:44:00' }])
    pdfMock.lines = fixtures.bbth_2
    render(<ReturnSlipsTab />)
    fireEvent.click(rowOf('DHC160926/01227'))
    fireEvent.change(document.querySelector('input[type="file"]'), { target: { files: [new File(['%PDF'], 'bbth_2.pdf')] } })
    await waitFor(() => expect(screen.getByText(/khác phiếu đang chọn/)).toBeInTheDocument())
  })

  it('đơn nhập theo mẫu cũ vẫn xem được ở mục riêng', () => {
    store.values.set('return_records', JSON.stringify([{ id: 'old1', entity: 'donC', year: 2026, month: 8, customerName: 'Khách cũ', status: 'exported', invoices: [], products: [] }]))
    render(<ReturnSlipsTab />)
    fireEvent.click(screen.getByRole('button', { name: /Đơn nhập theo mẫu cũ/ }))
    expect(screen.getByText('Khách cũ')).toBeInTheDocument()
  })
})

describe('ReturnReminderBell', () => {
  it('hiện số việc tồn và mở tab khi bấm', () => {
    seed([{ id: 's1', maPhieu: 'DHC1', khachHang: 'A', stage: 'exported', exportedAt: '2026-09-20T08:00:00' }])
    const onOpen = vi.fn()
    render(<ReturnReminderBell onOpen={onOpen} />)
    const bell = screen.getByRole('button', { name: /Nhắc việc: 1 việc/ })
    fireEvent.click(bell)
    expect(onOpen).toHaveBeenCalledWith('traHang')
  })

  it('gộp cả việc hàng huỷ: chỉ có hàng huỷ thì mở thẳng tab hàng huỷ; có cả hai thì cho chọn tab', () => {
    store.values.set('huy_slips', JSON.stringify([{ id: 'h1', kho: 'C', soPhieu: 'XT1', items: [], stage: 'todo', importedAt: '2026-09-20T08:00:00' }]))
    const onOpen = vi.fn()
    const { unmount } = render(<ReturnReminderBell onOpen={onOpen} />)
    fireEvent.click(screen.getByRole('button', { name: /Nhắc việc: 1 việc/ }))
    expect(onOpen).toHaveBeenLastCalledWith('hangHuyCD')
    unmount()

    seed([{ id: 's1', maPhieu: 'DHC1', khachHang: 'A', stage: 'exported', exportedAt: '2026-09-20T08:00:00' }])
    render(<ReturnReminderBell onOpen={onOpen} />)
    fireEvent.click(screen.getByRole('button', { name: /Nhắc việc: 2 việc/ }))
    fireEvent.click(screen.getByRole('button', { name: /Nhập trả lại/ }))
    expect(onOpen).toHaveBeenLastCalledWith('traHang')
  })
})

// Dữ liệu PDF đã đọc sẵn (giống sau khi tải file) cho các phiếu seed.
import { parseReturnSlipLines } from '../../utils/returnSlips'
function parseLike(name) { return { ...parseReturnSlipLines(fixtures[name]), fileName: `${name}.pdf` } }
