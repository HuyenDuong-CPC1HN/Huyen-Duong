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

// Làm xám + phóng to (cạnh dài ~3000px) + giãn tương phản + nhị phân hoá nhẹ.
async function preprocess(blob) {
  const bmp = await createImageBitmap(blob)
  const scale = Math.min(3, Math.max(1, 3000 / Math.max(bmp.width, bmp.height)))
  const w = Math.round(bmp.width * scale)
  const h = Math.round(bmp.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  ctx.drawImage(bmp, 0, 0, w, h)
  const img = ctx.getImageData(0, 0, w, h)
  const px = img.data
  const hist = new Uint32Array(256)
  for (let i = 0; i < px.length; i += 4) {
    const g = (px[i] * 299 + px[i + 1] * 587 + px[i + 2] * 114) / 1000
    px[i] = g
    hist[Math.round(g)] += 1
  }
  // Ngưỡng tương phản: bỏ 2% điểm tối nhất / sáng nhất.
  const total = w * h
  let lo = 0
  let hi = 255
  for (let acc = 0; lo < 255 && acc + hist[lo] < total * 0.02; lo += 1) acc += hist[lo]
  for (let acc = 0; hi > 0 && acc + hist[hi] < total * 0.02; hi -= 1) acc += hist[hi]
  const range = Math.max(1, hi - lo)
  for (let i = 0; i < px.length; i += 4) {
    const v = Math.min(255, Math.max(0, ((px[i] - lo) * 255) / range))
    const b = v > 150 ? 255 : 0
    px[i] = b; px[i + 1] = b; px[i + 2] = b
  }
  ctx.putImageData(img, 0, 0)
  return canvas
}

// Trả về chữ đọc được (giữ xuống dòng theo dòng in trên phiếu).
export async function ocrImage(blob) {
  const worker = await getWorker()
  let input = blob
  try { input = await preprocess(blob) } catch { /* trình duyệt không xử lý được ảnh (vd HEIC) — đọc ảnh gốc */ }
  const { data } = await worker.recognize(input)
  return data.text || ''
}
