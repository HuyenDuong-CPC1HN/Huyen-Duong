import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import DuTruHangTab from '../DuTruHangTab'
import { nxtXml } from '../../utils/__tests__/nxtXmlFixture'

const store = vi.hoisted(() => {
  const values = new Map()
  return { values, opsStore: { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, String(v)), removeItem: k => values.delete(k) } }
})
vi.mock('../../data/workspace', () => ({ opsStore: store.opsStore }))
const blobs = vi.hoisted(() => new Map()) // giả lập Supabase Storage
vi.mock('../../data/storageFiles', () => ({ createStorageFilesRepository: () => ({
  writeJson: async (path, v) => { blobs.set(path, JSON.parse(JSON.stringify(v))); return path },
  readJson: async path => { if (!blobs.has(path)) throw new Error('không tìm thấy tệp'); return blobs.get(path) },
  remove: async path => { blobs.delete(path) },
}) }))
vi.mock('../../supabase', () => ({ supabase: {} }))

beforeEach(() => { store.values.clear(); blobs.clear() })
afterEach(() => cleanup())

// [mã, tên, mã kho, ĐVT, lô, hạn dùng, tồn đầu, nhập, xuất, tồn cuối] — số liệu giả lập
const F3 = [
  ['Z00001', 'Zinc - Hộp 10 vỉ', '020101', 'HOP', 'Z1', '2027-01-01', 0, 900, 890, 10],
  ['B00002', 'Siro B - Hộp 1 lọ 100ml', '020101', 'LO', 'S1', '2027-05-01', 50, 400, 420, 30],
  ['J00602', 'Siro B - Hộp 1 lọ 100ml', '020102', 'LO', 'S9', '2027-05-01', 0, 90, 70, 20],
  ['A00003', 'Amoxicillin 500mg', '020101', 'HOP', 'A1', '2027-02-01', 300, 0, 0, 300],
  ['D00004', 'Dopamin', '020108', 'ONG', 'D1', '2027-03-01', 0, 500, 500, 0],
]
const file = (name, text) => new File([text], name, { type: 'text/xml' })
async function loadMain() {
  render(<DuTruHangTab />)
  fireEvent.change(screen.getByLabelText('Tải file 3 tháng gần nhất → hôm nay'), { target: { files: [file('nxt-3thang.xml', nxtXml('01/08/2026', '28/10/2026', F3))] } })
  return screen.findByRole('region', { name: 'Đơn chính' })
}
const planNames = region => within(region).getAllByRole('row').slice(1).map(tr => tr.children[1]?.textContent)

describe('Dự trù hàng (Kho C)', () => {
  it('chưa tải file thì nhắc tải; tải file 3 tháng thì ra bảng: chỉ kho chọn mặc định, gộp mã cùng sản phẩm, xếp theo tên A → Z', async () => {
    render(<DuTruHangTab />)
    expect(screen.getByText(/để bắt đầu dự trù/)).toBeInTheDocument()
    cleanup()
    const plan = await loadMain()
    expect(screen.getByText(/Kỳ 01\/08\/2026 – 28\/10\/2026 · 89 ngày · 5 mã/)).toBeInTheDocument()
    expect(planNames(plan)).toEqual(['Amoxicillin 500mg', 'Siro B - Hộp 1 lọ 100ml', 'Zinc - Hộp 10 vỉ']) // Dopamin ở kho 020108 không chọn
    const siro = within(plan).getByText('Siro B - Hộp 1 lọ 100ml').closest('tr')
    expect(within(siro).getByText('B00002')).toBeInTheDocument() // mã đặt hàng: mã không J / W
    expect(within(siro).getByText('gộp 2 mã')).toBeInTheDocument()
    expect(within(siro).getByLabelText('Chốt đặt B00002')).toHaveValue(String(Math.ceil(490 / 89 * 15 - 50)))
    expect(within(plan).getByText('Amoxicillin 500mg').closest('tr')).toHaveTextContent('Không bán trong kỳ')
  })

  it('tick thêm kho thì tính thêm, lựa chọn được lưu; bỏ gộp thì 2 mã thành 2 dòng', async () => {
    const plan = await loadMain()
    fireEvent.click(screen.getByLabelText('Tính kho 020108'))
    expect(planNames(plan)).toContain('Dopamin')
    expect(JSON.parse(store.values.get('dutru_settings_C')).kho).toEqual(['020101', '020102', '020108'])
    fireEvent.click(within(screen.getByLabelText('Nhóm Siro B - Hộp 1 lọ 100ml')).getByRole('button', { name: 'Không gộp' }))
    expect(within(plan).getAllByText('Siro B - Hộp 1 lọ 100ml')).toHaveLength(2)
  })

  it('chốt đặt lưu theo tuần; danh sách nhập web theo số chốt, tích đã nhập', async () => {
    const plan = await loadMain()
    const input = within(plan).getByLabelText('Chốt đặt Z00001')
    fireEvent.change(input, { target: { value: '200' } })
    fireEvent.blur(input)
    expect(JSON.parse(store.values.get('dutru_orders_C'))['2026-W44'].chot).toEqual({ Z00001: 200 })
    fireEvent.click(screen.getByRole('tab', { name: 'Nhập lên web công ty' }))
    const web = screen.getByRole('region', { name: 'Nhập lên web công ty' })
    expect(within(web).getByText('Zinc - Hộp 10 vỉ').closest('li')).toHaveTextContent('200 HOP')
    fireEvent.click(within(web).getByLabelText('Đã nhập Z00001'))
    expect(within(web).getByText(/Đã nhập 1\//)).toBeInTheDocument()
  })

  it('mã J / W chưa quy về mã nhận điều: bấm dòng, chọn mã gợi ý → gộp, đặt bằng mã nhận điều; lựa chọn được lưu', async () => {
    render(<DuTruHangTab />)
    fireEvent.change(screen.getByLabelText('Tải file 3 tháng gần nhất → hôm nay'), { target: { files: [file('nxt.xml', nxtXml('01/08/2026', '28/10/2026', [
      ...F3,
      ['E00010', 'Thuốc E - Hộp 4 vỉ x 5 ống 0.5ml', '020101', 'ONG', 'E1', '2028-01-01', 0, 400, 300, 100],
      ['J00710', 'Thuốc E - H20 0.5ml', '020102', 'ONG', 'J1', '2028-01-01', 120, 0, 120, 0],
    ]))] } })
    const plan = await screen.findByRole('region', { name: 'Đơn chính' })
    const row = within(plan).getByText('Thuốc E - H20 0.5ml').closest('tr')
    expect(row).toHaveTextContent('có thể là E00010')
    expect(row).toHaveTextContent('Chưa quy về mã nhận điều')
    fireEvent.click(row)
    const box = within(screen.getByRole('dialog', { name: 'Chi tiết mã hàng' })).getByRole('region', { name: 'Quy về mã nhận điều' })
    fireEvent.click(within(box).getByRole('button', { name: 'Gộp vào E00010' }))
    expect(JSON.parse(store.values.get('dutru_settings_C')).manual).toEqual([['E00010', 'J00710']])
    expect(within(plan).queryByText('Thuốc E - H20 0.5ml')).not.toBeInTheDocument()
    const merged = within(plan).getByText('Thuốc E - Hộp 4 vỉ x 5 ống 0.5ml').closest('tr')
    expect(merged).toHaveTextContent('E00010')
    expect(merged).toHaveTextContent('gộp 2 mã')
    expect(screen.getByRole('dialog', { name: 'Chi tiết mã hàng' })).toHaveTextContent('gộp E00010, J00710')
  })

  it('có quy cách kiện (tab Quy cách hàng hoá) thì đề xuất và số chốt mặc định tròn kiện; tải file thì thêm mã vào danh sách quy cách', async () => {
    store.values.set('quycach_hang', JSON.stringify({ B00002: { ten: 'Siro B - Hộp 1 lọ 100ml', dvt: 'LO', kien: 20, note: '', at: '' } }))
    const plan = await loadMain()
    const siro = within(plan).getByText('Siro B - Hộp 1 lọ 100ml').closest('tr')
    expect(within(siro).getByLabelText('Chốt đặt B00002')).toHaveValue('40') // cần 33 → 2 kiện × 20
    expect(siro).toHaveTextContent('2 kiện')
    expect(Object.keys(JSON.parse(store.values.get('quycach_hang'))).sort()).toEqual(['A00003', 'B00002', 'J00602', 'Z00001'])
  })

  it('file đã tải được lưu lại: mở lại tab không phải tải lại; Bỏ file thì xoá', async () => {
    await loadMain()
    await waitFor(() => expect(screen.getByText(/Đã lưu lúc/)).toBeInTheDocument())
    expect(Object.keys(JSON.parse(store.values.get('dutru_files_C')))).toEqual(['f3'])
    cleanup()
    render(<DuTruHangTab />)
    const plan = await screen.findByRole('region', { name: 'Đơn chính' })
    expect(planNames(plan)).toEqual(['Amoxicillin 500mg', 'Siro B - Hộp 1 lọ 100ml', 'Zinc - Hộp 10 vỉ'])
    expect(screen.getByText(/Kỳ 01\/08\/2026 – 28\/10\/2026 · 89 ngày · 5 mã · 5 dòng/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Bỏ file' }))
    await waitFor(() => expect(JSON.parse(store.values.get('dutru_files_C'))).toEqual({}))
    expect(blobs.size).toBe(0)
  })

  it('bấm dòng mở chi tiết: tồn theo kho, cách tính; file sai mẫu thì báo lỗi ngay ở ô', async () => {
    const plan = await loadMain()
    fireEvent.click(within(plan).getByText('Siro B - Hộp 1 lọ 100ml'))
    const detail = screen.getByRole('dialog', { name: 'Chi tiết mã hàng' })
    expect(within(detail).getAllByText('J00602').length).toBeGreaterThan(0) // bảng tồn theo kho + bảng lô
    expect(within(detail).getByText(/× 15 ngày cần đủ hàng/)).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Chi tiết mã hàng' })).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Tải file 4 tuần gần nhất → hôm nay'), { target: { files: [file('sai.csv', 'ma,ten')] } })
    await waitFor(() => expect(screen.getByText(/Không đọc được sai.csv: File không đúng dạng/)).toBeInTheDocument())
  })
})

describe('Dự trù hàng (Kho DTP)', () => {
  const XLSX_ROWS = {
    map: [['Mã SP C', 'Tên sản phẩm', 'Đơn vị', 'Số lượng', 'Quy đổi U', 'Mã SP U', 'Đơn vị U'], ['A00001', 'Thuốc A', 'ONG', '1', '1', 'TH00001', 'Ống']],
    web: [['STT', 'Mã BFO', 'Tên sản phẩm', 'Số lô', 'Hạn dùng', 'Kho', 'Lượng nhập', 'Lượng xuất', 'Lượng tồn', 'ĐVT'], [1, 'A00001', 'Thuốc A', 'L1', '11/07/28', '020105', 500, 380, 120, 'ONG']],
  }
  const xlsxFile = async (name, rows) => {
    const XLSX = await import('xlsx')
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Sheet1')
    return new File([XLSX.write(wb, { type: 'array', bookType: 'xlsx' })], name)
  }

  it('tải Fast U + bảng quy đổi + tồn Web: cột chênh lệch theo mã U (thực tế − sổ sách); bảng quy đổi được lưu', async () => {
    render(<DuTruHangTab />)
    fireEvent.click(screen.getByRole('tab', { name: /Kho DTP/ }))
    fireEvent.change(await screen.findByLabelText('Tải file Tồn sổ sách Fast U'), { target: { files: [file('fast.xml', nxtXml('01/08/2026', '28/10/2026', [['TH00001', 'Thuốc A', '020105', 'Ống', 'L1', '2028-07-11', 1500, 200, 1500, 200]]))] } })
    fireEvent.change(screen.getByLabelText('Tải file Bảng quy đổi mã C ↔ U'), { target: { files: [await xlsxFile('ma.xlsx', XLSX_ROWS.map)] } })
    fireEvent.change(screen.getByLabelText('Tải file Tồn thực tế Web'), { target: { files: [await xlsxFile('web.xlsx', XLSX_ROWS.web)] } })
    const diff = await screen.findByRole('region', { name: 'Chênh lệch tồn Kho DTP' })
    const row = (await within(diff).findByText('TH00001')).closest('tr')
    expect(row).toHaveTextContent('A00001')
    expect(row).toHaveTextContent('200')
    expect(row).toHaveTextContent('120')
    expect(row).toHaveTextContent('−80')
    expect(JSON.parse(store.values.get('dutru_map_cu')).rows).toEqual([['A00001', 'Thuốc A', 'ONG', 1, 'TH00001', 'Ống']])
    fireEvent.click(screen.getByRole('tab', { name: 'Dự trù đặt hàng' }))
    const plan = screen.getByRole('region', { name: 'Dự trù Kho DTP' })
    expect(within(plan).getByLabelText('Chốt đặt TH00001')).toHaveValue(String(Math.ceil(1500 / 89 * 15 - 120)))
  })
})
