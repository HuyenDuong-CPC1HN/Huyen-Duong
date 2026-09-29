// Đặt hướng giấy cho ĐÚNG 1 lần in: chèn tạm rule @page (thắng rule mặc định trong index.css vì nằm sau),
// gỡ ngay khi hộp thoại in đóng (sự kiện afterprint) để lần in khác (vd tab Phân tích giao hàng) không bị
// ảnh hưởng. orientation: 'portrait' (mặc định, không chèn gì) | 'landscape'.
export function printWithOrientation(orientation = 'portrait') {
  let style = null
  const cleanup = () => {
    style?.remove()
    style = null
    window.removeEventListener('afterprint', cleanup)
  }
  if (orientation === 'landscape') {
    style = document.createElement('style')
    style.setAttribute('data-print-orientation', orientation)
    style.textContent = '@page { size: A4 landscape; margin: 10mm 12mm; }'
    document.head.appendChild(style)
    window.addEventListener('afterprint', cleanup)
  }
  try {
    window.print()
  } finally {
    // Trình duyệt không bắn afterprint (hoặc print bị chặn) thì vẫn gỡ sau 1 phút, tránh để rule lại mãi.
    if (style) setTimeout(cleanup, 60000)
  }
}
