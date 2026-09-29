import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fixtures from '../../utils/__tests__/fixtures/phieuXuatKhoHuyText.json'
import HangHuyTab from '../HangHuyTab'

const store = vi.hoisted(() => {
  const values = new Map()
  return { values, opsStore: { getItem: (k) => values.get(k) ?? null, setItem: (k, v) => { values.set(k, String(v)) }, removeItem: (k) => values.delete(k) } }
})
vi.mock('../../data/workspace', () => ({ opsStore: store.opsStore }))

const pdfMock = vi.hoisted(() => ({ text: '' }))
vi.mock('../../utils/parseGoodsReceipt', () => ({ extractPdfText: vi.fn(async () => pdfMock.text) }))

const exportMock = vi.hoisted(() => vi.fn(async () => {}))
vi.mock('../../utils/exportDamagedGoods', async (orig) => ({ ...(await orig()), exportHangHuyPhieu: exportMock }))

const readPhieus = () => JSON.parse(store.values.get('huy_slips') || '[]')
const upload = (name = 'phieu.pdf') => fireEvent.change(document.querySelector('input[type="file"]'), { target: { files: [new File(['%PDF'], name)] } })

beforeEach(() => {
  store.values.clear()
  window.localStorage.clear()
  exportMock.mockClear()
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(new Date('2026-09-30T08:00:00'))
})
afterEach(() => { cleanup(); vi.useRealTimers() })

describe('HangHuyTab — Kho C & Kho DTP theo phiếu xuất kho', () => {
  it('tải phiếu Kho C: tạo phiếu, mở màn làm biên bản, Tình trạng trống, số biên bản gợi ý, xuất file rồi ký đủ', async () => {
    pdfMock.text = fixtures.khoC
    render(<HangHuyTab />)
    upload()
    await waitFor(() => expect(screen.getByText(/Đã đọc/)).toBeInTheDocument())
    const [phieu] = readPhieus()
    expect(phieu).toMatchObject({ kho: 'C', soPhieu: 'XT2621/00810', khoXuat: '020102', stage: 'todo' })
    expect(phieu.items).toHaveLength(3)
    expect(phieu.items.every(i => i.tinhTrang === '')).toBe(true)
    expect(phieu.form.soBB).toBe('1')
    expect(screen.getByLabelText('Tình trạng W00520')).toHaveValue('')
    expect(screen.getByLabelText(/Số biên bản/)).toHaveValue('1')

    fireEvent.change(screen.getByLabelText('Tình trạng W00520'), { target: { value: 'Hàng gãy, vỡ ống' } })
    expect(readPhieus()[0].items[0].tinhTrang).toBe('Hàng gãy, vỡ ống')
    expect(screen.getAllByText('Hàng gãy, vỡ ống').length).toBeGreaterThan(0) // hiện trên bản xem trước

    fireEvent.click(screen.getByRole('button', { name: /Xuất BB xử lý/ }))
    await waitFor(() => expect(exportMock).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(readPhieus()[0].stage).toBe('exported'))
    fireEvent.click(screen.getByRole('button', { name: /Đã ký đủ, huỷ xong/ }))
    expect(readPhieus()[0].stage).toBe('done')
  })

  it('Kho DTP: dòng không có số lượng báo đỏ, nhập tay được; xoá hàng bỏ khỏi bộ biên bản; xem trước đổi giữa xử lý (dọc) và xác minh (ngang)', async () => {
    pdfMock.text = fixtures.khoDTP
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<HangHuyTab />)
    upload()
    await waitFor(() => expect(screen.getByText(/Không đọc được số lượng/)).toBeInTheDocument())
    expect(readPhieus()[0]).toMatchObject({ kho: 'DTP', soPhieu: 'XK2621/00104' })
    expect(screen.getByLabelText('Thực huỷ TH00899')).toHaveValue(null)

    fireEvent.change(screen.getByLabelText('Thực huỷ TH00899'), { target: { value: '3' } })
    expect(readPhieus()[0].items[3].thucHuy).toBe(3)

    fireEvent.click(screen.getByRole('button', { name: 'Xoá dòng TH03426' }))
    expect(readPhieus()[0].items.map(i => i.maHang)).toEqual(['TH00893', 'TB11997', 'TH00899', 'TP02688'])

    expect(screen.getByTestId('print-hint')).toHaveTextContent('Portrait')
    fireEvent.click(screen.getByRole('button', { name: 'Biên bản xác minh' }))
    expect(screen.getByTestId('print-hint')).toHaveTextContent('Landscape')
  })

  it('phiếu đã có thì không tải trùng; file không phải phiếu xuất kho thì báo lỗi', async () => {
    pdfMock.text = fixtures.khoC
    render(<HangHuyTab />)
    upload()
    await waitFor(() => expect(readPhieus()).toHaveLength(1))
    fireEvent.click(screen.getByRole('button', { name: /Danh sách phiếu/ }))
    upload()
    await waitFor(() => expect(screen.getByText(/đã có trong danh sách/)).toBeInTheDocument())
    expect(readPhieus()).toHaveLength(1)

    pdfMock.text = 'Biên bản giao nhận'
    upload('khac.pdf')
    await waitFor(() => expect(screen.getByText(/Không đọc được phiếu xuất kho/)).toBeInTheDocument())
  })

  it('lọc Kho C / Kho DTP có số đếm; nhãn đỏ Kho C, xanh dương Kho DTP; nhắc việc khi chưa làm quá 1 ngày', () => {
    const mk = (id, kho, soPhieu, stage, importedAt, extra = {}) => ({ id, kho, soPhieu, khoXuat: '0201', items: [{ maHang: 'A', tenHang: 'x' }], form: {}, stage, importedAt, ...extra })
    store.values.set('huy_slips', JSON.stringify([
      mk('c', 'C', 'XT1', 'todo', '2026-09-29T07:00:00'),
      mk('d', 'DTP', 'XK1', 'exported', '2026-09-20T07:00:00', { exportedAt: '2026-09-25T08:00:00' }),
    ]))
    render(<HangHuyTab />)
    const panel = screen.getByRole('region', { name: 'Nhắc việc' })
    expect(within(panel).getByText(/chưa làm xong biên bản quá 1 ngày/)).toBeInTheDocument()
    expect(within(panel).getByText(/chưa ký đủ quá 3 ngày/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Kho C (1)' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Kho DTP (1)' })).toBeInTheDocument()
    expect(screen.getAllByText('Kho C', { selector: 'span' })[0].className).toContain('text-red-700')
    expect(screen.getAllByText('Kho DTP', { selector: 'span' })[0].className).toContain('text-blue-700')

    fireEvent.click(within(panel).getByRole('button', { name: /Đã ký đủ, huỷ xong/ }))
    expect(JSON.parse(store.values.get('huy_slips')).find(p => p.id === 'd').stage).toBe('done')
    fireEvent.click(screen.getByRole('button', { name: 'Kho DTP (1)' }))
    const rows = screen.getAllByRole('row').map(r => r.textContent)
    expect(rows.some(t => t.includes('XT1'))).toBe(false) // bảng chỉ còn Kho DTP (nhắc việc phía trên vẫn nhắc phiếu Kho C)
    expect(rows.some(t => t.includes('XK1'))).toBe(true)
  })

  it('biên bản nhập tay theo mẫu cũ của Kho C / DTP vẫn xem được ở mục riêng, không lẫn Kho A', () => {
    store.values.set('damaged_goods_records', JSON.stringify([
      { id: 'o1', entity: 'khoC', year: 2026, month: 8, processedAt: '2026-08-19T00:00:00.000Z', items: [{ maHang: 'W1' }] },
      { id: 'o2', entity: 'khoA', year: 2026, month: 8, processedAt: '2026-08-20T00:00:00.000Z', items: [] },
    ]))
    render(<HangHuyTab />)
    fireEvent.click(screen.getByRole('button', { name: /Biên bản nhập tay theo mẫu cũ/ }))
    expect(screen.getAllByTitle('Xem')).toHaveLength(1) // đúng 1 biên bản Kho C, Kho A không lẫn vào
  })
})
