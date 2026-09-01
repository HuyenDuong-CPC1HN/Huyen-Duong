import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const pdfPath = path.join('C:/Users/PhuTV/Downloads', 'BB giao nhận.pdf')
const buf = fs.readFileSync(pdfPath)

const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(
  path.join(process.cwd(), 'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs'),
).href

const doc = await pdfjs.getDocument({ data: Uint8Array.from(buf) }).promise
console.log('Pages:', doc.numPages)
for (let pageNum = 1; pageNum <= Math.min(doc.numPages, 5); pageNum++) {
  const page = await doc.getPage(pageNum)
  const content = await page.getTextContent()
  const text = content.items.map(item => item.str).join(' ')
  console.log(`\n=== PAGE ${pageNum} (${text.length} chars) ===`)
  console.log(text.slice(0, 3000))
}

// Also dump items with positions for first page to understand table structure
const page1 = await doc.getPage(1)
const content1 = await page1.getTextContent()
const rows = new Map()
for (const item of content1.items) {
  const y = Math.round(item.transform[5])
  if (!rows.has(y)) rows.set(y, [])
  rows.get(y).push({ x: Math.round(item.transform[4]), str: item.str })
}
const sortedYs = [...rows.keys()].sort((a, b) => b - a)
console.log('\n=== PAGE 1 ROWS BY Y (first 40) ===')
for (const y of sortedYs.slice(0, 40)) {
  const line = rows.get(y).sort((a, b) => a.x - b.x).map(i => i.str).join(' | ')
  console.log(y, line)
}
