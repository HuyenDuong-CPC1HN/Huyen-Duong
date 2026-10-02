import { describe, expect, it } from 'vitest'
import { parseExpiryStockWorkbook, parseReportDateRange } from '../parseExpiryStock'

// File "Báo cáo tổng hợp nhập xuất tồn theo kho" xuất từ phần mềm kho dạng Excel XML 2003 (đuôi .xml). Rút gọn từ file thật.
const cell = (v, t = 'String') => `<Cell><Data ss:Type="${t}">${v}</Data></Cell>`
const row = cells => `<Row>${cells.join('')}</Row>`
const XML = `<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Sheet1"><Table>
${row([cell('Báo cáo tổng hợp nhập xuất tồn theo kho')])}
${row([cell('Từ ngày 01/07/2026 đến ngày 02/10/2026...')])}
${row(['Stt', 'Mã vật tư', 'Tên vật tư', 'Nhà SX', 'Mã biến thể', 'Mã kho', 'Đvt', 'Quy cách', 'Mã lô ', 'Tên lô', 'Hạn dùng', 'Đơn giá', 'Tồn đầu', 'Sl nhập', 'Sl xuất', 'Tồn cuối', 'Mã vị trí'].map(h => cell(h)))}
${row([cell('4'), cell('A01338'), cell('Afenemi - Hộp 4 vỉ x 5 ống 0.5ml'), cell(''), cell(''), cell('020101'), cell('ONG'), cell(''), cell('28826H01'), cell('28826H01'), cell('2029-08-22', 'DateTime'), cell('0.000', 'Number'), cell('0.000', 'Number'), cell('47880.000', 'Number'), cell('0.000', 'Number'), cell('47880.000', 'Number'), cell('')])}
</Table></Worksheet></Workbook>`

describe('đọc file Excel XML 2003 (.xml)', () => {
  const bytes = new TextEncoder().encode(XML)
  const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  it('tìm đúng cột tiếng Việt, hạn dùng và số liệu', () => {
    expect(parseExpiryStockWorkbook(buf)).toEqual([{
      maVatTu: 'A01338', tenVatTu: 'Afenemi - Hộp 4 vỉ x 5 ống 0.5ml', maKho: '020101', dvt: 'ONG', maLo: '28826H01', tenLo: '28826H01',
      hanDung: '2029-08-22', tonDau: 0, slNhap: 47880, slXuat: 0, tonCuoi: 47880,
    }])
  })
  it('đọc khoảng ngày báo cáo ở đầu file', () => {
    expect(parseReportDateRange(buf)).toEqual({ tuNgay: '2026-07-01', denNgay: '2026-10-02', soNgay: 93 })
  })
})
