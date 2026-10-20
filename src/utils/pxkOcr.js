// Đọc chữ từ ẢNH Phiếu xuất kho ngay trên trình duyệt bằng Tesseract.js (mã nguồn mở, miễn phí, không gửi ảnh đi
// đâu). Thư viện và bộ chữ tiếng Việt (~1,4 MB) tải từ CDN jsDelivr ở lần dùng đầu, trình duyệt giữ lại cho lần sau.
// Ảnh được làm xám, phóng to, tăng tương phản trước khi đọc (đọc đúng hơn hẳn với ảnh chụp điện thoại).

const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/tesseract.min.js'
let loading = null

function loadTesseract() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract)
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const s = document.createElement('script')
      s.src = TESSERACT_URL
      s.async = true
      s.onload = () => (window.Tesseract ? resolve(window.Tesseract) : reject(new Error('Không tải được bộ đọc chữ.')))
      s.onerror = () => { loading = null; reject(new Error('Không tải được bộ đọc chữ (kiểm tra kết nối mạng).')) }
      document.head.appendChild(s)
    })
  }
  return loading
}

// Nhóm bộ đọc chữ: máy đủ mạnh (≥ 4 nhân) chạy 2 bộ song song — đọc nhiều trang / nhiều phiếu nhanh gần gấp đôi.
const POOL_SIZE = typeof navigator !== 'undefined' && navigator.hardwareConcurrency >= 4 ? 2 : 1
const pool = [] // [{ worker: Promise, busy }]
const waiting = []

function ensurePool() {
  while (pool.length < POOL_SIZE) {
    const slot = { busy: false, worker: null }
    slot.worker = loadTesseract().then(T => T.createWorker('vie')).catch(err => { pool.splice(pool.indexOf(slot), 1); throw err })
    pool.push(slot)
  }
}

async function withWorker(fn) {
  ensurePool()
  let slot = pool.find(x => !x.busy)
  if (!slot) slot = await new Promise(resolve => waiting.push(resolve))
  slot.busy = true
  try { return await fn(await slot.worker) } finally {
    slot.busy = false
    const next = waiting.shift()
    if (next) { slot.busy = true; next(slot) }
  }
}

// Nạp sẵn bộ đọc chữ (gọi khi mở trang) để lúc thả phiếu vào là đọc ngay, không phải chờ tải lần đầu.
export function warmUpOcr() {
  try { ensurePool(); pool.forEach(x => x.worker.catch(() => {})) } catch { /* bỏ qua — đọc thật sẽ báo lỗi */ }
}

// Vẽ ảnh lên canvas: xoay (độ), phóng to (cạnh dài ~3000px), làm xám, giãn tương phản; binarize = nhị phân hoá.
async function prepare(blob, { rotate = 0, binarize = true } = {}) {
  const bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' })
  const scale = Math.min(3, Math.max(1, 3000 / Math.max(bmp.width, bmp.height)))
  const bw = Math.round(bmp.width * scale)
  const bh = Math.round(bmp.height * scale)
  const swap = rotate === 90 || rotate === 270
  const canvas = document.createElement('canvas')
  canvas.width = swap ? bh : bw
  canvas.height = swap ? bw : bh
  const ctx = canvas.getContext('2d')
  ctx.translate(canvas.width / 2, canvas.height / 2)
  ctx.rotate((rotate * Math.PI) / 180)
  ctx.drawImage(bmp, -bw / 2, -bh / 2, bw, bh)
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  const w = canvas.width
  const h = canvas.height
  const img = ctx.getImageData(0, 0, w, h)
  const px = img.data
  const hist = new Uint32Array(256)
  for (let i = 0; i < px.length; i += 4) {
    const g = (px[i] * 299 + px[i + 1] * 587 + px[i + 2] * 114) / 1000
    px[i] = g
    hist[Math.round(g)] += 1
  }
  // Giãn tương phản: bỏ 2% điểm tối nhất / sáng nhất.
  const total = w * h
  let lo = 0
  let hi = 255
  for (let acc = 0; lo < 255 && acc + hist[lo] < total * 0.02; lo += 1) acc += hist[lo]
  for (let acc = 0; hi > 0 && acc + hist[hi] < total * 0.02; hi -= 1) acc += hist[hi]
  const range = Math.max(1, hi - lo)
  for (let i = 0; i < px.length; i += 4) {
    let v = Math.min(255, Math.max(0, ((px[i] - lo) * 255) / range))
    if (binarize) v = v > 150 ? 255 : 0
    px[i] = v; px[i + 1] = v; px[i + 2] = v
  }
  ctx.putImageData(img, 0, 0)
  return canvas
}

// Đọc chữ trong ảnh (giữ xuống dòng theo dòng in trên phiếu). accept(text) = đọc ra dùng được chưa (vd thấy mã
// hàng); chưa được thì thử lần lượt: không nhị phân hoá (ảnh tối / bóng đèn), xoay 90° và 270° (ảnh chụp ngang).
export async function ocrImage(blob, accept = () => true) {
  return withWorker(async worker => {
    const tries = [{}, { binarize: false }, { rotate: 90 }, { rotate: 270 }]
    let best = ''
    for (const opt of tries) {
      let input
      try { input = await prepare(blob, opt) } catch { input = blob } // trình duyệt không vẽ được ảnh (vd HEIC) — đọc ảnh gốc
      const { data } = await worker.recognize(input)
      const text = data.text || ''
      if (accept(text)) return text
      if (text.length > best.length) best = text
      if (input === blob) break
    }
    return best
  })
}

async function openPdf(arrayBuffer) {
  const { importFresh } = await import('./staleChunk')
  const pdfjs = await importFresh(() => import('pdfjs-dist/build/pdf.mjs'))
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()
  // pdfjs giữ (chuyển giao) bộ nhớ của mảng truyền vào — đưa bản sao để buffer gốc còn dùng tiếp được.
  const data = arrayBuffer instanceof Uint8Array ? arrayBuffer.slice() : new Uint8Array(arrayBuffer.slice(0))
  return pdfjs.getDocument({ data }).promise
}

// Chia PDF scan nhiều trang thành các phần `size` trang (mỗi phần là 1 PDF mới ghép từ ảnh JPEG các trang, cạnh dài
// ~2000px ≈ 240 dpi) để gửi AI đọc từng phần — file 15–20 trang gửi 1 lần làm hàm trên Supabase quá giới hạn (lỗi 546).
// File ≤ size trang thì không chia (chunks rỗng). Trả về { numPages, chunks: [{ pages: [số trang], blob }] }.
export async function splitScanPdf(arrayBuffer, size = 4) {
  const doc = await openPdf(arrayBuffer)
  const numPages = doc.numPages
  if (numPages <= size) return { numPages, chunks: [] }
  const { jpegsToPdf } = await import('./jpegPdf')
  const chunks = []
  for (let start = 1; start <= numPages; start += size) {
    const pages = []
    const jpegs = []
    for (let n = start; n < start + size && n <= numPages; n += 1) {
      const page = await doc.getPage(n)
      const base = page.getViewport({ scale: 1 })
      const viewport = page.getViewport({ scale: Math.min(4, 2000 / Math.max(base.width, base.height)) })
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(viewport.width)
      canvas.height = Math.round(viewport.height)
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85))
      jpegs.push({ bytes: new Uint8Array(await blob.arrayBuffer()), width: canvas.width, height: canvas.height })
      canvas.width = 0
      pages.push(n)
    }
    chunks.push({ pages, blob: new Blob([jpegsToPdf(jpegs)], { type: 'application/pdf' }) })
  }
  return { numPages, chunks }
}

// PDF scan (trang PDF chỉ là ảnh, không có chữ bên trong): vẽ từng trang ra ảnh rồi đọc chữ như ảnh chụp, các trang
// đọc song song theo nhóm bộ đọc chữ. onProgress(đã xong, tổng). only = chỉ đọc các trang này (số trang, từ 1).
// Trả về chữ từng trang (theo thứ tự trang; trang không đọc để chuỗi rỗng).
export async function ocrPdfPages(arrayBuffer, accept = () => true, onProgress = () => {}, only = null) {
  warmUpOcr()
  const doc = await openPdf(arrayBuffer)
  const list = only ? only.filter(n => n >= 1 && n <= doc.numPages) : Array.from({ length: doc.numPages }, (_, i) => i + 1)
  let done = 0
  let next = 0
  const texts = new Array(doc.numPages).fill('')
  onProgress(0, list.length)
  // Mỗi lần chỉ vẽ số trang bằng số bộ đọc chữ (trang vẽ ra ảnh khá nặng, vẽ hết 1 lúc dễ tràn bộ nhớ).
  const runner = async () => {
    while (next < list.length) {
      const n = list[next]
      next += 1
      const page = await doc.getPage(n)
      const base = page.getViewport({ scale: 1 })
      const viewport = page.getViewport({ scale: Math.min(4, Math.max(1, 3000 / Math.max(base.width, base.height))) })
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(viewport.width)
      canvas.height = Math.round(viewport.height)
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise
      texts[n - 1] = await ocrImage(canvas, accept)
      canvas.width = 0
      done += 1
      onProgress(done, list.length)
    }
  }
  await Promise.all(Array.from({ length: POOL_SIZE }, runner))
  return texts
}
