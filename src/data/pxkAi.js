// Gọi Edge Function "pxk-ocr" (supabase/functions/pxk-ocr) để Gemini đọc Phiếu xuất kho PDF scan / ảnh. Khoá Gemini
// nằm ở secret của Supabase, trình duyệt chỉ gửi link ký sẵn của file đã tải lên Storage.
import { getPxkFileUrl } from './pxkFiles'

// Trả về [{ soPhieu, trang, rows: [{ maHang, tenHang, dvt, soLuong, soLo, hanDung }] }]. Lỗi (chưa bật hàm, hết lượt
// miễn phí, mất mạng…) thì ném Error có lời nhắn tiếng Việt để app quay về cách đọc thường.
export async function readPxkWithAi(storagePath, mimeType) {
  const { supabase } = await import('../supabase')
  if (!supabase) throw new Error('chưa kết nối máy chủ')
  const url = await getPxkFileUrl(storagePath)
  // Hàm có thể được tạo trên Dashboard với tên viết hoa "PXK-OCR" — tên ở URL phân biệt hoa thường, nên thử cả 2.
  // Gọi sai tên thì trình duyệt thường chỉ báo "Failed to send a request" (trang 404 không có CORS), không có mã 404.
  let name = 'pxk-ocr'
  let res = await supabase.functions.invoke(name, { body: { url, mimeType } })
  const missing = e => e && (e.context?.status === 404 || /Failed to send a request/i.test(e.message || ''))
  if (missing(res.error)) {
    name = 'PXK-OCR'
    res = await supabase.functions.invoke(name, { body: { url, mimeType } })
  }
  const { data, error } = res
  if (error) {
    let msg = error.message || 'lỗi gọi AI'
    try {
      const body = await error.context?.json?.()
      if (body?.error) msg = body.error
    } catch { /* giữ lời nhắn gốc */ }
    const status = error.context?.status
    // Giữ lời nhắn gốc trong ngoặc để biết đúng nguyên nhân (sai tên hàm, chưa deploy, lỗi mạng / CORS, lỗi khởi động…)
    if (status === 404 || /not found/i.test(msg)) msg = `không tìm thấy hàm "${name}" trên Supabase — kiểm tra tên hàm (${msg})`
    else if (/Failed to send a request/i.test(msg)) msg = `không gọi được hàm "pxk-ocr" lẫn "PXK-OCR" (chưa deploy, thiếu đoạn CORS trong code hàm, hoặc bị chặn mạng) — ${msg}`
    else if (status) msg = `hàm ${name} báo lỗi ${status}: ${msg}`
    throw new Error(msg)
  }
  if (data?.error) throw new Error(data.error)
  return Array.isArray(data?.phieus) ? data.phieus : []
}
