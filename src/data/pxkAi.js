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
  let res = await supabase.functions.invoke('pxk-ocr', { body: { url, mimeType } })
  if (res.error?.context?.status === 404) res = await supabase.functions.invoke('PXK-OCR', { body: { url, mimeType } })
  const { data, error } = res
  if (error) {
    let msg = error.message || 'lỗi gọi AI'
    try {
      const body = await error.context?.json?.()
      if (body?.error) msg = body.error
    } catch { /* giữ lời nhắn gốc */ }
    const status = error.context?.status
    // Giữ lời nhắn gốc trong ngoặc để biết đúng nguyên nhân (sai tên hàm, chưa deploy, lỗi mạng / CORS, lỗi khởi động…)
    if (status === 404 || /not found/i.test(msg)) msg = `không tìm thấy hàm "pxk-ocr" trên Supabase — kiểm tra tên hàm (${msg})`
    else if (/Failed to send a request/i.test(msg)) msg = `không gọi được hàm "pxk-ocr" (chưa deploy, sai tên, hoặc bị chặn mạng) — ${msg}`
    else if (status) msg = `hàm pxk-ocr báo lỗi ${status}: ${msg}`
    throw new Error(msg)
  }
  if (data?.error) throw new Error(data.error)
  return Array.isArray(data?.phieus) ? data.phieus : []
}
