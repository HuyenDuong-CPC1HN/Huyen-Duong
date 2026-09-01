import * as XLSX from 'xlsx'
import fs from 'node:fs'
import path from 'node:path'

const filePath = path.join('C:/Users/PhuTV/Downloads', 'BIEN_BAN_NHAP_HANG.xlsx')
const buf = fs.readFileSync(filePath)
const wb = XLSX.read(buf, { type: 'buffer', cellDates: true, cellFormula: true, cellStyles: true })
const ws = wb.Sheets['BIEN BAN NHAP HANG']

for (const row of [14, 19, 44, 45, 108, 109]) {
  console.log(`\n--- row ${row} ---`)
  for (const col of ['A','B','C','D','E','F','G','H','I','J','K']) {
    const addr = `${col}${row}`
    if (ws[addr]) console.log(addr, JSON.stringify(ws[addr]))
  }
}

const grid = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: null })
console.log('\nlast rows:')
for (let i = 100; i < grid.length; i++) console.log(i, JSON.stringify(grid[i]))

console.log('\nrows with kien', grid.filter((r, i) => i > 11 && /kiện/i.test(JSON.stringify(r))).length)

// count data rows
let dataRows = 0
for (let i = 12; i < grid.length; i++) {
  if (grid[i]?.[0] && grid[i][0] !== 'Tổng cộng') dataRows++
  if (grid[i]?.[0] && String(grid[i][0]).includes('Tổng')) { console.log('total row', i, grid[i]); break }
}
console.log('data rows approx', dataRows)
