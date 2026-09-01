import * as XLSX from 'xlsx'
import fs from 'node:fs'
import path from 'node:path'

const filePath = path.join('C:/Users/PhuTV/Downloads', 'BIEN_BAN_NHAP_HANG.xlsx')
const buf = fs.readFileSync(filePath)
const wb = XLSX.read(buf, { type: 'buffer', cellDates: true, cellFormula: true, cellStyles: true })

console.log('Sheets:', wb.SheetNames)
for (const name of wb.SheetNames) {
  const ws = wb.Sheets[name]
  const grid = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: null })
  console.log(`\n=== ${name} (${grid.length} rows) ===`)
  for (let i = 0; i < Math.min(35, grid.length); i++) {
    console.log(i, JSON.stringify(grid[i]))
  }
  // sample cell formulas
  const ref = ws['!ref']
  console.log('ref', ref)
  for (const addr of ['K6', 'L6', 'M6', 'N6', 'G6', 'H6', 'I6', 'J6']) {
    if (ws[addr]) console.log(addr, ws[addr])
  }
}
