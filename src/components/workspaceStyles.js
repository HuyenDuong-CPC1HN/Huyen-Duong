// Lớp CSS ô nhập của màn làm bộ biên bản: vàng = kho điền tay, trắng = mặc định.
const inputBase = 'w-full px-2.5 py-1.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-200'
export const handCls = `${inputBase} bg-yellow-50 border-yellow-400 text-gray-900`
export const presetCls = `${inputBase} bg-white border-gray-200`
// Ô nhập nhiều dòng tự giãn theo nội dung (chữ dài xuống dòng, không bị cắt); trình duyệt cũ chưa có field-sizing thì hiện 2 dòng.
export const wrapStyle = { fieldSizing: 'content', minHeight: 36, resize: 'none' }
export const grid = cols => ({ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(${cols}px, 1fr))`, gap: 10 })
