// Yêu cầu đăng nhập lại mỗi ngày: Supabase tự nhớ phiên đăng nhập rất lâu (refresh token), nên app tự ghi lại ngày
// đăng nhập và coi phiên là hết hạn khi sang ngày mới (theo giờ máy). Phiên cũ chưa có ghi nhận ngày cũng bị coi là hết hạn.
const KEY = 'app.loginDay'

const today = (now = new Date()) => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

export function markLoginToday(now = new Date()) {
  try { window.localStorage.setItem(KEY, today(now)) } catch { /* bỏ qua */ }
}

export function loginExpired(now = new Date()) {
  try { return window.localStorage.getItem(KEY) !== today(now) } catch { return false }
}

export function clearLoginDay() {
  try { window.localStorage.removeItem(KEY) } catch { /* bỏ qua */ }
}
