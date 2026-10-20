// Ghép các ảnh JPEG thành 1 file PDF (mỗi ảnh 1 trang) — dùng để chia PDF scan nhiều trang thành các phần nhỏ gửi AI
// đọc (hàm trên Supabase có giới hạn thời gian / bộ nhớ, file 15–20 trang gửi 1 lần bị ngắt). Ảnh JPEG nhúng nguyên
// (DCTDecode), không nén lại. pages: [{ bytes: Uint8Array (JPEG RGB), width, height }] → Uint8Array PDF.
export function jpegsToPdf(pages) {
  const enc = new TextEncoder()
  const parts = []
  const offsets = []
  let size = 0
  const push = chunk => {
    const b = typeof chunk === 'string' ? enc.encode(chunk) : chunk
    parts.push(b)
    size += b.length
  }
  const obj = (n, body) => { offsets[n] = size; push(`${n} 0 obj\n${body}\nendobj\n`) }

  push('%PDF-1.4\n%\xC7\xEC\x8F\xA2\n')
  const kids = pages.map((_, i) => `${3 + i * 3} 0 R`).join(' ')
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>')
  obj(2, `<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`)
  pages.forEach((p, i) => {
    const n = 3 + i * 3
    // Khổ trang theo tỉ lệ ảnh, cạnh dài = 842 pt (A4).
    const k = 842 / Math.max(p.width, p.height)
    const w = Math.round(p.width * k * 100) / 100
    const h = Math.round(p.height * k * 100) / 100
    const content = `q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q`
    obj(n, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im0 ${n + 1} 0 R >> >> /Contents ${n + 2} 0 R >>`)
    offsets[n + 1] = size
    push(`${n + 1} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${p.width} /Height ${p.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.bytes.length} >>\nstream\n`)
    push(p.bytes)
    push('\nendstream\nendobj\n')
    obj(n + 2, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`)
  })
  const count = 3 + pages.length * 3
  const xref = size
  push(`xref\n0 ${count}\n0000000000 65535 f \n${offsets.slice(1, count).map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`)
  push(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`)

  const out = new Uint8Array(size)
  let at = 0
  for (const b of parts) { out.set(b, at); at += b.length }
  return out
}
