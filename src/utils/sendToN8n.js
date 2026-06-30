// Đi qua Vite proxy để tránh CORS khi chạy localhost
const WEBHOOK_URL = '/n8n-webhook/webhook/Claude%20Web%20App'

/**
 * Gửi dữ liệu JSON lên n8n qua Webhook.
 * @param {object} payload - Dữ liệu cần gửi (name, email, message, ...)
 * @returns {{ success: boolean, data?: any, error?: string }}
 */
export async function sendToN8n(payload) {
  try {
    const res = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      const contentType = res.headers.get('content-type') || ''
      let detail = ''
      if (contentType.includes('application/json')) {
        const json = await res.json().catch(() => null)
        detail = json?.message ? ` — ${json.message}` : ''
      }
      return { success: false, error: `Lỗi server: ${res.status} ${res.statusText}${detail}` }
    }

    const data = await res.json().catch(() => null)
    return { success: true, data }
  } catch (err) {
    if (err instanceof TypeError && err.message.includes('fetch')) {
      return { success: false, error: 'Không thể kết nối đến webhook. Kiểm tra lại mạng hoặc URL.' }
    }
    return { success: false, error: err.message || 'Lỗi không xác định.' }
  }
}
