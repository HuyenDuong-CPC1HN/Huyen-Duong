import * as XLSX from 'xlsx'
import fs from 'node:fs'
import path from 'node:path'
import { extractPdfText } from '../src/utils/parseGoodsReceipt.js'

const downloads = 'C:/Users/PhuTV/Downloads'
const excelPath = path.join(downloads, 'Danh sách hàng xuất phiếu DH240826-15182;DH250826_18775.xlsx')
const pdfPath = path.join(downloads, 'BB giao nhận.pdf')

const excelBuf = fs.readFileSync(excelPath)
const wb = XLSX.read(excelBuf, { type: 'buffer', cellDates: true })
console.log('Sheets:', wb.SheetNames)
for (const name of wb.SheetNames) {
  const ws = wb.Sheets[name]
  const grid = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null })
  console.log(`\n=== Sheet: ${name} rows: ${grid.length} ===`)
  for (let i = 0; i < Math.min(30, grid.length); i++) {
    console.log(i, JSON.stringify(grid[i]))
  }
}

const pdfBuf = fs.readFileSync(pdfPath)
const pdfText = await extractPdfText(pdfBuf.buffer.slice(pdfBuf.byteOffset, pdfBuf.byteOffset + pdfBuf.byteLength))
console.log('\n=== PDF length:', pdfText.length, '===')
console.log(pdfText.slice(0, 5000))
