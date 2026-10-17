import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import DoiChieuSoSachTab from '../DoiChieuSoSachTab'

const store = vi.hoisted(() => {
  const values = new Map()
  return { values, opsStore: { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, String(v)), removeItem: k => values.delete(k) } }
})
vi.mock('../../data/workspace', () => ({ opsStore: store.opsStore }))
vi.mock('../../data/pxkFiles', () => ({
  uploadPxkFile: vi.fn(async f => ({ name: f.name, storagePath: `pxk/test/${f.name}`, type: f.type, size: f.size })),
  getPxkFileUrl: vi.fn(async () => 'blob:test'),
}))
vi.mock('../../utils/parseGoodsReceipt', async orig => ({
  ...(await orig()),
  extractPdfText: vi.fn(async () => 'PHIẾU XUẤT KHO Số: FX126/005804'),
  parsePdfItems: vi.fn(() => [
    { maHang: 'C02918', tenHang: 'Conadin Roll-on Strong - Hộp 1 lọ 15ml', dvt: 'LO', soLuong: 154, soLo: '011026', hanDung: '2029-10-06', source: 'phieuXuatKho' },
  ]),
}))

const batch = {
  id: 'b1', processedAt: '2026-10-10T03:00:00.000Z', pdfMetadata: { ngayNhap: '10/10/2026' },
  khoC: [{ maHang: 'F00629', tenHang: 'Falgankid 25 mg/ml', dvt: 'ONG', soLo: '13626G01', hanDung: '2029-07-12', slHoaDon: 3380, slThucTe: 3300 }],
  khoLgt: [{ maHang: 'C02918', tenHang: 'Conadin Roll-on Strong', dvt: 'LO', soLo: '011026', hanDung: '2029-10-06', slHoaDon: 154, slThucTe: null }],
}
beforeEach(() => { store.values.clear(); store.values.set('goods_receipt_batches', JSON.stringify([batch])) })
afterEach(() => cleanup())

describe('Đối chiếu sổ sách (PXK)', () => {
  it('PDF DTP tự đọc, ảnh CPC1 nhập tay, ra kết luận và nội dung báo Zalo', async () => {
    render(<DoiChieuSoSachTab />)
    const pdf = new File(['%PDF'], 'FX126_005804.pdf', { type: 'application/pdf' })
    fireEvent.change(screen.getByLabelText('+ Thêm file Kho DTP'), { target: { files: [pdf] } })
    expect(await screen.findByText('FX126/005804')).toBeInTheDocument()
    expect(screen.getByText('PDF gốc · tự đọc 1 dòng')).toBeInTheDocument()

    const img = new File(['jpg'], 'phieu.jpg', { type: 'image/jpeg' })
    fireEvent.change(screen.getByLabelText('Chụp ảnh phiếu Kho C'), { target: { files: [img] } })
    const editor = await screen.findByRole('region', { name: 'Nhập tay phiếu' })
    fireEvent.change(within(editor).getByLabelText('Số phiếu'), { target: { value: 'XD2611/04592' } })
    fireEvent.change(within(editor).getByLabelText('Mã VT dòng 1'), { target: { value: 'F00629' } })
    fireEvent.change(within(editor).getByLabelText('Số lượng dòng 1'), { target: { value: '3.380,000' } })
    fireEvent.blur(within(editor).getByLabelText('Số lượng dòng 1'))
    fireEvent.change(within(editor).getByLabelText('Lô dòng 1'), { target: { value: '13626G01' } })
    fireEvent.change(within(editor).getByLabelText('Hạn dùng dòng 1'), { target: { value: '12/07/2029' } })
    fireEvent.blur(within(editor).getByLabelText('Hạn dùng dòng 1'))
    expect(within(editor).getByLabelText(/Chụp thêm trang/)).toBeInTheDocument() // phiếu nhiều trang chụp tiếp, không giới hạn
    fireEvent.click(within(editor).getByRole('button', { name: /Xong/ }))

    const saved = JSON.parse(store.values.get('pxk_doi_chieu')).b1
    expect(saved.phieus.find(p => p.kho === 'C')).toMatchObject({ kind: 'anh', soPhieu: 'XD2611/04592', images: [{ storagePath: 'pxk/test/phieu.jpg' }] })
    expect(saved.phieus.find(p => p.kho === 'C').rows[0]).toMatchObject({ soLuong: 3380, hanDung: '2029-07-12' })

    const result = screen.getByRole('region', { name: 'Kết quả đối chiếu' })
    expect(within(result).getByText('Sổ sách thừa')).toBeInTheDocument() // thực nhận 3.300 < phiếu 3.380
    const report = screen.getByLabelText('Nội dung báo đầu nguồn')
    expect(report.value).toContain('XD2611/04592')
    expect(report.value).toContain('phiếu 3.380, thực nhận 3.300 ONG (thừa phiếu 80)')
    fireEvent.click(within(result).getByRole('button', { name: /Kho DTP/ }))
    expect(within(result).getByText('Khớp', { selector: 'span.rounded' })).toBeInTheDocument()
  })

  it('chưa có chuyến nhập hàng thì nhắc làm ở mục Nhập hàng trước', () => {
    store.values.clear()
    render(<DoiChieuSoSachTab />)
    expect(screen.getByText(/Chưa có chuyến nhập hàng nào đã lưu/)).toBeInTheDocument()
  })
})
