import * as XLSX from 'xlsx'
import fs from 'node:fs'
import path from 'node:path'

const excelPath = path.join('C:/Users/PhuTV/Downloads', 'Danh sách hàng xuất phiếu DH240826-15182;DH250826_18775.xlsx')
const buf = fs.readFileSync(excelPath)
const wb = XLSX.read(buf, { type: 'buffer', cellDates: true })
const ws = wb.Sheets[wb.SheetNames[0]]
const grid = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null })

for (let i = 0; i < grid.length; i++) {
  const rowStr = JSON.stringify(grid[i])
  if (/15182|18775|DH|Kho|LGT/i.test(rowStr)) console.log('marker row', i, rowStr)
}

// Compare sums
const headers = grid[0]
const idx = Object.fromEntries(headers.map((h, i) => [h, i]))
let totalLuong = 0
const codes = []
for (let i = 1; i < grid.length; i++) {
  totalLuong += Number(grid[i][idx['Lượng cần']] || 0)
  codes.push(grid[i][idx['Mã']])
}
console.log('rows', grid.length - 1, 'total luong', totalLuong)
console.log('first 5', codes.slice(0, 5), 'last 5', codes.slice(-5))
