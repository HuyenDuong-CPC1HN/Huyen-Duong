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
  it('hồ sơ trả nguyên vẹn: vào thẳng Lập BB xác minh (có xem trước) → ký → kế toán xong → Hoàn thành', async () => {
    render(<FlowV2Tab />)
    createCase('tra', /Khách đã nhận rồi trả/)
    await screen.findByText('Lập BB xác minh (+ BB trả hàng)', { selector: 'div' })
    expect(screen.queryByText(/Tiếp nhận/)).not.toBeInTheDocument()
    expect(screen.getByText(/BB trả hàng có chữ ký khách — không bắt buộc/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /In xong → Chờ ký/ })).toBeDisabled() // chưa có dòng hàng
    fireEvent.change(screen.getByLabelText('Khách hàng'), { target: { value: 'Nhà thuốc Phước Thiện' } })
    const ma = screen.getByLabelText('Mã hàng dòng 1')
    fireEvent.change(ma, { target: { value: 'Z' } })
    expect(screen.getByLabelText('Mã hàng dòng 1')).toBe(ma) // gõ từng ký tự không mất ô
    fireEvent.change(ma, { target: { value: 'Z00330' } })
    fireEvent.change(screen.getByLabelText('Tên hàng dòng 1'), { target: { value: 'Zensalbu nebules 2.5' } })
    fireEvent.change(screen.getByLabelText('Hạn dùng dòng 1'), { target: { value: '05/07/2029' } })
    fireEvent.change(screen.getByLabelText('SL dòng 1'), { target: { value: '13' } })

    expect(screen.getAllByText('BIÊN BẢN XÁC MINH TÌNH TRẠNG HÀNG HOÁ').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Nhà thuốc Phước Thiện/).length).toBeGreaterThan(0)
    // Bước BB xác minh vẫn sửa được tên hàng (vd bỏ chữ "(Afghanistan)")
    fireEvent.change(screen.getByLabelText('Tên hàng dòng 1'), { target: { value: 'Zensalbu nebules 2.5 - Hộp 2 vỉ' } })
    expect(screen.getAllByText('Zensalbu nebules 2.5 - Hộp 2 vỉ').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: /In xong → Chờ ký/ }))
    fireEvent.click(screen.getByRole('button', { name: /Đã ký đủ → chuyển kế toán/ }))
    fireEvent.change(screen.getByLabelText('Kế toán phụ trách'), { target: { value: 'Võ Thị Ly' } })
    fireEvent.click(screen.getByRole('button', { name: /Kế toán đã xong/ }))
    const c = read('flowv2_cases')[0]
    expect(c).toMatchObject({ kind: 'tra', sub: 'daNhan', kho: 'C', khachHang: 'Nhà thuốc Phước Thiện', keToan: 'Võ Thị Ly', step: 3 })
    expect(c.items[0]).toMatchObject({ tenHang: 'Zensalbu nebules 2.5 - Hộp 2 vỉ', maHang: 'Z00330', hanDung: '2029-07-05', soLuong: 13, tinhTrang: 'Hàng nguyên vẹn' })
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
    fireEvent.change(screen.getByLabelText('Quy cách dòng 1'), { target: { value: 'Hộp 20 ống' } })
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
    expect(read('flowv2_cases')[0].step).toBe(6) // Huỷ xong
  })
})

describe('Hàng trả & huỷ (Demo) — khách từ chối nhận có Biên bản trả hàng nội bộ', () => {
  it('bước BB xác minh có thêm Biên bản trả lại hàng (nội bộ) xem trước, điền số hoá đơn / bên C, xuất Word được', async () => {
    render(<FlowV2Tab />)
    createCase('tra', /Khách từ chối nhận/)
    await screen.findByLabelText('Khách hàng')
    fireEvent.change(screen.getByLabelText('Khách hàng'), { target: { value: 'Công ty CP Bệnh viện Vạn Phúc City' } })
    fireEvent.change(screen.getByLabelText('Tên hàng dòng 1'), { target: { value: 'Zencombi - Hộp 10 lọ 2.5ml' } })
    fireEvent.change(screen.getByLabelText('SL dòng 1'), { target: { value: '100' } })
    fireEvent.change(screen.getByLabelText('Đơn giá (gồm VAT) dòng 1'), { target: { value: '12000' } })

    fireEvent.change(screen.getByLabelText('Số hoá đơn'), { target: { value: '00038621' } })
    fireEvent.change(screen.getByLabelText('Bên C'), { target: { value: 'Nguyễn Văn A' } })
    fireEvent.click(screen.getByRole('button', { name: 'BB trả hàng nội bộ' }))
    expect(screen.getAllByText('BIÊN BẢN TRẢ LẠI HÀNG (NỘI BỘ)').length).toBeGreaterThan(0)
    expect(screen.getAllByText('00038621').length).toBeGreaterThan(0)
    expect(screen.getAllByText('1,200,000 đ').length).toBeGreaterThan(0)
    const c = read('flowv2_cases')[0]
    expect(c.traHang.form.soHD).toBe('00038621')
    expect(c.traHang.pdf.benC.daiDien).toBe('Nguyễn Văn A')
  })
})

describe('Hàng trả & huỷ (Demo) — hồ sơ cũ chưa có phần biên bản trả hàng', () => {
  it('mở hồ sơ khách từ chối nhận tạo trước đó vẫn thấy BB trả hàng nội bộ', async () => {
    const { newCase: mk, newItem: it, advanceCase } = await import('../../utils/flowV2')
    const c = mk({ kind: 'tra', sub: 'tuChoi', kho: 'C', khachHang: 'Công ty CP Bệnh viện Vạn Phúc City', items: [it({ tenHang: 'Zencombi', soLuong: 100, dvt: 'ONG' })] })
    delete c.traHang
    const s = advanceCase({ cases: [c], pool: [] }, c.id)
    store.values.set('flowv2_cases', JSON.stringify(s.cases))
    render(<FlowV2Tab />)
    fireEvent.click(screen.getByText('Công ty CP Bệnh viện Vạn Phúc City'))
    fireEvent.click(await screen.findByRole('button', { name: 'BB trả hàng nội bộ' }))
    expect(screen.getAllByText('BIÊN BẢN TRẢ LẠI HÀNG (NỘI BỘ)').length).toBeGreaterThan(0)
  })
})

describe('Hàng trả & huỷ (Demo) — lấy dữ liệu từ tab cũ', () => {
  it('bấm nút thì phiếu tab cũ vào cột Hoàn thành đúng tháng, tab cũ giữ nguyên', async () => {
    const oldSlips = JSON.stringify([{ id: 'slip_1', khachHang: 'Nhà thuốc Cũ', stage: 'done', createdAt: '2026-08-02T03:00:00.000Z', doneAt: '2026-08-10T03:00:00.000Z', pdf: { mau: 'CPC1HN', items: [{ ten: 'Zensalbu', dvt: 'ONG', soLuong: 5 }] }, form: { items: [{}] } }])
    store.values.set('return_slips', oldSlips)
    store.values.set('huy_slips', JSON.stringify([{ id: 'huy_1', kho: 'C', soPhieu: 'XH01', importedAt: '2026-08-01T03:00:00.000Z', doneAt: '2026-08-03T03:00:00.000Z', items: [{ maHang: 'B1', tenHang: 'Bupi', soLuong: 2 }], form: {} }]))
    render(<FlowV2Tab />)
    fireEvent.click(screen.getByRole('button', { name: 'Lấy dữ liệu từ tab cũ' }))
    expect(screen.getByText(/Đã lấy 1 hồ sơ khách trả và 1 đợt huỷ/)).toBeInTheDocument()
    expect(store.values.get('return_slips')).toBe(oldSlips)
    expect(screen.queryByText('Nhà thuốc Cũ')).not.toBeInTheDocument() // tháng 8, cột Hoàn thành đang xem tháng này
    fireEvent.change(screen.getByLabelText('Tháng hoàn thành'), { target: { value: '2026-08' } })
    expect(screen.getByText('Nhà thuốc Cũ')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Lấy dữ liệu từ tab cũ' }))
    expect(screen.getByText(/Không có phiếu mới ở tab cũ/)).toBeInTheDocument()
    expect(read('flowv2_cases')).toHaveLength(1)
    expect(read('flowv2_batches')).toHaveLength(1)
  })
})
