// File mẫu đúng cấu trúc "Báo cáo tổng hợp nhập xuất tồn theo kho" (Excel dạng XML), số liệu giả lập.
const HEAD = ['Stt', 'Mã vật tư', 'Tên vật tư', 'Nhà SX', 'Mã biến thể', 'Mã kho', 'Đvt', 'Quy cách', 'Mã lô ', 'Tên lô', 'Hạn dùng', 'Đơn giá', 'Tồn đầu', 'Sl nhập', 'Sl xuất', 'Tồn cuối', 'Mã vị trí']
const cell = v => (v === null || v === undefined ? '<Cell/>' : `<Cell><Data ss:Type="String">${v}</Data></Cell>`)
export function nxtXml(from, to, lines) {
  const rows = [
    '<Row/>', '<Row/>', `<Row>${cell('Báo cáo tổng hợp nhập xuất tồn theo kho')}</Row>`, `<Row>${cell(`Từ ngày ${from} đến ngày ${to}...`)}</Row>`, '<Row/>',
    `<Row>${HEAD.map(cell).join('')}</Row>`,
    `<Row>${Array(11).fill('<Cell/>').join('')}${cell('0')}${cell('999.000')}${cell('999.000')}${cell('999.000')}${cell('999.000')}</Row>`, // dòng tổng
    ...lines.map(([ma, ten, kho, dvt, lo, hd, td, nh, x, tc], i) => `<Row>${[String(i + 1), ma, ten, null, null, kho, dvt, null, lo, lo, hd, '0.000', td, nh, x, tc, null].map(v => cell(v == null ? v : typeof v === 'number' ? v.toFixed(3) : v)).join('')}</Row>`),
  ]
  return `<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Sheet1"><Table>${rows.join('\n')}</Table></Worksheet></Workbook>`
}
