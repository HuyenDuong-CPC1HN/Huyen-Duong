import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const pdfBuf = fs.readFileSync(path.join('C:/Users/PhuTV/Downloads', 'BB giao nhận.pdf'))
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
const compact = chunks.join(' ').replace(/\s+/g, ' ')

const lot = String.raw`(?:\d{4,6}(?:GMP|SDKM|F\d{2,3})?|\d{3,6}[A-Z]\d{2,3}|\d{5,6}\.\w+)`
const re = new RegExp(String.raw`([A-Z]\d{4,5})\s+(.+?)\s+(${lot})\s+(\d+)\s+(\d+)\s+(\d+)`, 'g')

let n = 0
for (const m of compact.matchAll(re)) {
  if (n >= 12) break
  console.log({ ma: m[1], lo: m[3], kLe: m[4], kNg: m[5], sl: m[6], ten: m[2].slice(0, 40) })
  n++
}

const allMatches = [...compact.matchAll(re)]
console.log('total matches:', allMatches.length)
