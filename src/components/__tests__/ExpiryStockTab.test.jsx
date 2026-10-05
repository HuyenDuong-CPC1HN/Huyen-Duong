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

const exportStockReportMock = vi.hoisted(() => vi.fn())
vi.mock('../../utils/exportStockReport', () => ({ exportStockReport: exportStockReportMock }))

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
    [1, 'X001', 'Hàng đã hết hạn', '020101', 'HOP', 'LOT1', addDays(-45), 0, 0, 0, 5],
    [2, 'X002', 'Hàng cận 3 tháng', '020101', 'HOP', 'LOT2', addDays(30), 0, 0, 0, 20],
    [3, 'X003', 'Hàng cận 6 tháng', '020101', 'HOP', 'LOT3', addDays(120), 0, 0, 0, 15],
    [4, 'X004', 'Hàng cận hạn 6-12 tháng', '020101', 'HOP', 'LOT4', addDays(250), 0, 0, 0, 40],
    [7, 'X007', 'Hàng còn an toàn', '020101', 'HOP', 'LOT7', addDays(700), 0, 0, 0, 12],
    [8, 'X008', 'Hàng có xuất', '020101', 'HOP', 'LOT8', addDays(700), 10, 0, 4, 6],
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
    expect(screen.queryByText('Hàng cận hạn 6-12 tháng')).not.toBeInTheDocument()
    expect(screen.queryByText('Hàng còn an toàn')).not.toBeInTheDocument()
    expect(screen.queryByText('Hàng không rõ hạn')).not.toBeInTheDocument()
    expect(screen.queryByText('Hàng đã hết tồn kho')).not.toBeInTheDocument()
    // Bảng Cận date có đúng các cột của sheet "Cận date" trong file mẫu
    expect([...document.querySelectorAll('th')].map(th => th.textContent)).toEqual([
      '', 'Stt', 'Loại', 'Mã vật tư', 'Tên vật tư', 'Mã kho', 'Đvt', 'Mã lô', 'Hạn dùng', 'Tuổi thuốc (Tháng)', 'Tồn cuối', 'Hướng xử lý',
    ])

    // Nhóm cận hạn 6–12 tháng chỉ để cảnh báo luân chuyển
    fireEvent.click(screen.getByText('Cận hạn 6–12 tháng'))
    expect(screen.getByText('Hàng cận hạn 6-12 tháng')).toBeInTheDocument()
    expect(screen.queryByText('Hàng còn an toàn')).not.toBeInTheDocument()
    expect(screen.queryByText('Hàng cận 6 tháng')).not.toBeInTheDocument()

    // Bấm "Tất cả tồn kho" phải thấy thêm hàng an toàn + không rõ hạn, vẫn không thấy hàng tồn = 0
    fireEvent.click(screen.getByText('Tất cả tồn kho'))
    expect(screen.getByText('Hàng còn an toàn')).toBeInTheDocument()
    expect(screen.getByText('Hàng không rõ hạn')).toBeInTheDocument()
    expect(screen.queryByText('Hàng đã hết tồn kho')).not.toBeInTheDocument()

    // Tab "Hàng cận date" không có phần CLC
    expect(screen.queryByText('Chậm luân chuyển (CLC)')).not.toBeInTheDocument()
  })

  // Cố định 5 cột đầu (Stt → Mã kho, cộng cột tích chọn) khi kéo ngang — mỗi cột "dính" đúng vị trí
  // cộng dồn độ rộng các cột trước nó (vì độ rộng cột có thể bị kéo đổi), cột thứ 6 trở đi không dính.
  it('5 cột đầu (Stt → Mã kho) cố định đúng offset trái khi kéo ngang, "Đvt" trở đi không cố định', async () => {
    render(<ExpiryStockTab />)
    const input = document.querySelector('input[type="file"]')
    fireEvent.change(input, { target: { files: [buildSampleFile()] } })
    await waitFor(() => expect(screen.getByText('ton-kho-thang-8.xlsx')).toBeInTheDocument())

    const headers = [...document.querySelectorAll('th')]
    const byLeft = (th) => th.style.left
    // checkbox(44) Stt(56) Loại(90) Mã vật tư(100) Tên vật tư(280) Mã kho(84) — mặc định DEFAULT_COL_WIDTH
    expect(headers[0].style.position).toBe('sticky') // cột tích chọn
    expect(byLeft(headers[0])).toBe('0px')
    expect(headers[1].style.position).toBe('sticky') // Stt
    expect(byLeft(headers[1])).toBe('44px')
    expect(headers[2].style.position).toBe('sticky') // Loại
    expect(byLeft(headers[2])).toBe('100px')
    expect(headers[3].style.position).toBe('sticky') // Mã vật tư
    expect(byLeft(headers[3])).toBe('190px')
    expect(headers[4].style.position).toBe('sticky') // Tên vật tư
    expect(byLeft(headers[4])).toBe('290px')
    expect(headers[5].style.position).toBe('sticky') // Mã kho
    expect(byLeft(headers[5])).toBe('570px')
    expect(headers[6].style.position).not.toBe('sticky') // Đvt — cột đầu tiên KHÔNG cố định
  })

  it('tab Hàng chậm luân chuyển dùng chung file đã tải ở tab Hàng cận date, chỉ hiện hàng CLC với 13 cột như sheet "CLC"', async () => {
    // Dữ liệu đã tải ở lần render trước (test phía trên) vẫn nằm trong kho dùng chung
    render(<ExpiryStockTab mode="clc" />)
    expect(screen.getByText('ton-kho-thang-8.xlsx')).toBeInTheDocument()
    expect(screen.getByText('Hàng còn an toàn')).toBeInTheDocument()
    expect(screen.queryByText('Hàng có xuất')).not.toBeInTheDocument()
    // Hàng đã nằm trong danh mục cận date (hết hạn / dưới 3 / dưới 6 tháng) không lặp lại ở tab CLC
    expect(screen.queryByText('Hàng đã hết hạn')).not.toBeInTheDocument()
    expect(screen.queryByText('Hàng cận 3 tháng')).not.toBeInTheDocument()
    expect(screen.queryByText('Hàng cận 6 tháng')).not.toBeInTheDocument()
    expect(screen.getByText('Hàng cận hạn 6-12 tháng')).toBeInTheDocument()
    expect([...document.querySelectorAll('th')].map(th => th.textContent)).toEqual([
      '', 'Stt', 'Loại', 'Mã vật tư', 'Tên vật tư', 'Mã kho', 'Đvt', 'Mã lô', 'Tên lô', 'Hạn dùng', 'Tuổi thuốc (Tháng)',
      'Tồn đầu', 'Sl nhập', 'Sl xuất', 'Tồn cuối', 'Hướng xử lý',
    ])
    expect(screen.getByRole('button', { name: /Xuất báo cáo hàng CLC/ })).toBeInTheDocument()
    expect(screen.queryByText(/Xuất biên bản hàng cận date/)).not.toBeInTheDocument()

  })

  it('cột Hướng xử lý nhập tay được và được nhớ theo tháng', async () => {
    render(<ExpiryStockTab />)
    const input = screen.getAllByPlaceholderText('Nhập hướng xử lý...')[0]
    fireEvent.change(input, { target: { value: 'Đổi trả NCC' } })
    expect(input.value).toBe('Đổi trả NCC')
    cleanup()
    render(<ExpiryStockTab />)
    expect(screen.getAllByPlaceholderText('Nhập hướng xử lý...').some(i => i.value === 'Đổi trả NCC')).toBe(true)
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
    const ws = wb.Sheets['Ton kho can date']
    const exported = XLSX.utils.sheet_to_json(ws)
    expect(exported.map(r => r['Mã vật tư'])).toEqual(['X001', 'X002', 'X003'])
    // Mỗi cột phải có độ rộng riêng — tránh chữ cột này dính vào cột kế bên khi mở bằng Excel
    expect(ws['!cols']).toHaveLength(13)
    expect(ws['!cols'].every(c => c.wch >= 8)).toBe(true)
    expect(exported.map(r => Object.keys(r))).toEqual(exported.map(() => [
      'Stt', 'Mã vật tư', 'Tên vật tư', 'Mã kho', 'Đvt', 'Mã lô', 'Tên lô',
      'Hạn dùng', 'Tuổi thuốc (Tháng)', 'Tồn đầu', 'Sl nhập', 'Sl xuất', 'Tồn cuối',
    ]))
    const expired = exported.find(r => r['Mã vật tư'] === 'X001')
    expect(expired['Mã lô']).toBe('LOT1')
    expect(expired['Tên lô']).toBe('LOT1')
    expect(expired['Tuổi thuốc (Tháng)']).toBeLessThan(0)
  })

  it('kéo mép cột để đổi độ rộng, lưu lại, và có thể đặt lại về mặc định', async () => {
    const { container } = render(<ExpiryStockTab />)
    const file = buildSampleFile()
    const input = document.querySelector('input[type="file"]')
    fireEvent.change(input, { target: { files: [file] } })
    await waitFor(() => expect(screen.getByText('ton-kho-thang-8.xlsx')).toBeInTheDocument())

    const firstTh = container.querySelectorAll('th')[3] // "Mã vật tư"
    const handle = firstTh.querySelector('.cursor-col-resize')
    expect(handle).toBeTruthy()

    fireEvent.mouseDown(handle, { clientX: 100 })
    fireEvent.mouseMove(document, { clientX: 160 }) // kéo sang phải 60px
    fireEvent.mouseUp(document)

    await waitFor(() => {
      const saved = JSON.parse(store.opsStore.getItem('expiry_stock_colwidths') || '{}')
      expect(saved['Mã vật tư']).toBeGreaterThanOrEqual(60)
    })
    expect(firstTh.style.width).not.toBe('100px') // đã đổi khỏi mặc định

    fireEvent.click(screen.getByText('Đặt lại độ rộng cột'))
    expect(store.opsStore.getItem('expiry_stock_colwidths')).toBeNull()
    expect(container.querySelectorAll('th')[3].style.width).toBe('100px') // về lại mặc định
  })

  it('check list: mặc định chưa tích, chỉ hàng đủ tiêu chí mới tích được, báo cáo chỉ lấy hàng đã tích, lưu theo tháng', async () => {
    render(<ExpiryStockTab />)
    const exportButton = screen.getByRole('button', { name: /Xuất báo cáo hàng cận date · Kho C \(0\/3\)/ })
    expect(exportButton).toBeDisabled()

    // Xem "Tất cả tồn kho": hàng không đủ tiêu chí (an toàn) không có ô tích
    fireEvent.click(screen.getByText('Tất cả tồn kho'))
    expect(screen.queryByRole('checkbox', { name: /X007/ })).not.toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /X001/ })).not.toBeChecked()

    fireEvent.click(screen.getByRole('checkbox', { name: /X002/ }))
    expect(screen.getByRole('checkbox', { name: /X002/ })).toBeChecked()
    const button = screen.getByRole('button', { name: /Xuất báo cáo hàng cận date · Kho C \(1\/3\)/ })
    expect(button).toBeEnabled()
    fireEvent.click(button)
    await waitFor(() => expect(exportStockReportMock).toHaveBeenCalledTimes(1))
    const [{ kind, rows }] = exportStockReportMock.mock.calls[0]
    expect(kind).toBe('canDate')
    expect(rows.map(r => r.maVatTu)).toEqual(['X002'])
    expect(rows[0]).toHaveProperty('huongXuLy')

    // Dấu tích được lưu lại theo tháng; tab CLC có danh sách tích riêng
    cleanup()
    render(<ExpiryStockTab />)
    fireEvent.click(screen.getByText('Tất cả tồn kho'))
    expect(screen.getByRole('checkbox', { name: /X002/ })).toBeChecked()
    cleanup()
    render(<ExpiryStockTab mode="clc" />)
    expect(screen.getByRole('button', { name: /Xuất báo cáo hàng CLC · Kho C \(0\/3\)/ })).toBeDisabled()

    // Ô tích ở tiêu đề: tích tất cả hàng đủ tiêu chí đang hiện
    fireEvent.click(screen.getByRole('checkbox', { name: 'Tích tất cả hàng đang hiện để đưa vào báo cáo' }))
    expect(screen.getByRole('button', { name: /Xuất báo cáo hàng CLC · Kho C \(3\/3\)/ })).toBeEnabled()
  })

  it('tải thêm file Kho DTP: có nút Tất cả / Kho C / Kho DTP, cột Loại, lọc theo loại, báo cáo kèm Hướng xử lý', async () => {
    const today = new Date()
    const soon = new Date(today); soon.setDate(soon.getDate() + 20)
    const aoa = [
      ['Báo cáo tổng hợp nhập xuất tồn theo kho'],
      ['Stt', 'Mã vật tư', 'Tên vật tư', 'Mã kho', 'Đvt', 'Mã lô ', 'Hạn dùng', 'Tồn đầu', 'Sl nhập', 'Sl xuất', 'Tồn cuối'],
      [1, 'TH00893', 'Thuốc DTP cận date', '020105', 'HOP', 'D1', soon, 0, 0, 0, 9],
      [2, 'TH00894', 'Thuốc DTP kho khác', '020199', 'HOP', 'D2', soon, 0, 0, 0, 9],
    ]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Sheet1')
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
    const dtpFile = new File([buf], 'dtp.xlsx')

    render(<ExpiryStockTab />)
    fireEvent.change(screen.getByLabelText('Tải file Kho DTP'), { target: { files: [dtpFile] } })
    await waitFor(() => expect(screen.getByText('dtp.xlsx')).toBeInTheDocument())

    expect(screen.getByText('Thuốc DTP cận date')).toBeInTheDocument()
    expect(screen.queryByText('Thuốc DTP kho khác')).not.toBeInTheDocument() // kho 020199 bị loại
    expect(screen.getByText('Hàng đã hết hạn')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Kho DTP' }))
    expect(screen.getByText('Thuốc DTP cận date')).toBeInTheDocument()
    expect(screen.queryByText('Hàng đã hết hạn')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Kho C' }))
    expect(screen.queryByText('Thuốc DTP cận date')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Tất cả' }))

    // Hướng xử lý nhập tay đi cùng vào báo cáo của đúng kho
    fireEvent.click(screen.getByRole('checkbox', { name: /TH00893/ }))
    fireEvent.change(screen.getByLabelText(/Hướng xử lý TH00893/), { target: { value: 'Xuất huỷ' } })
    exportStockReportMock.mockClear()
    fireEvent.click(screen.getByRole('button', { name: /Xuất báo cáo hàng cận date · Kho DTP \(1\/1\)/ }))
    await waitFor(() => expect(exportStockReportMock).toHaveBeenCalledTimes(1))
    const [{ rows, suffix }] = exportStockReportMock.mock.calls[0]
    expect(suffix).toBe('KhoDTP')
    expect(rows).toEqual([expect.objectContaining({ maVatTu: 'TH00893', huongXuLy: 'Xuất huỷ' })])
  })
})

describe('ExpiryStockTab — mỗi tháng lưu riêng, không đè file', () => {
  function fileFor(name, range, code = 'X100') {
    const aoa = [
      [`Từ ngày ${range[0]} đến ngày ${range[1]}`],
      ['Stt', 'Mã vật tư', 'Tên vật tư', 'Mã kho', 'Đvt', 'Mã lô ', 'Hạn dùng', 'Tồn đầu', 'Sl nhập', 'Sl xuất', 'Tồn cuối'],
      [1, code, `Hàng ${name}`, '020101', 'HOP', 'L1', new Date(2030, 0, 1), 5, 0, 0, 5],
    ]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Sheet1')
    return new File([XLSX.write(wb, { type: 'array', bookType: 'xlsx' })], `${name}.xlsx`)
  }

  it('tải file Kho C của 2 tháng khác nhau cùng 1 ngày -> 2 tháng riêng, file tháng trước vẫn còn', async () => {
    store.opsStore.removeItem('expiry_stock_months')
    render(<ExpiryStockTab mode="clc" />)
    fireEvent.change(screen.getByLabelText('Tải file Kho C'), { target: { files: [fileFor('thang8', ['01/06/2026', '31/08/2026'])] } })
    await waitFor(() => expect(screen.getByText('thang8.xlsx')).toBeInTheDocument())
    fireEvent.change(screen.getByLabelText('Tải file Kho C'), { target: { files: [fileFor('thang9', ['01/07/2026', '30/09/2026'])] } })
    await waitFor(() => expect(screen.getByText('thang9.xlsx')).toBeInTheDocument())

    const months = JSON.parse(store.opsStore.getItem('expiry_stock_months'))
    expect(months.map(m => m.fileName).sort()).toEqual(['thang8.xlsx', 'thang9.xlsx'])
    fireEvent.click(screen.getByRole('button', { name: 'Tháng 08/2026' }))
    expect(screen.getByText('thang8.xlsx')).toBeInTheDocument()
  })

  it('file cũ chưa ghi loại kho: tự nhận Kho DTP theo mã vật tư, không bị coi là Kho C', () => {
    store.opsStore.setItem('expiry_stock_months', JSON.stringify([
      { id: 'dtp-old', fileName: 'dtp-cu.xlsx', uploadedAt: '2026-09-30T00:00:00.000Z', dateRange: { tuNgay: '2026-07-01', denNgay: '2026-09-30', soNgay: 91 },
        rows: [{ maVatTu: 'TH00893', tenVatTu: 'Thuốc DTP cũ', maKho: '020105', maLo: 'D1', hanDung: '2030-01-01', tonDau: 1, slNhap: 0, slXuat: 0, tonCuoi: 1 }] },
    ]))
    render(<ExpiryStockTab mode="clc" />)
    expect(screen.getByText('dtp-cu.xlsx')).toBeInTheDocument()
    expect(screen.getByText('Chưa có file Kho C')).toBeInTheDocument()
  })

  it('nút "Xử lý tháng mới": màn hình trống, tải file xong tự chuyển sang tháng của file, tháng cũ vẫn còn', async () => {
    store.opsStore.removeItem('expiry_stock_months')
    render(<ExpiryStockTab mode="clc" />)
    fireEvent.change(screen.getByLabelText('Tải file Kho C'), { target: { files: [fileFor('thang9', ['01/07/2026', '30/09/2026'])] } })
    await waitFor(() => expect(screen.getByText('thang9.xlsx')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /Xử lý tháng mới/ }))
    expect(screen.queryByText('thang9.xlsx')).not.toBeInTheDocument()
    expect(screen.getByText('Chưa có file Kho C')).toBeInTheDocument()
    expect(screen.getByText(/Đang xử lý tháng mới/)).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Tải file Kho C'), { target: { files: [fileFor('thang10', ['01/08/2026', '31/10/2026'])] } })
    await waitFor(() => expect(screen.getByText('thang10.xlsx')).toBeInTheDocument())
    expect(screen.queryByText(/Đang xử lý tháng mới/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Tháng 09/2026' }))
    expect(screen.getByText('thang9.xlsx')).toBeInTheDocument()
  })
})
