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
  downloadPxkFile: vi.fn(async () => new ArrayBuffer(4)),
}))
vi.mock('../../utils/parseGoodsReceipt', async orig => ({
  ...(await orig()),
  extractPdfText: vi.fn(async () => 'PHIẾU XUẤT KHO Số: FX126/005804'),
  readActualScanRows: vi.fn(() => [{ maHang: 'C02918', tenHang: 'Conadin', soLo: '011026', soLuong: 154, maTem: 'T0001', stt: '1', kho: '' }]),
  parsePdfItems: vi.fn(() => (parseItemsMock.empty ? [] : [
    { maHang: 'C02918', tenHang: 'Conadin Roll-on Strong - Hộp 1 lọ 15ml', dvt: 'LO', soLuong: 154, soLo: '011026', hanDung: '2029-10-06', source: 'phieuXuatKho' },
  ])),
}))

const ocrMock = vi.hoisted(() => vi.fn(async () => ''))
const ocrPdfMock = vi.hoisted(() => vi.fn(async () => ['']))
vi.mock('../../utils/pxkOcr', () => ({ ocrImage: ocrMock, ocrPdfPages: ocrPdfMock, warmUpOcr: vi.fn() }))
const parseItemsMock = vi.hoisted(() => ({ empty: false }))
const aiMock = vi.hoisted(() => vi.fn(async () => { throw new Error('chưa bật AI đọc phiếu (Edge Function pxk-ocr chưa cài)') }))
vi.mock('../../data/pxkAi', () => ({ readPxkWithAi: aiMock }))

const batch = {
  id: 'b1', processedAt: '2026-10-10T03:00:00.000Z', pdfMetadata: { ngayNhap: '10/10/2026' },
  khoC: [{ maHang: 'F00629', tenHang: 'Falgankid 25 mg/ml', dvt: 'ONG', soLo: '13626G01', hanDung: '2029-07-12', slHoaDon: 3380, slThucTe: 3300 }],
  khoLgt: [{ maHang: 'C02918', tenHang: 'Conadin Roll-on Strong', dvt: 'LO', soLo: '011026', hanDung: '2029-10-06', slHoaDon: 154, slThucTe: null }],
}
beforeEach(() => { aiMock.mockReset(); aiMock.mockRejectedValue(new Error('chưa bật AI đọc phiếu (Edge Function pxk-ocr chưa cài)')); parseItemsMock.empty = false; ocrPdfMock.mockReset(); ocrPdfMock.mockResolvedValue(['']); ocrMock.mockReset(); ocrMock.mockResolvedValue(''); store.values.clear(); store.values.set('goods_receipt_batches', JSON.stringify([batch])) })
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
    expect(await screen.findByText('1 ảnh · chưa nhập dòng nào')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Nhập tay' }))
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

  it('file quét lưu theo chuyến, cảnh báo mã tem quét trùng giữa 2 kho', async () => {
    render(<DoiChieuSoSachTab />)
    const xls = name => new File(['x'], name, { type: 'application/vnd.ms-excel' })
    fireEvent.change(screen.getByLabelText('File quét Kho DTP'), { target: { files: [xls('quet_dtp.xls')] } })
    expect(await screen.findByText('quet_dtp.xls')).toBeInTheDocument()
    expect(screen.queryByRole('alert', { name: 'Mã tem trùng' })).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('File quét Kho C'), { target: { files: [xls('quet_c.xls')] } })
    const alert = await screen.findByRole('alert', { name: 'Mã tem trùng' })
    expect(within(alert).getByText('T0001')).toBeInTheDocument()
    expect(within(alert).getByText(/quet_c\.xls/)).toBeInTheDocument()
    expect(JSON.parse(store.values.get('pxk_doi_chieu')).b1.scan.DTP.files[0]).toMatchObject({ name: 'quet_dtp.xls', rows: [{ maTem: 'T0001' }] })
    fireEvent.click(screen.getByRole('button', { name: 'Bỏ file quet_c.xls' }))
    expect(screen.queryByRole('alert', { name: 'Mã tem trùng' })).not.toBeInTheDocument()
  })

  it('phiếu PDF tải lên từ trước (đang chờ nhập tay) tự đọc lại khi mở trang', async () => {
    store.values.set('pxk_doi_chieu', JSON.stringify({ b1: { phieus: [{
      id: 'p1', kho: 'DTP', kind: 'tay', name: 'PHIEU_BO_SUNG.pdf', soPhieu: 'XD2611/04824', images: [],
      files: [{ name: 'PHIEU_BO_SUNG.pdf', storagePath: 'pxk/test/a.pdf', type: 'application/pdf' }], rows: [{ rowId: 'r1', maHang: '' }],
    }], scan: { C: null, DTP: null, SO: null }, checked: [] } }))
    render(<DoiChieuSoSachTab />)
    expect(await screen.findByText('PDF gốc · tự đọc 1 dòng')).toBeInTheDocument()
    expect(screen.queryByText('chưa nhập dòng nào')).not.toBeInTheDocument()
    expect(JSON.parse(store.values.get('pxk_doi_chieu')).b1.phieus[0]).toMatchObject({ kind: 'pdf', autoRead: true, rows: [{ maHang: 'C02918' }] })
  })

  it('ảnh phiếu: app đọc chữ, dòng khớp thực nhận tự xác nhận, chỉ dòng lệch cần soát', async () => {
    ocrMock.mockResolvedValue('Ngày 09 tháng 10 năm 2026 Số: FX126/005804\n'
      + '1 C02918 | Conadin Roll-on Strong - Hộp 1 DTP-VNM |LO 154,000 V |011026 v | 06/10/2029\n'
      + '2 L01286 | Laforin - Hộp 1 lọ 500ml DITP-VNM  |LO 56000 vý |010826 | 17/08/2029')
    render(<DoiChieuSoSachTab />)
    fireEvent.change(screen.getByLabelText('Chụp ảnh phiếu Kho DTP'), { target: { files: [new File(['jpg'], 'IMG_1.jpg', { type: 'image/jpeg' })] } })
    // C02918 khớp thực nhận (154, lô 011026) → tự xác nhận; L01286 không có trong thực nhận → cần soát
    expect(await screen.findByText('1 ảnh · đọc từ ảnh 2 dòng — 1 dòng cần soát')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Nhập tay phiếu' })).not.toBeInTheDocument() // không bắt mở soát
    expect(screen.getByText('FX126/005804')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Nhập tay' }))
    const editor = screen.getByRole('region', { name: 'Nhập tay phiếu' })
    expect(within(editor).getByLabelText('Số lượng dòng 2')).toHaveValue('56')
    expect(within(editor).getByLabelText('Mã VT dòng 2').closest('tr')).toHaveClass('bg-amber-50')
    expect(within(editor).getByLabelText('Mã VT dòng 1').closest('tr')).not.toHaveClass('bg-amber-50')
    fireEvent.click(within(editor).getByRole('button', { name: 'Đã soát, lệch thật' }))
    expect(screen.getByText('1 ảnh · đọc từ ảnh 2 dòng · đã soát')).toBeInTheDocument()
    expect(within(editor).getByText(/Đã soát xong/)).toBeInTheDocument()
    expect(JSON.parse(store.values.get('pxk_doi_chieu')).b1.phieus[0].rows).toMatchObject([{ maHang: 'C02918', ocr: true }, { maHang: 'L01286', ocr: true, checked: true }])
  })

  it('ảnh phiếu khớp hết thực nhận thì không cần soát', async () => {
    ocrMock.mockResolvedValue('1 C02918 | Conadin Roll-on Strong - Hộp 1 DTP-VNM |LO 154,000 V |011026 v | 06/10/2029')
    render(<DoiChieuSoSachTab />)
    fireEvent.change(screen.getByLabelText('Chụp ảnh phiếu Kho DTP'), { target: { files: [new File(['jpg'], 'IMG_2.jpg', { type: 'image/jpeg' })] } })
    expect(await screen.findByText('1 ảnh · đọc từ ảnh 1 dòng · khớp thực nhận')).toBeInTheDocument()
  })

  it('không đọc được ảnh thì báo lý do ngay dưới thẻ phiếu', async () => {
    ocrMock.mockRejectedValue(new Error('Không tải được bộ đọc chữ (kiểm tra kết nối mạng).'))
    render(<DoiChieuSoSachTab />)
    fireEvent.change(screen.getByLabelText('Chụp ảnh phiếu Kho C'), { target: { files: [new File(['jpg'], 'IMG_3.jpg', { type: 'image/jpeg' })] } })
    expect(await screen.findByText(/⚠ AI chưa đọc được \(chưa bật AI đọc phiếu.*không đọc được chữ trong ảnh \(Không tải được bộ đọc chữ/)).toBeInTheDocument()
  })

  it('PDF scan (không có chữ): app vẽ trang ra ảnh rồi đọc chữ, dòng khớp thực nhận tự xác nhận', async () => {
    parseItemsMock.empty = true
    ocrPdfMock.mockResolvedValue(['Số: FX126/005804\n1 C02918 Conadin Roll-on Strong - Hộp 1 DTP.VNM LO 154,000 V J011026 06/10/2029'])
    render(<DoiChieuSoSachTab />)
    fireEvent.change(screen.getByLabelText('+ Thêm file Kho DTP'), { target: { files: [new File(['%PDF'], 'scan.pdf', { type: 'application/pdf' })] } })
    expect(await screen.findByText('PDF scan · đọc 1 dòng · khớp thực nhận')).toBeInTheDocument()
    expect(JSON.parse(store.values.get('pxk_doi_chieu')).b1.phieus[0]).toMatchObject({ kind: 'scan', soPhieu: 'FX126/005804', rows: [{ maHang: 'C02918', soLo: '011026', ocr: true }] })
  })

  it('PDF scan nhiều trang: tách mỗi phiếu 1 thẻ; trang trùng số phiếu không tự bỏ — so sánh để anh chọn bản giữ', async () => {
    parseItemsMock.empty = true
    ocrPdfMock.mockImplementation(async (_buf, _accept, onProgress) => {
      onProgress(3, 3)
      return [
        'Số phiếu: XD2611/04789\n1 C02918 Conadin DTP-VNM LO 154,000 011026 06/10/2029',
        'Số phiếu: XD2611/04759\n1 Z00330 Zensalbu CPC1HN-VNM ONG 63.000,000 30426G02 06/07/2029',
        'Số phiếu: XID2611/04759\n1 Z00330 Zensalbu CPC1HN-VNM ONG 48.300,000 30426G02 06/07/2029',
      ]
    })
    render(<DoiChieuSoSachTab />)
    fireEvent.change(screen.getByLabelText('+ Thêm file Kho DTP'), { target: { files: [new File(['%PDF'], 'quet.pdf', { type: 'application/pdf' })] } })
    const panel = await screen.findByRole('alert', { name: 'Phiếu trùng số' })
    expect(within(panel).getByText('63.000 · 06/07/2029')).toHaveClass('bg-red-100')
    expect(within(panel).getByText('48.300 · 06/07/2029')).toHaveClass('bg-red-100')
    expect(screen.getAllByText(/Trùng số phiếu — chờ anh chọn bản giữ/)).toHaveLength(2)
    // chưa chọn: Z00330 chưa tính vào đối chiếu
    const result = screen.getByRole('region', { name: 'Kết quả đối chiếu' })
    fireEvent.click(within(result).getByRole('button', { name: /Kho DTP/ }))
    expect(within(result).queryByText('Z00330')).not.toBeInTheDocument()

    fireEvent.click(within(panel).getByRole('button', { name: 'Giữ bản 2' }))
    expect(screen.queryByRole('alert', { name: 'Phiếu trùng số' })).not.toBeInTheDocument()
    const saved = JSON.parse(store.values.get('pxk_doi_chieu')).b1.phieus
    expect(saved.map(p => [p.soPhieu, Boolean(p.excluded)])).toEqual([['XD2611/04789', false], ['XD2611/04759', true], ['XID2611/04759', false]])
    expect(within(result).getByText('Z00330')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Khôi phục' }))
    expect(await screen.findByRole('alert', { name: 'Phiếu trùng số' })).toBeInTheDocument()
  })

  it('AI (Gemini) đọc PDF scan: tách phiếu, dòng khớp thực nhận tự xác nhận, không dùng bộ đọc chữ thường', async () => {
    parseItemsMock.empty = true
    aiMock.mockResolvedValue([
      { soPhieu: 'FX126/005804', trang: [1], rows: [{ maHang: 'C02918', tenHang: 'Conadin', dvt: 'LO', soLuong: 154, soLo: '011026', hanDung: '06/10/2029' }] },
    ])
    render(<DoiChieuSoSachTab />)
    fireEvent.change(screen.getByLabelText('+ Thêm file Kho DTP'), { target: { files: [new File(['%PDF'], 'quet.pdf', { type: 'application/pdf' })] } })
    expect(await screen.findByText('PDF scan · AI đọc 1 dòng · khớp thực nhận')).toBeInTheDocument()
    expect(ocrPdfMock).not.toHaveBeenCalled()
    expect(aiMock).toHaveBeenCalledWith(expect.stringMatching(/^pxk\/test\//), 'application/pdf')
    expect(JSON.parse(store.values.get('pxk_doi_chieu')).b1.phieus[0]).toMatchObject({ kind: 'ai', soPhieu: 'FX126/005804', rows: [{ maHang: 'C02918', soLuong: 154, hanDung: '2029-10-06', ai: true }] })
  })
})
