// Edge Function "pxk-ocr": đọc Phiếu xuất kho nhà máy (PDF scan / ảnh chụp) bằng Google Gemini, trả về các phiếu và
// dòng hàng dạng JSON cho mục "Đối chiếu sổ sách". Khoá Gemini chỉ nằm ở secret GEMINI_API_KEY của Supabase — không
// bao giờ ở code hay trình duyệt. Chỉ người đã đăng nhập app gọi được (Supabase kiểm tra JWT mặc định).
//
// Vào: { url, mimeType } — url là link ký sẵn (signed URL) của file trong bucket ops-files của chính dự án này.
// Ra:  { model, phieus: [{ soPhieu, trang: [số trang], rows: [{ maHang, tenHang, dvt, soLuong, soLo, hanDung }] }] }
//      soLuong là chữ in nguyên văn trên phiếu ("30,000" = 30) — app tự đổi ra số theo quy ước phiếu (chấm nghìn, phẩy
//      thập phân); để AI tự đổi thì "30,000" hay bị hiểu nhầm thành 30000.
//
// Secret: GEMINI_API_KEY (bắt buộc), GEMINI_MODEL (tuỳ chọn — để trống thì tự chọn mô hình "flash" mới nhất
// đang có trong tài khoản, vì Google hay đổi tên mô hình).

import { encodeBase64 } from 'jsr:@std/encoding@1/base64'

const API = 'https://generativelanguage.googleapis.com/v1beta'
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const MAX_BYTES = 18 * 1024 * 1024 // Gemini nhận file gửi kèm tối đa ~20 MB / lần

const PROMPT = `Đây là bản scan / ảnh chụp các PHIẾU XUẤT KHO của nhà máy dược (mẫu CPC1 Hà Nội hoặc DTP), có thể nhiều trang.
Đọc CHÍNH XÁC từng ký tự in trong bảng, không đoán, không bịa. Bỏ qua chữ viết tay, dấu tick (✓, v), chữ ký, con dấu.
Mỗi trang có "Số phiếu" / "Số" là 1 phiếu. Trang không có số phiếu là trang tiếp của phiếu ngay trước.
Hai trang trùng số phiếu thì vẫn trả RIÊNG từng trang (không gộp, không bỏ).
Với mỗi dòng hàng lấy: maHang = "Mã vật tư" (1 chữ cái + 5 chữ số, vd F00629), tenHang = "Tên vật tư", dvt = "Đvt",
soLuong = "Số lượng" CHÉP NGUYÊN VĂN đúng như in, giữ cả dấu chấm và dấu phẩy, KHÔNG tự đổi ra số (vd "30,000", "3.380,000", "154,000"),
soLo = "Lô" (giữ nguyên chữ hoa / số, vd 13626G01), hanDung = "Hạn dùng" dạng dd/mm/yyyy (để trống nếu không có).
Ô không đọc được thì để chuỗi rỗng. Bỏ qua các dòng trống chỉ có số thứ tự.`

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    phieus: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          soPhieu: { type: 'STRING' },
          trang: { type: 'ARRAY', items: { type: 'INTEGER' } },
          rows: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                maHang: { type: 'STRING' }, tenHang: { type: 'STRING' }, dvt: { type: 'STRING' },
                soLuong: { type: 'STRING' }, soLo: { type: 'STRING' }, hanDung: { type: 'STRING' },
              },
              required: ['maHang', 'soLuong', 'soLo'],
            },
          },
        },
        required: ['soPhieu', 'rows'],
      },
    },
  },
  required: ['phieus'],
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

// Danh sách mô hình thử lần lượt: mô hình đầu bận ("high demand") / hết lượt thì chuyển sang mô hình sau.
let cachedModels: string[] = []
async function pickModels(key: string): Promise<string[]> {
  const fixed = (Deno.env.get('GEMINI_MODEL') || '').replace(/^models\//, '')
  if (!cachedModels.length) {
    const res = await fetch(`${API}/models?pageSize=200&key=${key}`)
    if (!res.ok) {
      if (fixed) return [fixed]
      throw new Error(`Không lấy được danh sách mô hình Gemini (${res.status}) — kiểm tra GEMINI_API_KEY`)
    }
    const { models = [] } = await res.json()
    const ok = models
      .filter((m: { name: string, supportedGenerationMethods?: string[] }) => m.supportedGenerationMethods?.includes('generateContent'))
      .map((m: { name: string }) => m.name.replace(/^models\//, ''))
      .filter((n: string) => /flash/.test(n) && !/(image|tts|audio|live|thinking|exp|embedding|8b)/.test(n) && !/-\d{3}$/.test(n))
    // Ưu tiên bản "flash" (chính xác hơn "flash-lite"), bản ổn định (không "preview"), số phiên bản lớn nhất.
    const ver = (n: string) => Number((/(\d+(?:\.\d+)?)/.exec(n) || [])[1] || 0)
    ok.sort((a: string, b: string) => (Number(/lite/.test(a)) - Number(/lite/.test(b))) || (Number(/preview/.test(a)) - Number(/preview/.test(b))) || (ver(b) - ver(a)))
    cachedModels = ok
  }
  // 3 mô hình "flash" đầu + 1 mô hình "flash-lite" (khác nhóm máy chủ, thường còn rảnh khi bản flash bị quá tải).
  const full = cachedModels.filter(n => !/lite/.test(n)).slice(0, 3)
  const lite = cachedModels.filter(n => /lite/.test(n)).slice(0, 1)
  const list = [...new Set([fixed, ...full, ...lite].filter(Boolean))]
  if (!list.length) throw new Error('Tài khoản Gemini không có mô hình "flash" nào dùng được')
  return list
}

// Gemini báo bận (503 "high demand"), lỗi tạm (500) hoặc hết lượt miễn phí của riêng mô hình đó (429): thử mô hình khác.
const BUSY = new Set([429, 500, 503])

// Supabase ngắt hàm chạy quá ~150 giây (lỗi 546, trình duyệt không biết lý do) — tự dừng trước đó và báo rõ.
const DEADLINE_MS = 130 * 1000

// Tắt / giảm "suy nghĩ" của mô hình: đọc bảng không cần suy luận, tắt đi nhanh hơn nhiều lần.
function thinkingOf(model: string) {
  if (/2\.5-flash/.test(model)) return { thinkingBudget: 0 }
  if (/^gemini-[3-9]/.test(model)) return { thinkingLevel: 'low' }
  return null
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Chỉ nhận POST' }, 405)
  const key = Deno.env.get('GEMINI_API_KEY')
  if (!key) return json({ error: 'Chưa cài GEMINI_API_KEY cho Edge Function pxk-ocr' }, 500)
  const started = Date.now()
  try {
    const { url, mimeType } = await req.json()
    // Chỉ đọc file trong Storage của chính dự án (chặn dùng hàm này tải link lạ)
    const own = new URL(Deno.env.get('SUPABASE_URL') || '').host
    if (!url || new URL(url).host !== own) return json({ error: 'Link file không hợp lệ' }, 400)
    const file = await fetch(url)
    if (!file.ok) return json({ error: `Không tải được file (${file.status})` }, 400)
    const bytes = new Uint8Array(await file.arrayBuffer())
    if (bytes.byteLength > MAX_BYTES) return json({ error: 'File lớn hơn 18 MB — tách thành nhiều file nhỏ hơn' }, 413)
    const data64 = encodeBase64(bytes)
    const bodyOf = (thinking: unknown) => JSON.stringify({
      contents: [{ parts: [{ inline_data: { mime_type: mimeType || 'application/pdf', data: data64 } }, { text: PROMPT }] }],
      generationConfig: {
        temperature: 0, maxOutputTokens: 16384, responseMimeType: 'application/json', responseSchema: SCHEMA,
        ...(thinking ? { thinkingConfig: thinking } : {}),
      },
    })
    let model = ''
    let out: { error?: { message?: string }, candidates?: { finishReason?: string, content?: { parts?: { text?: string }[] } }[] } = {}
    let status = 0
    const tried: string[] = []
    for (const m of await pickModels(key)) {
      const left = DEADLINE_MS - (Date.now() - started)
      if (left < 15000) break
      model = m
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), left)
      try {
        const call = (thinking: unknown) => fetch(`${API}/models/${m}:generateContent?key=${key}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: bodyOf(thinking), signal: ctrl.signal })
        const thinking = thinkingOf(m)
        let res = await call(thinking)
        out = await res.json().catch(() => ({}))
        // Mô hình không nhận tuỳ chọn "suy nghĩ" → gọi lại không kèm.
        if (res.status === 400 && thinking && /think/i.test(out?.error?.message || '')) {
          res = await call(null)
          out = await res.json().catch(() => ({}))
        }
        status = res.status
        if (res.ok || !BUSY.has(res.status)) break
        tried.push(`${m}: ${out?.error?.message || res.status}`)
      } catch (err) {
        if (!ctrl.signal.aborted) throw err
        status = 504
        tried.push(`${m}: quá ${Math.round((Date.now() - started) / 1000)} giây chưa đọc xong`)
        break
      } finally {
        clearTimeout(timer)
      }
    }
    if (!model) return json({ error: 'Hết thời gian trước khi gọi được AI' }, 504)
    if (status === 504) return json({ error: `AI đọc quá lâu, đã dừng để không bị Supabase ngắt (${tried.join(' | ')})` }, 504)
    if (status < 200 || status >= 300) {
      const msg = tried.length ? tried.join(' | ') : (out?.error?.message || `Gemini lỗi ${status}`)
      if (status === 429) return json({ error: `Hết lượt miễn phí của Gemini (thử lại sau): ${msg}` }, 429)
      if (status === 503 || status === 500) return json({ error: `Gemini đang quá tải, đã thử ${tried.length} mô hình (thử lại sau ít phút): ${msg}` }, 503)
      return json({ error: msg }, 502)
    }
    const cand = out?.candidates?.[0]
    const text = cand?.content?.parts?.map((p: { text?: string }) => p.text || '').join('') || ''
    // Mô hình đôi khi lặp mãi 1 dòng tới khi hết giới hạn chữ → JSON cụt: báo rõ để app chia phần nhỏ hơn đọc lại.
    if (cand?.finishReason === 'MAX_TOKENS') return json({ error: 'AI trả kết quả quá dài (bị cắt) — đọc lại với phần nhỏ hơn' }, 502)
    const data = JSON.parse(text || '{"phieus":[]}')
    return json({ model, phieus: Array.isArray(data.phieus) ? data.phieus : [] })
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500)
  }
})
