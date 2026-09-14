// Hàm định dạng/số liệu thuần (không JSX) dùng chung cho 2 báo cáo "Đơn sàn" và "Đơn truyền thống" —
// tách riêng khỏi tongDonReportUi.jsx (chỉ chứa component) để không phá fast-refresh của Vite/React.

export function fmtInt(n) { return Math.round(n || 0).toLocaleString('vi-VN') }
export function fmtPctSigned(v) { return `${v >= 0 ? '+' : ''}${v.toFixed(1)}%` }
export function pctOf(part, total) { return total ? Math.round((part / total) * 100 * 10) / 10 : 0 }

// Thứ tự mốc thời gian giao hàng dùng chung cho SPX Express và Viettel Post (đúng thứ tự/màu đã khớp
// pixel với 2 ảnh mẫu thật): 24h, 48h, 72h, Chờ lấy, Đang vận chuyển, Đang giao(hàng), Hoàn (hàng)
export function timingSegments(stats) {
  if (!stats) return []
  return [
    { value: stats['24h'] || 0, color: 'var(--color-current)', label: '24h' },
    { value: stats['48h'] || 0, color: 'var(--color-previous)', label: '48h' },
    { value: stats['72h'] || 0, color: 'var(--color-pink)', label: '72h' },
    { value: stats.choLay || 0, color: 'var(--color-purple)', label: 'Chờ lấy' },
    { value: stats.dangVanChuyen || 0, color: 'var(--color-blue)', label: 'Đang vận chuyển' },
    { value: stats.giaoLai || 0, color: 'var(--color-orange-2)', label: 'Đang giao' },
    { value: stats.hoanHang || 0, color: 'var(--color-red)', label: 'Hoàn' },
  ]
}

// Giao hàng trực tiếp: chỉ có 24h/48h/72h/Chưa giao (không có "đang vận chuyển"/"chờ lấy" vì đây là đơn tự giao)
export function directDeliverySegments({ b24, b48, b72, chuaGiao }) {
  return [
    { value: b24 || 0, color: 'var(--color-current)', label: '24h' },
    { value: b48 || 0, color: 'var(--color-previous)', label: '48h' },
    { value: b72 || 0, color: 'var(--color-pink)', label: '72h' },
    { value: chuaGiao || 0, color: 'var(--color-navy)', label: 'Chưa giao' },
  ]
}

export const PRIORITY_LABEL = { high: 'Ưu tiên cao', mid: 'Ưu tiên vừa', low: 'Theo dõi' }
