// Trang kế toán (link riêng #ketoan=<mã>, không đăng nhập) gọi Edge Function "ke-toan" (supabase/functions/ke-toan).
// body: { t, action: 'list' } → { name, items } · { t, action: 'done', kind, id } → { ok: true }.
let knownName = '' // tên hàm gọi được lần trước

// Mã link sau "#ketoan=" (main.jsx dùng để mở trang kế toán thay cho app chính).
export const tokenFromHash = (hash = window.location.hash) => (/^#ketoan=([A-Za-z0-9_-]+)/.exec(hash) || [])[1] || ''

export async function callKeToan(body) {
  const { supabase } = await import('../supabase')
  if (!supabase) throw new Error('App chưa kết nối máy chủ. Anh/chị báo kho giúp.')
  // Hàm có thể được tạo trên Dashboard bằng tên viết hoa; gọi sai tên trình duyệt thường chỉ báo "Failed to send a request".
  const missing = e => e && (e.context?.status === 404 || /Failed to send a request/i.test(e.message || ''))
  let name = knownName || 'ke-toan'
  let res = await supabase.functions.invoke(name, { body })
  if (!knownName && missing(res.error)) {
    name = 'KE-TOAN'
    res = await supabase.functions.invoke(name, { body })
  }
  if (!missing(res.error)) knownName = name
  if (res.error) {
    let msg = res.error.message || 'lỗi gọi máy chủ'
    try {
      const b = await res.error.context?.json?.()
      if (b?.error) msg = b.error
    } catch { /* giữ lời nhắn gốc */ }
    if (missing(res.error)) msg = 'Không mở được trang kế toán: máy chủ chưa cài hàm "ke-toan" hoặc đang mất mạng. Anh/chị thử lại, vẫn lỗi thì báo kho giúp.'
    const err = new Error(msg)
    err.status = res.error.context?.status
    throw err
  }
  if (res.data?.error) throw new Error(res.data.error)
  return res.data
}
