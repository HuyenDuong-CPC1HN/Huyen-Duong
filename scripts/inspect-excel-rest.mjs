import * as XLSX from 'xlsx'
import fs from 'node:fs'
import path from 'node:path'

const downloads = 'C:/Users/PhuTV/Downloads'
const excelPath = path.join(downloads, 'Danh sách hàng xuất phiếu DH240826-15182;DH250826_18775.xlsx')
const excelBuf = fs.readFileSync(excelPath)
const wb = XLSX.read(excelBuf, { type: 'buffer', cellDates: true })
const ws = wb.Sheets[wb.SheetNames[0]]
const grid = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null })
console.log('All rows from 30:')
for (let i = 30; i < grid.length; i++) console.log(i, JSON.stringify(grid[i]))

// Check unique values in columns that might indicate warehouse
const headers = grid[0]
const idx = Object.fromEntries(headers.map((h, i) => [h, i]))
const viTri = new Set()
const dkvc = new Set()
for (let i = 1; i < grid.length; i++) {
  if (grid[i][idx['Vị trí cần']]) viTri.add(String(grid[i][idx['Vị trí cần']]).slice(0, 20))
  if (grid[i][idx['ĐKVC']]) dkvc.add(grid[i][idx['ĐKVC']])
}
console.log('\nSample vi tri prefixes:', [...viTri].slice(0, 15))
console.log('DKVC values:', [...dkvc])
