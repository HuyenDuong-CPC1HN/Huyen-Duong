// Gọi Edge Function "pxk-ocr" (supabase/functions/pxk-ocr) để Gemini đọc Phiếu xuất kho PDF scan / ảnh. Khoá Gemini
// nằm ở secret của Supabase, trình duyệt chỉ gửi link ký sẵn của file đã tải lên Storage.
import { getPxkFileUrl } from './pxkFiles'

// Trả về [{ soPhieu, trang, rows: [{ maHang, tenHang, dvt, soLuong, soLo, hanDung }] }]. Lỗi (chưa bật hàm, hết lượt
// miễn phí, mất mạng…) thì ném Error có lời nhắn tiếng Việt để app quay về cách đọc thường.
let knownName = '' // tên hàm đã gọi được ở lần trước — lần sau gọi thẳng, khỏi thử tên kia

const wait = ms => new Promise(resolve => setTimeout(resolve, ms))

export async function readPxkWithAi(storagePath, mimeType) {
  const { supabase } = await import('../supabase')
  if (!supabase) throw new Error('chưa kết nối máy chủ')
  const url = await getPxkFileUrl(storagePath)
  // Hàm có thể được tạo trên Dashboard với tên viết hoa "PXK-OCR" — tên ở URL phân biệt hoa thường, nên thử cả 2.
  // Gọi sai tên thì trình duyệt thường chỉ báo "Failed to send a request" (trang 404 không có CORS), không có mã 404.
  const missing = e => e && (e.context?.status === 404 || /Failed to send a request/i.test(e.message || ''))
  const call = async () => {
    let name = knownName || 'pxk-ocr'
    let res = await supabase.functions.invoke(name, { body: { url, mimeType } })
    if (!knownName && missing(res.error)) {
      name = 'PXK-OCR'
      res = await supabase.functions.invoke(name, { body: { url, mimeType } })
    }
    if (!missing(res.error)) knownName = name
    let msg = ''
    if (res.error) {
      msg = res.error.message || 'lỗi gọi AI'
      try {
        const body = await res.error.context?.json?.()
        if (body?.error) msg = body.error
      } catch { /* giữ lời nhắn gốc */ }
    }
    return { ...res, name, msg, status: res.error?.context?.status }
  }
  // Gemini báo bận ("high demand" / quá tải) thường chỉ vài giây — chờ rồi gọi lại, tối đa 2 lần.
  let r = await call()
  for (const ms of [5000, 15000]) {
    if (!r.error || !/high demand|overloaded|quá tải|UNAVAILABLE|try again later/i.test(r.msg)) break
    await wait(ms)
    r = await call()
  }
  const { data, error, name, status } = r
  if (error) {
    let msg = r.msg
    // Giữ lời nhắn gốc trong ngoặc để biết đúng nguyên nhân (sai tên hàm, chưa deploy, lỗi mạng / CORS, lỗi khởi động…)
    if (status === 404 || /not found/i.test(msg)) msg = `không tìm thấy hàm "${name}" trên Supabase — kiểm tra tên hàm (${msg})`
    else if (/Failed to send a request/i.test(msg)) msg = `không gọi được hàm "pxk-ocr" lẫn "PXK-OCR" (chưa deploy, thiếu đoạn CORS trong code hàm, hoặc bị chặn mạng) — ${msg}`
    else if (status) msg = `hàm ${name} báo lỗi ${status}: ${msg}`
    throw new Error(msg)
  }
  if (data?.error) throw new Error(data.error)
  return Array.isArray(data?.phieus) ? data.phieus : []
}
