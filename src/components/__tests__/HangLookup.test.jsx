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
})
afterEach(cleanup)

describe('HangLookup', () => {
  it('tra cứu nhập trả lại: tìm theo lô, mở ngăn chi tiết, mở phiếu; đổi sang hàng huỷ thì không mở được phiếu từ đây', () => {
    const onOpen = vi.fn()
    render(<HangLookup loai="tra" onBack={() => {}} onOpen={onOpen} />)
    fireEvent.change(screen.getByLabelText('Tìm kiếm'), { target: { value: '010526' } })
    fireEvent.click(screen.getByText('Actiso Viet'))
    fireEvent.click(screen.getByRole('button', { name: /Mở phiếu/ }))
    expect(onOpen).toHaveBeenCalledWith('s1', 'tra')

    fireEvent.click(screen.getByRole('button', { name: 'Hàng huỷ' }))
    fireEvent.click(screen.getByText('Progermila'))
    expect(screen.queryByRole('button', { name: /Mở phiếu/ })).not.toBeInTheDocument()
    expect(screen.getByText(/Muốn mở phiếu, vào tab Theo dõi hàng huỷ/)).toBeInTheDocument()
  })

  it('lọc kho và tổng hợp theo hàng', () => {
    render(<HangLookup loai="huy" onBack={() => {}} onOpen={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Kho C' }))
    expect(screen.getByText('Không có hàng phù hợp. Thử bỏ bớt bộ lọc.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Kho DTP' }))
    fireEvent.click(screen.getByRole('button', { name: 'Tổng hợp theo hàng' }))
    expect(screen.getAllByText('100').length).toBeGreaterThan(0) // tổng số lượng của hàng Progermila + ô thống kê
  })
})
