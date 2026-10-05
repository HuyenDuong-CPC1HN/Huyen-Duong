// Sau mỗi lần cập nhật app (deploy mới), tab đang mở sẵn vẫn trỏ tới các file JS của bản cũ — các file đó đã bị
// thay tên nên lần đầu cần tải thêm (vd thư viện đọc PDF) sẽ lỗi "Failed to fetch dynamically imported module".
// Gặp lỗi này thì tự tải lại trang 1 lần để lấy bản mới (chặn lặp vô hạn bằng mốc thời gian trong sessionStorage).
const RELOAD_MARK = 'stale_chunk_reload_at'

export function isStaleChunkError(err) {
  const msg = String(err?.message || err || '')
  return /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS/i.test(msg)
}

export function reloadForNewVersion() {
  try {
    const last = Number(window.sessionStorage.getItem(RELOAD_MARK) || 0)
    if (Date.now() - last < 30000) return false
    window.sessionStorage.setItem(RELOAD_MARK, String(Date.now()))
  } catch { /* không có sessionStorage thì vẫn tải lại */ }
  window.location.reload()
  return true
}

export const STALE_CHUNK_MESSAGE = 'Ứng dụng vừa được cập nhật phiên bản mới — trang đang tự tải lại, anh tải lại file sau khi trang mở lại. Nếu trang không tự tải lại, bấm F5.'

// Tải module động (vd pdfjs); gặp lỗi do bản cũ thì tự tải lại trang và báo lỗi dễ hiểu.
export async function importFresh(loader) {
  try {
    return await loader()
  } catch (err) {
    if (isStaleChunkError(err)) {
      reloadForNewVersion()
      throw new Error(STALE_CHUNK_MESSAGE, { cause: err })
    }
    throw err
  }
}
