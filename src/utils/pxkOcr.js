// Đọc chữ từ ẢNH Phiếu xuất kho ngay trên trình duyệt bằng Tesseract.js (mã nguồn mở, miễn phí, không gửi ảnh đi
// đâu). Thư viện và bộ chữ tiếng Việt (~1,4 MB) tải từ CDN jsDelivr ở lần dùng đầu, trình duyệt giữ lại cho lần sau.
// Ảnh được làm xám, phóng to, tăng tương phản trước khi đọc (đọc đúng hơn hẳn với ảnh chụp điện thoại).

const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/tesseract.min.js'
let loading = null
let workerPromise = null

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

async function getWorker() {
  if (!workerPromise) {
    workerPromise = loadTesseract().then(T => T.createWorker('vie')).catch(err => { workerPromise = null; throw err })
  }
  return workerPromise
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
  const worker = await getWorker()
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
}
