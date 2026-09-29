// Lớp CSS ô nhập của màn làm bộ biên bản: vàng = kho điền tay, trắng = mặc định.
const inputBase = 'w-full px-2.5 py-1.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-200'
export const handCls = `${inputBase} bg-yellow-50 border-yellow-400 text-gray-900`
export const presetCls = `${inputBase} bg-white border-gray-200`
export const grid = cols => ({ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(${cols}px, 1fr))`, gap: 10 })
