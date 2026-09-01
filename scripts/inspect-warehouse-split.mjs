import * as XLSX from 'xlsx'
import fs from 'node:fs'
import path from 'node:path'

const excelPath = path.join('C:/Users/PhuTV/Downloads', 'Danh sách hàng xuất phiếu DH240826-15182;DH250826_18775.xlsx')
const buf = fs.readFileSync(excelPath)
const wb = XLSX.read(buf, { type: 'buffer', cellDates: true })
const ws = wb.Sheets[wb.SheetNames[0]]
const grid = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null })
const headers = grid[0]
const idx = Object.fromEntries(headers.map((h, i) => [h, i]))

function bucket(viTri) {
  const v = String(viTri || '')
  if (/^P4\.|^P5\.|^MLC|^Kem\.|^Kho hoa quả|^Kho bưởi/i.test(v)) return 'LGT'
  if (/^P1\.|^P4\.A0/i.test(v)) return 'C'
  return 'OTHER'
}

const counts = { C: 0, LGT: 0, OTHER: 0 }
for (let i = 1; i < grid.length; i++) {
  const b = bucket(grid[i][idx['Vị trí cần']])
  counts[b] += 1
  if (b === 'OTHER') console.log('OTHER', grid[i][idx['Mã']], grid[i][idx['Vị trí cần']])
}
console.log(counts)

// Try split by first location token only
const byFirst = {}
for (let i = 1; i < grid.length; i++) {
  const viTri = String(grid[i][idx['Vị trí cần']] || '')
  const first = viTri.split('|')[0].trim().split('.')[0]
  byFirst[first] = (byFirst[first] || 0) + 1
}
console.log('by first token', byFirst)
