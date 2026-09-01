import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as XLSX from 'xlsx'
import ExpiryStockTab from '../ExpiryStockTab'

const store = vi.hoisted(() => {
  const values = new Map()
  return {
    opsStore: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => { values.set(key, String(value)) },
      removeItem: (key) => values.delete(key),
    },
  }
})

vi.mock('../../data/workspace', () => ({ opsStore: store.opsStore }))

const writeFileMock = vi.hoisted(() => vi.fn())
vi.mock('xlsx', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, writeFile: writeFileMock }
})

afterEach(cleanup)

// Tái tạo cấu trúc file thật: vài dòng tiêu đề phía trên, header ở dòng có "Mã vật tư",
// dữ liệu phủ đủ các mốc: hết hạn, cận 3 tháng, cận 6 tháng, an toàn, không rõ hạn, và tồn = 0 (phải bị loại).
function buildSampleFile() {
  const today = new Date()
  const addDays = (n) => { const d = new Date(today); d.setDate(d.getDate() + n); return d }
  const aoa = [
    [],
    ['Báo cáo tổng hợp nhập xuất tồn theo kho'],
    ['Từ ngày ... đến ngày ...'],
    [],
    ['Stt', 'Mã vật tư', 'Tên vật tư', 'Mã kho', 'Đvt', 'Mã lô ', 'Hạn dùng', 'Tồn đầu', 'Sl nhập', 'Sl xuất', 'Tồn cuối'],
    [1, 'X001', 'Hàng đã hết hạn', '020101', 'HOP', 'LOT1', addDays(-10), 0, 0, 0, 5],
    [2, 'X002', 'Hàng cận 3 tháng', '020101', 'HOP', 'LOT2', addDays(30), 0, 0, 0, 20],
    [3, 'X003', 'Hàng cận 6 tháng', '020101', 'HOP', 'LOT3', addDays(120), 0, 0, 0, 15],
    [4, 'X004', 'Hàng còn an toàn', '020101', 'HOP', 'LOT4', addDays(400), 0, 0, 0, 40],
    [5, 'X005', 'Hàng không rõ hạn', '020101', 'HOP', 'LOT5', null, 0, 0, 0, 8],
    [6, 'X006', 'Hàng đã hết tồn kho', '020101', 'HOP', 'LOT6', addDays(10), 0, 0, 0, 0],
  ]
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
  return new File([buf], 'ton-kho-thang-8.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}

describe('ExpiryStockTab', () => {
  it('phân loại đúng theo mốc cận date sau khi upload, loại bỏ hàng đã hết tồn kho', async () => {
    render(<ExpiryStockTab />)
    const file = buildSampleFile()
    const input = document.querySelector('input[type="file"]')
    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() => expect(screen.getByText('ton-kho-thang-8.xlsx')).toBeInTheDocument())

    // Mặc định hiển thị tab "Cận date" — chỉ gồm hết hạn + cận 3 tháng + cận 6 tháng, không gồm an toàn/không rõ hạn/tồn=0
    expect(screen.getByText('Hàng đã hết hạn')).toBeInTheDocument()
    expect(screen.getByText('Hàng cận 3 tháng')).toBeInTheDocument()
    expect(screen.getByText('Hàng cận 6 tháng')).toBeInTheDocument()
    expect(screen.queryByText('Hàng còn an toàn')).not.toBeInTheDocument()
    expect(screen.queryByText('Hàng không rõ hạn')).not.toBeInTheDocument()
    expect(screen.queryByText('Hàng đã hết tồn kho')).not.toBeInTheDocument()

    // Bấm "Tất cả tồn kho" phải thấy thêm hàng an toàn + không rõ hạn, vẫn không thấy hàng tồn = 0
    fireEvent.click(screen.getByText('Tất cả tồn kho'))
    expect(screen.getByText('Hàng còn an toàn')).toBeInTheDocument()
    expect(screen.getByText('Hàng không rõ hạn')).toBeInTheDocument()
    expect(screen.queryByText('Hàng đã hết tồn kho')).not.toBeInTheDocument()
  })

  it('xuất Excel đúng 12 cột yêu cầu, "Tên lô" trùng "Mã lô", "Tuổi thuốc" âm khi đã hết hạn', async () => {
    render(<ExpiryStockTab />)
    const file = buildSampleFile()
    const input = document.querySelector('input[type="file"]')
    fireEvent.change(input, { target: { files: [file] } })
    await waitFor(() => expect(screen.getByText('ton-kho-thang-8.xlsx')).toBeInTheDocument())

    fireEvent.click(screen.getByText('Xuất Excel'))
    expect(writeFileMock).toHaveBeenCalledTimes(1)

    const [wb, fileName] = writeFileMock.mock.calls[0]
    expect(fileName).toMatch(/^TonKhoCanDate_CanDate_.*\.xlsx$/)
    const exported = XLSX.utils.sheet_to_json(wb.Sheets['Ton kho can date'])
    expect(exported.map(r => r['Mã vật tư'])).toEqual(['X001', 'X002', 'X003'])
    expect(exported.map(r => Object.keys(r))).toEqual(exported.map(() => [
      'Stt', 'Mã vật tư', 'Tên vật tư', 'Mã kho', 'Đvt', 'Mã lô', 'Tên lô',
      'Hạn dùng', 'Tuổi thuốc (Tháng)', 'Tồn đầu', 'Sl nhập', 'Sl xuất', 'Tồn cuối',
    ]))
    const expired = exported.find(r => r['Mã vật tư'] === 'X001')
    expect(expired['Mã lô']).toBe('LOT1')
    expect(expired['Tên lô']).toBe('LOT1')
    expect(expired['Tuổi thuốc (Tháng)']).toBeLessThan(0)
  })
})
