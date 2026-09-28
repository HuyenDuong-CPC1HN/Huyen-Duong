// Bộ nhớ trong phiên làm việc cho màn hình "Đối soát Thực tế ↔ Hoá đơn" — chuyển sang tab khác trong menu
// là màn hình bị gỡ hẳn (unmount), giữ ở đây chuyến đang chọn, file đã thả, kết quả đối soát và bộ lọc để
// quay lại tab vẫn còn nguyên. Chỉ mất khi tải lại trang (File đã thả không lưu được lên kho dữ liệu).
let sessionCache = null

export function getDoiSoatSessionCache() { return sessionCache }
export function setDoiSoatSessionCache(value) { sessionCache = value }
export function resetDoiSoatSessionCache() { sessionCache = null }
