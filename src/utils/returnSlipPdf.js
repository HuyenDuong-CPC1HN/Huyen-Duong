// Đọc PDF "Biên bản trả lại hàng" in từ website thành các dòng chữ (gom theo toạ độ dọc, trái sang phải) để
// parseReturnSlipLines (returnSlips.js) tách thông tin.
export async function extractPdfLines(arrayBuffer) {
  try {
    const pdfjs = await import('pdfjs-dist/build/pdf.mjs')
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()
    const data = arrayBuffer instanceof Uint8Array ? arrayBuffer : new Uint8Array(arrayBuffer)
    const doc = await pdfjs.getDocument({ data }).promise
    const lines = []
    for (let pageNum = 1; pageNum <= doc.numPages; pageNum += 1) {
      const page = await doc.getPage(pageNum)
      const content = await page.getTextContent()
      const byY = new Map()
      for (const item of content.items) {
        if (!item.str || !item.str.trim()) continue
        const y = Math.round(item.transform[5])
        const key = [...byY.keys()].find(k => Math.abs(k - y) <= 2) ?? y
        const row = byY.get(key) || []
        row.push({ x: item.transform[4], str: item.str })
        byY.set(key, row)
      }
      for (const y of [...byY.keys()].sort((a, b) => b - a)) {
        lines.push(byY.get(y).sort((a, b) => a.x - b.x).map(it => it.str).join(' '))
      }
    }
    return lines
  } catch (err) {
    throw new Error(`Không đọc được nội dung file PDF (${err?.message || err}).`, { cause: err })
  }
}
