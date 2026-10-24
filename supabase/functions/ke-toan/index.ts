// Supabase Edge Function "ke-toan": trang "Việc của kế toán" của tab Hàng trả & huỷ (link riêng, không đăng nhập).
// Kế toán mở link https://<app>/#ketoan=<mã>; trang gọi hàm này kèm mã:
//   { t, action: 'list' }               → { name, items } các việc đang chờ đúng kế toán đó
//   { t, action: 'done', kind, id }     → ghi khoá flowv2_ktdone:<kind>:<id> = { kind, id, by, at }; app kho đọc khoá,
//                                         chuyển hồ sơ / đợt huỷ sang bước kế rồi xoá khoá.
// Mã link của từng kế toán do kho tạo trong app (khoá ops_settings "flowv2_kt_links"); việc đang chờ do app kho ghi
// sẵn (khoá "flowv2_kt_queue"). Hàm dùng khoá service role có sẵn trong môi trường Edge Function của Supabase (không
// bao giờ đưa khoá này ra trình duyệt), nên chỉ trả về việc của người có mã đúng và chỉ ghi được khoá xác nhận.
// Deploy: tắt "Verify JWT" cho hàm này (kế toán không đăng nhập) — xem supabase/README.md.
import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const LINKS_KEY = 'flowv2_kt_links'
const QUEUE_KEY = 'flowv2_kt_queue'
const DONE_PREFIX = 'flowv2_ktdone:'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
  auth: { persistSession: false, autoRefreshToken: false },
})

async function setting(key: string) {
  const { data, error } = await admin.from('ops_settings').select('value').eq('key', key).maybeSingle()
  if (error) throw new Error(error.message)
  return data?.value ?? null
}

// So mã không để lộ thời gian (tránh dò mã theo tốc độ trả lời).
function same(a: string, b: string) {
  if (a.length !== b.length) return false
  let x = 0
  for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return x === 0
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Chỉ nhận POST.' }, 405)
  let body: { t?: string; action?: string; kind?: string; id?: string }
  try { body = await req.json() } catch { return json({ error: 'Yêu cầu không hợp lệ.' }, 400) }
  try {
    const t = String(body?.t ?? '')
    const links = (await setting(LINKS_KEY)) ?? {}
    const name = t.length >= 20 ? Object.keys(links).find(n => typeof links[n] === 'string' && same(links[n], t)) : undefined
    if (!name) return json({ error: 'Link không đúng hoặc kho đã đổi link. Anh/chị xin kho link mới giúp.' }, 401)

    const queue = (await setting(QUEUE_KEY)) ?? []
    const { data: doneRows, error } = await admin.from('ops_settings').select('key').like('key', `${DONE_PREFIX}%`)
    if (error) throw new Error(error.message)
    const done = new Set((doneRows ?? []).map(r => String(r.key).slice(DONE_PREFIX.length)))
    const mine = (Array.isArray(queue) ? queue : [])
      .filter(x => x && x.keToan === name && !done.has(`${x.kind}:${x.id}`))
      .sort((a, b) => String(a.since).localeCompare(String(b.since)))

    if (body.action === 'done') {
      const item = mine.find(x => x.kind === body.kind && x.id === body.id)
      if (!item) return json({ error: 'Việc này không còn chờ anh/chị (đã báo xong, hoặc kho đã đổi).' }, 409)
      const { error: upErr } = await admin.from('ops_settings').upsert({
        key: `${DONE_PREFIX}${item.kind}:${item.id}`,
        value: { kind: item.kind, id: item.id, by: name, at: new Date().toISOString() },
      })
      if (upErr) throw new Error(upErr.message)
      return json({ ok: true })
    }
    return json({ name, items: mine })
  } catch (e) {
    return json({ error: `Máy chủ lỗi: ${e instanceof Error ? e.message : String(e)}` }, 500)
  }
})
