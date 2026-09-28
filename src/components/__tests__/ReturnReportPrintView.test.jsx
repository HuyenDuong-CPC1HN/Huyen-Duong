import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ReturnRecordView from '../ReturnRecordView'

afterEach(() => {
  cleanup()
  document.body.removeAttribute('data-rrp-print')
  vi.restoreAllMocks()
})

function makeRecord(overrides = {}) {
  return {
    id: 'r1', entity: 'donC', customerName: 'Công ty TNHH Bệnh Viện Quốc tế City',
    repAccounting: 'Lưu Thị Thuỳ', repSales: 'Nguyễn Văn A', createdAt: '2026-09-26T08:30:00.000Z',
    invoices: [], giaTriBangChu: '', returnReason: '',
    products: [{ tenHang: 'Zenace - Hộp 10 ống 10ml', soLo: '010526', hanDung: '15/05/2029', donViTinh: 'Hộp 10 ống', soLuong: 80, quyCach: 'Hộp 10 ống', tinhTrang: 'Hàng nguyên vẹn' }],
    verifyDatetime: '2026-09-26T08:30:00.000Z', verifyLocation: 'CN.Hồ Chí Minh',
    verifyResult: 'Kiểm tra hàng đúng lô, đúng hạn dùng, đúng số lượng.',
    ...overrides,
  }
}

// Nút "In" mới thêm — bấm là đánh dấu đúng loại biên bản vào document.body rồi gọi window.print() ngay,
// không qua tải file .docx. Test xác nhận: (1) đánh dấu đúng data-rrp-print, (2) gọi window.print(), (3)
// nội dung 2 khung ẩn sẵn (Xác minh/Trả hàng) khớp đúng dữ liệu record, đổi đúng theo entity (donC/donDTP).
describe('ReturnRecordView — nút "In trực tiếp" biên bản', () => {
  it('bấm "In Xác minh" -> đánh dấu data-rrp-print="xacMinh" và gọi window.print()', () => {
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {})
    render(<ReturnRecordView record={makeRecord()} onClose={() => {}} onEdit={() => {}} onExport={() => {}} exportingId={null} />)

    fireEvent.click(screen.getByText('In Xác minh'))

    expect(document.body.getAttribute('data-rrp-print')).toBe('xacMinh')
    expect(printSpy).toHaveBeenCalledTimes(1)
  })

  it('bấm "In Trả hàng" -> đánh dấu data-rrp-print="traHang" và gọi window.print()', () => {
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {})
    render(<ReturnRecordView record={makeRecord()} onClose={() => {}} onEdit={() => {}} onExport={() => {}} exportingId={null} />)

    fireEvent.click(screen.getByText('In Trả hàng'))

    expect(document.body.getAttribute('data-rrp-print')).toBe('traHang')
    expect(printSpy).toHaveBeenCalledTimes(1)
  })

  it('khung in Xác minh (donC) hiện đúng dữ liệu record + label riêng của CPC1HN', () => {
    vi.spyOn(window, 'print').mockImplementation(() => {})
    render(<ReturnRecordView record={makeRecord({ entity: 'donC' })} onClose={() => {}} onEdit={() => {}} onExport={() => {}} exportingId={null} />)

    expect(screen.getByText('CÔNG TY CỔ PHẦN DƯỢC PHẨM CPC1 HÀ NỘI')).toBeInTheDocument()
    expect(screen.getByText('Giám Đốc Chi Nhánh')).toBeInTheDocument()
    expect(screen.getByText('Kế Toán Đơn Hàng')).toBeInTheDocument()
    expect(screen.getByText('Xác nhận của Quản lý chi nhánh/ văn phòng')).toBeInTheDocument()
    expect(screen.getAllByText('Lưu Thị Thuỳ').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Zenace - Hộp 10 ống 10ml').length).toBeGreaterThan(0)
  })

  it('khung in Xác minh (donDTP) đổi đúng sang label UPHARMA', () => {
    vi.spyOn(window, 'print').mockImplementation(() => {})
    render(<ReturnRecordView record={makeRecord({ entity: 'donDTP' })} onClose={() => {}} onEdit={() => {}} onExport={() => {}} exportingId={null} />)

    expect(screen.getByText('CÔNG TY CỔ PHẦN UPHARMA')).toBeInTheDocument()
    expect(screen.getByText('Tổng Giám Đốc')).toBeInTheDocument()
    expect(screen.getByText('Kế Toán')).toBeInTheDocument()
    expect(screen.getByText('Xác nhận của Quản lý')).toBeInTheDocument()
    expect(screen.queryByText('Xác nhận của Quản lý chi nhánh/ văn phòng')).not.toBeInTheDocument()
  })
})
