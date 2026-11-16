import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const store = vi.hoisted(() => {
  const values = new Map()
  return { values, opsStore: { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, String(v)), removeItem: k => values.delete(k) } }
})
vi.mock('../../data/workspace', () => ({ opsStore: store.opsStore }))

const { default: NhapHangTab } = await import('../NhapHangTab')

afterEach(() => { cleanup(); store.values.clear() })

const row = (rowId, maHang, tenHang, soLo) => ({ rowId, maHang, tenHang, dvt: 'ONG', soLo, hanDung: '2029-08-22', kienNguyen: 1, kienLe: 0, slHoaDon: 10, slThucTe: null, ghiChu: '' })

describe('Nhập hàng — ô tìm nhanh trong bảng Kho C / Kho LGT', () => {
  it('lọc theo mã, tên (không dấu) hoặc số lô ở cả 2 bảng; xoá từ khoá thì hiện lại đủ', () => {
    store.opsStore.setItem('goods_receipt_batches', JSON.stringify([{
      id: 'b1', processedAt: '2026-10-10T05:28:00.000Z',
      khoC: [row('c1', 'A01338', 'Afenemi - Hộp 4 vỉ', '28826H01'), row('c2', 'A01264', 'Ambroxen - Hộp 4 vỉ', '010326')],
      khoLgt: [row('l1', 'G00898', 'Guacanyl - Hộp 4 vỉ', '22626G01'), row('l2', 'A01338', 'Afenemi - Hộp 4 vỉ', '99999')],
    }]))
    render(<NhapHangTab />)
    const box = screen.getByLabelText('Tìm trong bảng Kho C / Kho LGT')

    fireEvent.change(box, { target: { value: 'afenemi' } })
    expect(screen.getAllByText('1 / 2 dòng khớp')).toHaveLength(2)
    expect(screen.queryByText('Ambroxen - Hộp 4 vỉ')).toBeNull()
    expect(screen.queryByText('Guacanyl - Hộp 4 vỉ')).toBeNull()
    expect(screen.getAllByText('Afenemi - Hộp 4 vỉ')).toHaveLength(2)

    fireEvent.change(box, { target: { value: '010326' } })
    expect(screen.getByText('Ambroxen - Hộp 4 vỉ')).toBeInTheDocument()
    expect(screen.getByText(/Không có dòng nào khớp/)).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('Xoá tìm kiếm'))
    expect(screen.getByText('Guacanyl - Hộp 4 vỉ')).toBeInTheDocument()
    expect(screen.getAllByText('2 dòng')).toHaveLength(2)
  })
})

describe('Nhập hàng — chọn chuyến theo Năm > Tháng > Chuyến trong tháng', () => {
  it('năm, tháng chỉ hiện tháng của năm đó; chuyến đánh số trong tháng', () => {
    const b = (id, processedAt, ngayNhap) => ({ id, processedAt, pdfMetadata: { ngayNhap }, khoC: [row(`${id}c`, 'A01338', 'Afenemi', 'L1')], khoLgt: [] })
    store.opsStore.setItem('goods_receipt_batches', JSON.stringify([
      b('n1', '2026-11-14T06:44:00.000Z', '13/11/2026'), b('n2', '2026-11-06T15:53:00.000Z', '06/11/2026'),
      b('o1', '2026-10-31T15:40:00.000Z', '29/10/2026'), b('y1', '2025-12-20T03:00:00.000Z', '19/12/2025'),
    ]))
    render(<NhapHangTab />)
    const months = () => [...screen.getByRole('combobox', { name: 'Tháng' }).options].map(o => o.textContent)
    expect([...screen.getByRole('combobox', { name: 'Năm' }).options].map(o => o.value)).toEqual(['2026', '2025'])
    expect(months()).toEqual(['Tháng 11 (2 chuyến)', 'Tháng 10 (1 chuyến)'])
    const chuyen = screen.getByRole('group', { name: 'Chuyến trong tháng' })
    expect(chuyen.textContent).toMatch(/Chuyến 2 · nhập 13\/11\/2026/)
    expect(chuyen.textContent).toMatch(/Chuyến 1 · nhập 06\/11\/2026/)
    fireEvent.change(screen.getByRole('combobox', { name: 'Năm' }), { target: { value: '2025' } })
    expect(months()).toEqual(['Tháng 12 (1 chuyến)'])
    expect(screen.getByRole('group', { name: 'Chuyến trong tháng' }).textContent).toMatch(/Chuyến 1 · nhập 19\/12\/2025/)
  })
})
