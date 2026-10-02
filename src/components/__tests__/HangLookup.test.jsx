import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import HangLookup from '../HangLookup'

const store = vi.hoisted(() => {
  const values = new Map()
  return { values, opsStore: { getItem: (k) => values.get(k) ?? null, setItem: (k, v) => { values.set(k, String(v)) }, removeItem: (k) => values.delete(k) } }
})
vi.mock('../../data/workspace', () => ({ opsStore: store.opsStore }))

beforeEach(() => {
  store.values.clear()
  store.values.set('return_slips', JSON.stringify([{ id: 's1', maPhieu: 'DHC1', khachHang: 'Khách A', createdAt: '2026-09-29T08:00:00', stage: 'done', form: { items: [{ soLo: '010526' }] }, pdf: { mau: 'CPC1HN', items: [{ ten: 'Actiso Viet', dvt: 'ONG', soLuong: 40 }] } }]))
  store.values.set('huy_slips', JSON.stringify([{ id: 'h1', kho: 'DTP', soPhieu: 'XK1', ngayPhieu: '2026-09-30', stage: 'doing', lyDo: 'Lỗi', items: [{ maHang: 'TH1', tenHang: 'Progermila', dvt: 'Ống', soLuong: 100, soLo: '011225' }] }]))
  store.values.set('swap_return_records', JSON.stringify([{ id: 'r1', flow: 'v2', entity: 'donC', date: '2026-09-30', customerName: 'Nhà thuốc An', items: [{ maHang: 'L1', tenHang: 'Laci-eye', loLoi: '010526', dvt: 'ONG', soLuong: '6' }], nhapLaiSignedAt: 'x', nhapLaiDoneAt: 'x' }]))
})
afterEach(cleanup)

describe('HangLookup — tra cứu chung', () => {
  it('hiện cả 3 nguồn với cột Nguồn và Hướng xử lý; lọc theo nguồn và hướng', () => {
    render(<HangLookup onOpen={() => {}} />)
    expect(screen.getByText('Progermila')).toBeInTheDocument()
    expect(screen.getByText('Laci-eye')).toBeInTheDocument()
    expect(screen.getByText('Actiso Viet')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Khách trả' }))
    expect(screen.queryByText('Progermila')).not.toBeInTheDocument()
    expect(screen.getByText('Laci-eye')).toBeInTheDocument()
  })

  it('lọc theo hướng xử lý: Nhập trả lại chỉ còn hàng khách trả nguyên vẹn', () => {
    render(<HangLookup onOpen={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Nhập trả lại' }))
    expect(screen.queryByText('Laci-eye')).not.toBeInTheDocument()
    expect(screen.queryByText('Progermila')).not.toBeInTheDocument()
    expect(screen.getByText('Actiso Viet')).toBeInTheDocument()
  })

  it('bấm dòng mở ngăn chi tiết (kèm phiếu cùng lô) và nút mở phiếu báo đúng nguồn', () => {
    const onOpen = vi.fn()
    render(<HangLookup onOpen={onOpen} />)
    fireEvent.click(screen.getByText('Laci-eye'))
    expect(screen.getByText(/Các phiếu cùng hàng và số lô/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Mở phiếu/ }))
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ nguon: 'doitra', ref: 'r1' }))
  })

  it('lọc kho và tổng hợp theo hàng', () => {
    render(<HangLookup onOpen={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Kho DTP' }))
    expect(screen.queryByText('Laci-eye')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Tổng hợp theo hàng' }))
    expect(screen.getAllByText('100').length).toBeGreaterThan(0)
  })
})
