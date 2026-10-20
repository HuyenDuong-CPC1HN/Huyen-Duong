// Gọi Edge Function "pxk-ocr" (supabase/functions/pxk-ocr) để Gemini đọc Phiếu xuất kho PDF scan / ảnh. Khoá Gemini
// nằm ở secret của Supabase, trình duyệt chỉ gửi link ký sẵn của file đã tải lên Storage.
import { getPxkFileUrl } from './pxkFiles'

// Trả về [{ soPhieu, trang, rows: [{ maHang, tenHang, dvt, soLuong, soLo, hanDung }] }]. Lỗi (chưa bật hàm, hết lượt
// miễn phí, mất mạng…) thì ném Error có lời nhắn tiếng Việt để app quay về cách đọc thường.
export async function readPxkWithAi(storagePath, mimeType) {
  const { supabase } = await import('../supabase')
  if (!supabase) throw new Error('chưa kết nối máy chủ')
  const url = await getPxkFileUrl(storagePath)
  const { data, error } = await supabase.functions.invoke('pxk-ocr', { body: { url, mimeType } })
  if (error) {
    let msg = error.message || 'lỗi gọi AI'
    try {
      const body = await error.context?.json?.()
      if (body?.error) msg = body.error
    } catch { /* giữ lời nhắn gốc */ }
    if (/not found|404|Failed to send a request/i.test(msg)) msg = 'chưa bật AI đọc phiếu (Edge Function pxk-ocr chưa cài)'
    throw new Error(msg)
  }
  if (data?.error) throw new Error(data.error)
  return Array.isArray(data?.phieus) ? data.phieus : []
}
