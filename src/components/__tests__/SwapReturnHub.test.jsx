import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SwapReturnHub from '../SwapReturnHub'

const store = vi.hoisted(() => {
  const values = new Map()
  return { values, opsStore: { getItem: (k) => values.get(k) ?? null, setItem: (k, v) => { values.set(k, String(v)) }, removeItem: (k) => values.delete(k) } }
})
vi.mock('../../data/workspace', () => ({ opsStore: store.opsStore }))
vi.mock('../../utils/exportSwapReturn', () => ({
  exportSwapNhapLai: vi.fn(async () => {}), exportSwapBatchXuatKho: vi.fn(async () => {}), exportSwapBatchXuLy: vi.fn(async () => {}),
}))

const read = key => JSON.parse(store.values.get(key) || '[]')
const rec = (id, entity, name, extra = {}) => ({
  id, entity, flow: 'v2', date: '2026-09-30', customerName: name, accountantNhapLai: 'Lưu Thị Thuỳ',
  items: [{ maHang: 'TH1', tenHang: 'Hàng A', loLoi: 'L1', loDoi: 'L1', hanDungLoi: '26/05/2029', dvt: 'ONG', soLuong: '5', quyCach: 'Hộp', lyDo: 'Hàng gãy đổi cho DP X' }],
  nhapLaiExportedAt: null, nhapLaiSignedAt: null, nhapLaiDoneAt: null, huyBatchId: null, ...extra,
})

beforeEach(() => { store.values.clear(); window.localStorage.clear(); vi.spyOn(window, 'print').mockImplementation(() => {}) })
afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('SwapReturnHub — quy trình đổi trả mới, gộp Đơn C và Đơn DTP', () => {
  it('tick trình ký không cần xuất file; hoàn thành chỉ tick được sau khi trình ký; sau đó vào danh sách chờ gom huỷ', () => {
    store.values.set('swap_return_records', JSON.stringify([rec('a', 'donC', 'Khách A')]))
    render(<SwapReturnHub />)
    const done = screen.getByLabelText('Hoàn thành Khách A')
    expect(done).toBeDisabled()
    fireEvent.click(screen.getByLabelText('Đã trình ký Khách A'))
    expect(read('swap_return_records')[0].nhapLaiSignedAt).toBeTruthy()
    fireEvent.click(screen.getByLabelText('Hoàn thành Khách A'))
    expect(read('swap_return_records')[0].nhapLaiDoneAt).toBeTruthy()
    expect(screen.getByLabelText('Chọn gom huỷ Khách A')).toBeInTheDocument()
  })

  it('gom huỷ: chỉ chọn cùng loại đơn; tạo bộ huỷ gắn các đợt; xoá bộ (chưa ký) trả đợt về chờ gom', () => {
    store.values.set('swap_return_records', JSON.stringify([
      rec('a', 'donC', 'Khách A', { nhapLaiSignedAt: 'x', nhapLaiDoneAt: 'x' }),
      rec('b', 'donC', 'Khách B', { nhapLaiSignedAt: 'x', nhapLaiDoneAt: 'x' }),
      rec('c', 'donDTP', 'Khách C', { nhapLaiSignedAt: 'x', nhapLaiDoneAt: 'x' }),
    ]))
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<SwapReturnHub />)
    fireEvent.click(screen.getByLabelText('Chọn gom huỷ Khách A'))
    expect(screen.getByLabelText('Chọn gom huỷ Khách C')).toBeDisabled() // khác loại đơn
    fireEvent.click(screen.getByLabelText('Chọn gom huỷ Khách B'))
    fireEvent.click(screen.getByRole('button', { name: /Tạo bộ huỷ \(2 đợt\)/ }))
    expect(read('swap_huy_batches')[0]).toMatchObject({ entity: 'donC', no: 1, recordIds: ['a', 'b'] })
    expect(read('swap_return_records').filter(r => r.huyBatchId).map(r => r.id)).toEqual(['a', 'b'])

    fireEvent.click(screen.getByLabelText('Đã trình ký Bộ 01 Đơn C'))
    expect(read('swap_huy_batches')[0].signedAt).toBeTruthy()
    fireEvent.click(screen.getByLabelText('Hoàn thành Bộ 01 Đơn C'))
    expect(read('swap_huy_batches')[0].accountedAt).toBeTruthy()
  })

  it('bộ huỷ chưa ký: xoá được, các đợt quay về chờ gom', () => {
    store.values.set('swap_return_records', JSON.stringify([rec('a', 'donDTP', 'Khách A', { nhapLaiSignedAt: 'x', nhapLaiDoneAt: 'x', huyBatchId: 'huy_donDTP_1' })]))
    store.values.set('swap_huy_batches', JSON.stringify([{ id: 'huy_donDTP_1', entity: 'donDTP', no: 1, recordIds: ['a'], accountant: 'Lưu Thị Thuỳ', exported: {}, signedAt: null, accountedAt: null }]))
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<SwapReturnHub />)
    fireEvent.click(screen.getByLabelText('Xoá Bộ 01 Đơn DTP'))
    expect(read('swap_huy_batches')).toEqual([])
    expect(read('swap_return_records')[0].huyBatchId).toBeNull()
  })

  it('Xem / in: mở xem trước BB xác minh nhập lại kho với nút In; bộ huỷ có BB xác minh huỷ (ngang) và BB xử lý huỷ (dọc)', () => {
    store.values.set('swap_return_records', JSON.stringify([rec('a', 'donDTP', 'Khách A', { nhapLaiSignedAt: 'x', nhapLaiDoneAt: 'x', huyBatchId: 'huy_donDTP_1' })]))
    store.values.set('swap_huy_batches', JSON.stringify([{ id: 'huy_donDTP_1', entity: 'donDTP', no: 1, recordIds: ['a'], accountant: 'Lưu Thị Thuỳ', exported: {}, signedAt: null, accountedAt: null }]))
    render(<SwapReturnHub />)
    fireEvent.click(screen.getByRole('button', { name: 'Xem và in Khách A' }))
    expect(screen.getAllByText('BIÊN BẢN XÁC MINH TÌNH TRẠNG HÀNG HOÁ').length).toBeGreaterThan(0)
    expect(screen.getByTestId('print-hint')).toHaveTextContent('Landscape')
    fireEvent.click(screen.getByTitle(/In trực tiếp/))
    expect(window.print).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: /Danh sách/ }))

    fireEvent.click(screen.getByRole('button', { name: 'Xem và in Bộ 01 Đơn DTP' }))
    expect(screen.getByTestId('print-hint')).toHaveTextContent('Landscape')
    fireEvent.click(screen.getByRole('button', { name: 'BB xử lý huỷ' }))
    expect(screen.getByTestId('print-hint')).toHaveTextContent('Portrait')
    expect(screen.getAllByText('BIÊN BẢN XỬ LÝ SẢN PHẨM').length).toBeGreaterThan(0)
  })

  it('lọc Đơn C / Đơn DTP; dữ liệu theo quy trình cũ nằm ở mục riêng, không lẫn vào danh sách mới', () => {
    store.values.set('swap_return_records', JSON.stringify([
      rec('a', 'donC', 'Khách C'), rec('b', 'donDTP', 'Khách D'),
      { id: 'old', entity: 'donC', date: '2026-09-01', customerName: 'Khách cũ', items: [{ maHang: 'X', loLoi: '1', loDoi: '1' }], batchNo: 1 },
    ]))
    render(<SwapReturnHub />)
    expect(screen.getByText('Khách C')).toBeInTheDocument()
    expect(screen.queryByText('Khách cũ')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Đơn DTP' }))
    expect(screen.queryByText('Khách C')).not.toBeInTheDocument()
    expect(screen.getByText('Khách D')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Đợt cũ/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Tất cả' }))
    expect(within(document.body).getAllByText('Khách cũ').length).toBeGreaterThan(0)
  })
})
