import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import KeToanPage from '../KeToanPage'
import FlowV2Tab from '../FlowV2Tab'
import { advanceCase, newCase, newItem } from '../../utils/flowV2'

const store = vi.hoisted(() => {
  const values = new Map()
  return { values, opsStore: { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, String(v)), removeItem: k => values.delete(k) } }
})
vi.mock('../../data/workspace', () => ({ opsStore: store.opsStore }))
vi.mock('../../data/flowV2Files', () => ({ uploadFlowFiles: vi.fn(), getFlowFileUrl: vi.fn(async () => 'blob:test') }))
const api = vi.hoisted(() => ({ callKeToan: vi.fn() }))
vi.mock('../../data/keToanApi', async orig => ({ ...(await orig()), callKeToan: api.callKeToan }))
const ktDone = vi.hoisted(() => ({ rows: [] }))
vi.mock('../../data/flowV2Store', async orig => ({ ...(await orig()), fetchKtDone: vi.fn(async () => ktDone.rows) }))

const read = k => JSON.parse(store.values.get(k) || 'null')
beforeEach(() => { store.values.clear(); api.callKeToan.mockReset(); ktDone.rows = []; window.location.hash = '' })
afterEach(() => cleanup())

// Hồ sơ trả nguyên vẹn đã tới bước "Kế toán nhập trả lại".
function caseAtKt() {
  let s = { cases: [{ ...newCase({ kind: 'tra', sub: 'daNhan', kho: 'DTP', khachHang: 'Nhà thuốc Hải Phong', soDon: 'DU262/058586', items: [newItem({ maHang: 'TH0089', tenHang: 'Tobrameson', soLuong: 20 })] }), keToan: 'Trần Thị Ái Lâm' }], pool: [], batches: [] }
  for (let i = 0; i < 2; i++) s = { ...s, ...advanceCase(s, s.cases[0].id) }
  return s.cases[0]
}

describe('Trang kế toán (link riêng, không đăng nhập)', () => {
  const item = { kind: 'case', id: 'case_1', keToan: 'Trần Thị Ái Lâm', kho: 'DTP', viec: 'Nhập trả lại (phiếu nhập + hoá đơn)', loai: 'Trả nguyên vẹn',
    khachHang: 'Nhà thuốc Hải Phong', so: 'DU262/058586', hoaDon: { so: '0001234', kyHieu: '1C26TPH', ngay: '2026-10-20' }, since: new Date().toISOString(),
    items: [{ maHang: 'TH0089', tenHang: 'Tobrameson - Hộp 1 ống 5ml', soLo: '021025', hanDung: '2027-10-19', soLuong: 20, dvt: 'LO' }] }

  it('mở bằng mã trong link: thấy việc của mình; bấm Đã xong → xác nhận → gửi đúng việc, việc biến khỏi danh sách', async () => {
    window.location.hash = '#ketoan=abcdefghijklmnopqrstuvwxyz012345'
    api.callKeToan.mockImplementation(async b => (b.action === 'list' ? { name: 'Trần Thị Ái Lâm', items: [item] } : { ok: true }))
    render(<KeToanPage />)
    expect(await screen.findByText('Xin chào Trần Thị Ái Lâm')).toBeInTheDocument()
    expect(api.callKeToan).toHaveBeenCalledWith({ t: 'abcdefghijklmnopqrstuvwxyz012345', action: 'list' })
    const card = screen.getByRole('article', { name: /Nhà thuốc Hải Phong/ })
    expect(within(card).getByText('Tobrameson - Hộp 1 ống 5ml')).toBeInTheDocument()
    expect(within(card).getByText('19/10/2027')).toBeInTheDocument()
    expect(within(card).getByText('0001234')).toBeInTheDocument()

    fireEvent.click(within(card).getByRole('button', { name: /Đã xong/ }))
    expect(api.callKeToan).toHaveBeenCalledTimes(1) // chưa gửi, đang hỏi lại
    fireEvent.click(within(card).getByRole('button', { name: 'Đúng, đã xong' }))
    await waitFor(() => expect(api.callKeToan).toHaveBeenCalledWith({ t: 'abcdefghijklmnopqrstuvwxyz012345', action: 'done', kind: 'case', id: 'case_1' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Đã báo kho: Nhà thuốc Hải Phong')
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
    expect(screen.getByText('Không có việc nào đang chờ anh/chị.')).toBeInTheDocument()
  })

  it('link sai / đã đổi: báo lỗi từ máy chủ; link thiếu mã thì không gọi máy chủ', async () => {
    window.location.hash = '#ketoan=saimasaimasaimasaimasaimasaima12'
    api.callKeToan.mockRejectedValue(new Error('Link không đúng hoặc kho đã đổi link. Anh/chị xin kho link mới giúp.'))
    render(<KeToanPage />)
    expect(await screen.findByRole('alert')).toHaveTextContent('kho đã đổi link')
    cleanup()
    api.callKeToan.mockClear()
    window.location.hash = '#ketoan'
    render(<KeToanPage />)
    expect(screen.getByRole('alert')).toHaveTextContent('Link thiếu mã')
    expect(api.callKeToan).not.toHaveBeenCalled()
  })
})

describe('Tab Hàng trả & huỷ — phía kho', () => {
  it('Link kế toán: tạo link cho từng người (lưu mã, chép link); đổi link thì mã mới; hàng đợi việc được ghi sẵn', async () => {
    const writeText = vi.fn(async () => {})
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    store.values.set('flowv2_cases', JSON.stringify([caseAtKt()]))
    render(<FlowV2Tab />)
    expect(read('flowv2_kt_queue')).toEqual([expect.objectContaining({ keToan: 'Trần Thị Ái Lâm', khachHang: 'Nhà thuốc Hải Phong' })])
    fireEvent.click(screen.getByRole('button', { name: /Link kế toán/ }))
    const dlg = screen.getByRole('dialog', { name: 'Link kế toán' })
    expect(within(dlg).getByText('1 việc đang chờ')).toBeInTheDocument()
    const row = within(dlg).getByText('Trần Thị Ái Lâm').closest('div.py-2')
    fireEvent.click(within(row).getByRole('button', { name: /Tạo link/ }))
    const token = read('flowv2_kt_links')['Trần Thị Ái Lâm']
    expect(token).toMatch(/^[A-Za-z0-9_-]{32}$/)
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/#ketoan=${token}`)
    expect(within(row).getByLabelText('Link của Trần Thị Ái Lâm')).toHaveValue(`${window.location.origin}/#ketoan=${token}`)
    fireEvent.click(within(row).getByRole('button', { name: 'Đổi link' }))
    expect(read('flowv2_kt_links')['Trần Thị Ái Lâm']).not.toBe(token)
    expect(await within(dlg).findByRole('status')).toHaveTextContent('link cũ hết dùng được')
  })

  it('kế toán đã bấm Đã xong trên link: mở tab thì hồ sơ tự sang bước kế, báo tên kế toán, xoá khoá xác nhận', async () => {
    const c = caseAtKt()
    store.values.set('flowv2_cases', JSON.stringify([c]))
    const key = `flowv2_ktdone:case:${c.id}`
    store.values.set(key, '{}')
    ktDone.rows = [{ key, value: { kind: 'case', id: c.id, by: 'Trần Thị Ái Lâm', at: '2026-10-23T09:15:00.000Z' } }]
    render(<FlowV2Tab />)
    expect(await screen.findByText(/Kế toán đã bấm "Đã xong" trên link: Trần Thị Ái Lâm — Nhà thuốc Hải Phong/)).toBeInTheDocument()
    const saved = read('flowv2_cases')[0]
    expect(saved.step).toBe(3)
    expect(saved.ktDone).toEqual({ by: 'Trần Thị Ái Lâm (bấm trên link kế toán)', at: '2026-10-23T09:15:00.000Z' })
    expect(store.values.has(key)).toBe(false)
    expect(read('flowv2_kt_queue')).toEqual([]) // hết việc chờ kế toán
  })
})
