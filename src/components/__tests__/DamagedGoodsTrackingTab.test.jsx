import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import DamagedGoodsTrackingTab from '../DamagedGoodsTrackingTab'

const store = vi.hoisted(() => new Map())
vi.mock('../../data/workspace', () => ({ opsStore: { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) } }))
const pdfText = vi.hoisted(() => ({ value: '' }))
vi.mock('../../utils/parseGoodsReceipt', () => ({ extractPdfText: vi.fn(async () => pdfText.value) }))
const exportMocks = vi.hoisted(() => ({ exportDamagedGoodsKhoAXuLy: vi.fn(async () => {}), exportDamagedGoodsKhoAXacMinh: vi.fn(async () => {}) }))
vi.mock('../../utils/exportDamagedGoods', () => exportMocks)

afterEach(() => { cleanup(); store.clear() })
const records = () => JSON.parse(store.get('damaged_goods_records') || '[]')
const now = new Date()

describe('Hồ sơ huỷ Kho A — màn làm biên bản có xem trước để in', () => {
  it('mở hồ sơ cũ: thấy bản xem trước biên bản xử lý, sửa quy cách lưu ngay, không tự xuất file', () => {
    store.set('damaged_goods_records', JSON.stringify([{
      id: 'a1', entity: 'khoA', year: now.getFullYear(), month: now.getMonth() + 1, processedAt: `${now.toISOString().slice(0, 10)}T01:00:00.000Z`, status: 'draft',
      items: [{ maHang: 'J00633', tenHang: 'Cjel Sleep - Hộp 20 gói 15g', soLo: '070924', hanDung: '2026-09-09', dvt: 'GOI', soLuong: 2355, quyCach: '' }],
    }]))
    render(<DamagedGoodsTrackingTab />)
    expect(screen.getByText('Đã xuất')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Mở \/ In/ }))
    expect(screen.getAllByText('BIÊN BẢN XỬ LÝ SẢN PHẨM').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Cjel Sleep - Hộp 20 gói 15g').length).toBeGreaterThan(0)
    fireEvent.change(screen.getByLabelText('Quy cách dòng 1'), { target: { value: 'Hộp 20 gói' } })
    expect(records()[0].items[0].quyCach).toBe('Hộp 20 gói')
    expect(records()[0].form.xlGio).toBe('08:30')
    expect(exportMocks.exportDamagedGoodsKhoAXuLy).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Biên bản xác minh' }))
    expect(screen.getAllByText('BIÊN BẢN XÁC MINH TÌNH TRẠNG HÀNG HOÁ').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: /Đã ký đủ, gửi kế toán/ }))
    expect(records()[0].status).toBe('done')
  })

  it('thêm hồ sơ mới: tải phiếu xuất kho PDF tự điền hàng; đóng hồ sơ trống thì không để lại', async () => {
    render(<DamagedGoodsTrackingTab />)
    fireEvent.click(screen.getByRole('button', { name: /Thêm biên bản hàng huỷ/ }))
    fireEvent.click(screen.getByRole('button', { name: /Danh sách hồ sơ/ }))
    expect(records()).toHaveLength(0)

    fireEvent.click(screen.getByRole('button', { name: /Thêm biên bản hàng huỷ/ }))
    pdfText.value = 'Ngày 30 tháng 09 năm 2026 Nước SX A B C D 2 3 4 1 1 Stiprol S01123 TUBE 180 200923 26/09/2026'
    fireEvent.change(screen.getByLabelText('Tải phiếu xuất kho'), { target: { files: [new File(['%PDF'], 'pxk.pdf')] } })
    await waitFor(() => expect(records()[0]?.items).toHaveLength(1))
    expect(records()[0]).toMatchObject({ sourceFileName: 'pxk.pdf', year: 2026, month: 9 })
    expect(records()[0].items[0]).toMatchObject({ maHang: 'S01123', soLuong: 180, ghiChu: 'Hàng cận date' })
    fireEvent.click(screen.getByRole('button', { name: /Danh sách hồ sơ/ }))
    expect(within(screen.getByRole('table')).getByText('30/09/2026')).toBeInTheDocument()
  })
})
