import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { buildReceiptFromFiles, parsePdfDeliveryNote, readWarehouseExportRows } from '../src/utils/parseGoodsReceipt.js'

const downloads = 'C:/Users/PhuTV/Downloads'
const excelPath = path.join(downloads, 'Danh sách hàng xuất phiếu DH240826-15182;DH250826_18775.xlsx')
const pdfPath = path.join(downloads, 'BB giao nhận.pdf')

const excelBuf = fs.readFileSync(excelPath)
const pdfBuf = fs.readFileSync(pdfPath)

const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(
  path.join(process.cwd(), 'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs'),
).href
const doc = await pdfjs.getDocument({ data: Uint8Array.from(pdfBuf) }).promise
const chunks = []
for (let p = 1; p <= doc.numPages; p++) {
  const page = await doc.getPage(p)
  const content = await page.getTextContent()
  chunks.push(content.items.map(i => i.str).join(' '))
}
const text = chunks.join('\n')

const pdfRows = parsePdfDeliveryNote(text)
const excelRows = readWarehouseExportRows(excelBuf)
const result = buildReceiptFromFiles({ excelCBuffer: excelBuf, pdfText: text })

console.log(JSON.stringify({
  excelRows: excelRows.length,
  pdfRows: pdfRows.length,
  khoC: result.khoC.length,
  khoLgt: result.khoLgt.length,
  khoCSample: result.khoC.slice(0, 2),
  khoLgtSample: result.khoLgt.slice(0, 3),
  khoLgtNeedsManual: result.khoLgt.filter(r => r.needsManual).length,
}, null, 2))
