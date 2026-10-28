import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import QuyCachTab from '../QuyCachTab'
import { nxtXml } from '../../utils/__tests__/nxtXmlFixture'

const store = vi.hoisted(() => {
  const values = new Map()
  return { values, opsStore: { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, String(v)), removeItem: k => values.delete(k) } }
})
vi.mock('../../data/workspace', () => ({ opsStore: store.opsStore }))

beforeEach(() => store.values.clear())
afterEach(() => cleanup())

// số liệu giả lập
const F3 = [
  ['Z00001', 'Zinc - Hộp 10 vỉ', '020101', 'HOP', 'Z1', '2027-01-01', 0, 900, 890, 10],
  ['J00602', 'Siro B - Hộp 1 lọ 100ml', '020102', 'LO', 'S9', '2027-05-01', 0, 90, 70, 20],
  ['D00004', 'Dopamin', '020108', 'ONG', 'D1', '2027-03-01', 0, 500, 500, 0],
]
const saved = () => JSON.parse(store.values.get('quycach_hang'))

describe('Quy cách hàng hoá', () => {
  it('tải file lấy danh sách mã (kho đang dự trù), nhập số lượng 1 kiện, lọc chưa nhập, dán từ Excel', async () => {
    render(<QuyCachTab />)
    expect(screen.getByText(/Chưa có mã nào/)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Tải file lấy danh sách hàng'), { target: { files: [new File([nxtXml('01/08/2026', '28/10/2026', F3)], 'nxt.xml')] } })
    await waitFor(() => expect(screen.getByText(/thêm 2 mã mới/)).toBeInTheDocument())
    const table = screen.getByRole('region', { name: 'Danh sách quy cách' })
    expect(within(table).queryByText('Dopamin')).not.toBeInTheDocument() // kho 020108 không dự trù
    const input = screen.getByLabelText('Số lượng 1 kiện Z00001')
    fireEvent.change(input, { target: { value: '200' } })
    fireEvent.blur(input)
    expect(saved().Z00001).toMatchObject({ ten: 'Zinc - Hộp 10 vỉ', dvt: 'HOP', kien: 200 })
    fireEvent.click(screen.getByRole('button', { name: /Chưa nhập \(1\)/ }))
    expect(within(table).queryByText('Zinc - Hộp 10 vỉ')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Dán từ Excel' }))
    fireEvent.change(screen.getByLabelText('Nội dung dán từ Excel'), { target: { value: 'J00602\t48\tthùng 48 lọ\nX99999\t10' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cập nhật' }))
    expect(saved().J00602).toMatchObject({ kien: 48, note: 'thùng 48 lọ' })
    expect(screen.getByText(/Đã cập nhật 1 mã. Bỏ qua 1 dòng/)).toBeInTheDocument()
    // tải lại file: số đã nhập giữ nguyên
    fireEvent.change(screen.getByLabelText('Tải file lấy danh sách hàng'), { target: { files: [new File([nxtXml('01/08/2026', '28/10/2026', F3)], 'nxt.xml')] } })
    await waitFor(() => expect(screen.getByText(/thêm 0 mã mới/)).toBeInTheDocument())
    expect(saved().Z00001.kien).toBe(200)
  })
})
