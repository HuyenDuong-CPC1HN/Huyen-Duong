import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as XLSX from 'xlsx'
import ExcelUpload from '../ExcelUpload'

afterEach(cleanup)

function buildFile(fileName, headerRow, dataRow) {
  const aoa = [headerRow, dataRow]
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
  return new File([buf], fileName, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}

// Bug thật đã gặp: cột "Ngày tạo" (file Đơn SO, dùng làm Mốc 1 khi đối soát SPX ngoại sàn — xem
// reconcileNgoaiSan.js) không nằm trong DATETIME_COLUMNS nên bị đọc qua dateNF: 'dd/mm/yyyy', CẮT MẤT
// giờ — khiến parseDonSoNgayTao không khớp được dòng nào, toàn bộ đơn SPX báo "không khớp Mã đơn".
describe('ExcelUpload — cột "Ngày tạo" (file Đơn SO) phải giữ nguyên giờ, không bị cắt như các cột ngày thường', () => {
  it('ô Excel kiểu Date có giờ -> "Ngày tạo" ra đúng "dd/mm/yyyy HH:mm" (giữ giờ)', async () => {
    const onData = vi.fn()
    render(<ExcelUpload onData={onData} fileName="" onClear={() => {}} />)

    const file = buildFile('donso.xlsx', ['Mã vận đơn', 'Ngày tạo'], ['SPXVN001', new Date(2026, 9, 2, 16, 22, 0)])
    fireEvent.change(document.querySelector('input[type="file"]'), { target: { files: [file] } })

    await waitFor(() => expect(onData).toHaveBeenCalledTimes(1))
    expect(onData.mock.calls[0][0][0]['Ngày tạo']).toBe('02/10/2026 16:22')
  })

  it('cột ngày thường (không trong DATETIME_COLUMNS) vẫn bị cắt giờ như cũ (không phá hành vi cũ)', async () => {
    const onData = vi.fn()
    render(<ExcelUpload onData={onData} fileName="" onClear={() => {}} />)

    const file = buildFile('khac.xlsx', ['Mã vận đơn', 'Ngày khác'], ['SPXVN002', new Date(2026, 9, 2, 16, 22, 0)])
    fireEvent.change(document.querySelector('input[type="file"]'), { target: { files: [file] } })

    await waitFor(() => expect(onData).toHaveBeenCalledTimes(1))
    expect(onData.mock.calls[0][0][0]['Ngày khác']).not.toContain('16:22')
  })
})
