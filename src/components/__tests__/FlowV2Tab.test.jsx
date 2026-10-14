import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import FlowV2Tab from '../FlowV2Tab'

const store = vi.hoisted(() => {
  const values = new Map()
  return { values, opsStore: { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, String(v)), removeItem: k => values.delete(k) } }
})
vi.mock('../../data/workspace', () => ({ opsStore: store.opsStore }))
vi.mock('../../data/flowV2Files', () => ({
  uploadFlowFiles: vi.fn(async files => files.map((f, i) => ({ name: f.name, storagePath: `flowv2/test/${i}-${f.name}`, type: f.type }))),
  getFlowFileUrl: vi.fn(async () => 'blob:test'),
}))
const exportMock = vi.hoisted(() => vi.fn(async () => {}))
vi.mock('../../utils/exportDamagedGoods', async orig => ({ ...(await orig()), exportHangHuyPhieu: exportMock }))

const read = k => JSON.parse(store.values.get(k) || '[]')
beforeEach(() => store.values.clear())
afterEach(() => cleanup())

function createCase(kind, sub) {
  fireEvent.click(screen.getByRole('button', { name: /Tạo hồ sơ khách trả/ }))
  const dlg = screen.getByRole('dialog', { name: 'Tạo hồ sơ khách trả' })
  fireEvent.click(within(dlg).getByRole('button', { name: kind === 'tra' ? /hàng nguyên vẹn/ : /hàng lỗi/ }))
  if (sub) fireEvent.click(within(dlg).getByRole('button', { name: sub }))
  fireEvent.click(within(dlg).getByRole('button', { name: 'Tạo hồ sơ' }))
}

describe('Hàng trả & huỷ (Demo)', () => {
  it('hồ sơ trả nguyên vẹn: tiếp nhận → BB xác minh (có xem trước) → ký → kế toán xong → Hoàn thành', async () => {
    render(<FlowV2Tab />)
    createCase('tra', /Khách đã nhận rồi trả/)
    await screen.findByText('Tiếp nhận + BB trả hàng', { selector: 'div' })
    expect(screen.getByText(/BB trả hàng có chữ ký khách — không bắt buộc/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Đã nhận hàng/ })).toBeDisabled() // chưa có dòng hàng
    fireEvent.change(screen.getByLabelText('Khách hàng'), { target: { value: 'Nhà thuốc Phước Thiện' } })
    const ma = screen.getByLabelText('Mã hàng dòng 1')
    fireEvent.change(ma, { target: { value: 'Z' } })
    expect(screen.getByLabelText('Mã hàng dòng 1')).toBe(ma) // gõ từng ký tự không mất ô
    fireEvent.change(ma, { target: { value: 'Z00330' } })
    fireEvent.change(screen.getByLabelText('Tên hàng dòng 1'), { target: { value: 'Zensalbu nebules 2.5' } })
    fireEvent.change(screen.getByLabelText('Hạn dùng dòng 1'), { target: { value: '05/07/2029' } })
    fireEvent.change(screen.getByLabelText('SL dòng 1'), { target: { value: '13' } })
    fireEvent.click(screen.getByRole('button', { name: /Đã nhận hàng/ }))

    expect(screen.getAllByText('BIÊN BẢN XÁC MINH TÌNH TRẠNG HÀNG HOÁ').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Nhà thuốc Phước Thiện/).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: /In xong → Chờ ký/ }))
    fireEvent.click(screen.getByRole('button', { name: /Đã ký đủ → chuyển kế toán/ }))
    fireEvent.change(screen.getByLabelText('Kế toán phụ trách'), { target: { value: 'Võ Thị Ly' } })
    fireEvent.click(screen.getByRole('button', { name: /Kế toán đã xong/ }))
    const c = read('flowv2_cases')[0]
    expect(c).toMatchObject({ kind: 'tra', sub: 'daNhan', kho: 'C', khachHang: 'Nhà thuốc Phước Thiện', keToan: 'Võ Thị Ly', step: 4 })
    expect(c.items[0]).toMatchObject({ maHang: 'Z00330', hanDung: '2029-07-05', soLuong: 13, tinhTrang: 'Hàng nguyên vẹn' })
    expect(c.ktDone.by).toBe('Kho xác nhận (Võ Thị Ly báo)')
    expect(screen.getAllByText(/Đã nhập kho — bán tiếp/).length).toBeGreaterThan(0)
  })

  it('hàng lỗi → Chờ huỷ; thêm hàng phát sinh; gom 1 đợt huỷ; đợt xong thì hồ sơ Huỷ xong', async () => {
    render(<FlowV2Tab />)
    createCase('loi')
    await screen.findByLabelText('Lý do lỗi')
    fireEvent.change(screen.getByLabelText('Khách hàng'), { target: { value: 'PK An Bình' } })
    fireEvent.change(screen.getByLabelText('Lý do lỗi'), { target: { value: 'Có cặn' } })
    fireEvent.change(screen.getByLabelText('Mã hàng dòng 1'), { target: { value: 'A01264' } })
    fireEvent.change(screen.getByLabelText('Tên hàng dòng 1'), { target: { value: 'Ambroxen' } })
    fireEvent.click(screen.getByRole('button', { name: /Đã nhận hàng/ }))
    fireEvent.click(screen.getByRole('button', { name: /In xong → Chờ ký/ }))
    fireEvent.click(screen.getByRole('button', { name: /Đã ký đủ → nhập lại kho/ }))
    fireEvent.change(screen.getByLabelText('Số phiếu nhập lại'), { target: { value: 'NL2621/00038' } })
    fireEvent.click(screen.getByRole('button', { name: /Đã nhập lại/ }))
    fireEvent.click(screen.getByRole('button', { name: /Đưa hàng lỗi vào Chờ huỷ/ }))
    expect(read('flowv2_pool')).toHaveLength(1)
    expect(read('flowv2_pool')[0].items[0].tinhTrang).toBe('Có cặn')
    fireEvent.click(screen.getByRole('button', { name: 'Mở khu Huỷ hàng' }))

    const khoC = screen.getByRole('region', { name: 'Huỷ hàng Kho C' })
    fireEvent.click(within(khoC).getByRole('button', { name: /Thêm hàng phát sinh/ }))
    const dlg = screen.getByRole('dialog')
    fireEvent.change(within(dlg).getByLabelText('Mã hàng dòng 1'), { target: { value: 'B01767' } })
    fireEvent.change(within(dlg).getByLabelText('Tên hàng dòng 1'), { target: { value: 'Bupi-BFS heavy' } })
    fireEvent.change(within(dlg).getByLabelText('SL dòng 1'), { target: { value: '670' } })
    fireEvent.click(within(dlg).getByRole('button', { name: 'Thêm vào Chờ huỷ' }))
    expect(read('flowv2_pool')).toHaveLength(2)

    const pane = screen.getByRole('region', { name: 'Huỷ hàng Kho C' })
    fireEvent.click(within(pane).getByRole('button', { name: 'Chọn hết' }))
    fireEvent.click(within(pane).getByRole('button', { name: /Tạo đợt huỷ \(2 mục\)/ }))
    await screen.findByText(/Gồm 2 mục/)
    expect(read('flowv2_pool')).toHaveLength(0)
    expect(read('flowv2_batches')[0].items.map(it => it.maHang)).toEqual(['B01767', 'A01264'])
    expect(screen.getAllByText('BIÊN BẢN XÁC MINH TÌNH TRẠNG HÀNG HOÁ').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: /Xuất Excel \+ Word/ }))
    await waitFor(() => expect(exportMock).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole('button', { name: /In xong → Chờ ký/ }))
    fireEvent.click(screen.getByRole('button', { name: /Đã ký đủ → kế toán xuất huỷ/ }))
    fireEvent.click(screen.getByRole('button', { name: /Kế toán đã xong → Huỷ xong/ }))
    expect(read('flowv2_batches')[0].step).toBe(3)
    expect(read('flowv2_cases')[0].step).toBe(7) // Huỷ xong
  })
})
