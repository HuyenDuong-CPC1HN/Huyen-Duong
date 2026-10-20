// Edge Function "pxk-ocr": đọc Phiếu xuất kho nhà máy (PDF scan / ảnh chụp) bằng Google Gemini, trả về các phiếu và
// dòng hàng dạng JSON cho mục "Đối chiếu sổ sách". Khoá Gemini chỉ nằm ở secret GEMINI_API_KEY của Supabase — không
// bao giờ ở code hay trình duyệt. Chỉ người đã đăng nhập app gọi được (Supabase kiểm tra JWT mặc định).
//
// Vào: { url, mimeType } — url là link ký sẵn (signed URL) của file trong bucket ops-files của chính dự án này.
// Ra:  { model, phieus: [{ soPhieu, trang: [số trang], rows: [{ maHang, tenHang, dvt, soLuong, soLo, hanDung }] }] }
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
soLuong = "Số lượng" đổi ra số (phiếu in dấu chấm phân cách nghìn, dấu phẩy thập phân: "3.380,000" = 3380; "154,000" = 154),
soLo = "Lô" (giữ nguyên chữ hoa / số, vd 13626G01), hanDung = "Hạn dùng" dạng dd/mm/yyyy (để trống nếu không có).
Ô không đọc được thì để chuỗi rỗng (soLuong để null). Bỏ qua các dòng trống chỉ có số thứ tự.`

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
                soLuong: { type: 'NUMBER', nullable: true }, soLo: { type: 'STRING' }, hanDung: { type: 'STRING' },
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

let cachedModel = ''
async function pickModel(key: string): Promise<string> {
  const fixed = Deno.env.get('GEMINI_MODEL')
  if (fixed) return fixed.replace(/^models\//, '')
  if (cachedModel) return cachedModel
  const res = await fetch(`${API}/models?pageSize=200&key=${key}`)
  if (!res.ok) throw new Error(`Không lấy được danh sách mô hình Gemini (${res.status}) — kiểm tra GEMINI_API_KEY`)
  const { models = [] } = await res.json()
  const ok = models
    .filter((m: { name: string, supportedGenerationMethods?: string[] }) => m.supportedGenerationMethods?.includes('generateContent'))
    .map((m: { name: string }) => m.name.replace(/^models\//, ''))
    .filter((n: string) => /flash/.test(n) && !/(image|tts|audio|live|thinking|exp|embedding|8b)/.test(n))
  // Ưu tiên bản "flash" (chính xác hơn "flash-lite"), bản ổn định (không "preview"), số phiên bản lớn nhất.
  const ver = (n: string) => Number((/(\d+(?:\.\d+)?)/.exec(n) || [])[1] || 0)
  ok.sort((a: string, b: string) => (Number(/lite/.test(a)) - Number(/lite/.test(b))) || (Number(/preview/.test(a)) - Number(/preview/.test(b))) || (ver(b) - ver(a)))
  if (!ok.length) throw new Error('Tài khoản Gemini không có mô hình "flash" nào dùng được')
  cachedModel = ok[0]
  return cachedModel
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Chỉ nhận POST' }, 405)
  const key = Deno.env.get('GEMINI_API_KEY')
  if (!key) return json({ error: 'Chưa cài GEMINI_API_KEY cho Edge Function pxk-ocr' }, 500)
  try {
    const { url, mimeType } = await req.json()
    // Chỉ đọc file trong Storage của chính dự án (chặn dùng hàm này tải link lạ)
    const own = new URL(Deno.env.get('SUPABASE_URL') || '').host
    if (!url || new URL(url).host !== own) return json({ error: 'Link file không hợp lệ' }, 400)
    const file = await fetch(url)
    if (!file.ok) return json({ error: `Không tải được file (${file.status})` }, 400)
    const bytes = new Uint8Array(await file.arrayBuffer())
    if (bytes.byteLength > MAX_BYTES) return json({ error: 'File lớn hơn 18 MB — tách thành nhiều file nhỏ hơn' }, 413)
    const model = await pickModel(key)
    const res = await fetch(`${API}/models/${model}:generateContent?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ inline_data: { mime_type: mimeType || 'application/pdf', data: encodeBase64(bytes) } }, { text: PROMPT }] }],
        generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema: SCHEMA },
      }),
    })
    const out = await res.json()
    if (!res.ok) {
      const msg = out?.error?.message || `Gemini lỗi ${res.status}`
      return json({ error: res.status === 429 ? `Hết lượt miễn phí của Gemini (thử lại sau): ${msg}` : msg }, res.status === 429 ? 429 : 502)
    }
    const text = out?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || '').join('') || ''
    const data = JSON.parse(text || '{"phieus":[]}')
    return json({ model, phieus: Array.isArray(data.phieus) ? data.phieus : [] })
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500)
  }
})
