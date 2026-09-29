// Khung chung cho màn "làm bộ biên bản" (nhập trả lại, hàng huỷ): ô nhập có nhãn + từng bước đánh số.
// kind: 'hand' = chỗ kho điền tay · 'preset' = giá trị mặc định, sửa nếu cần · 'plain'
export function Field({ label, kind = 'plain', full = false, children }) {
  return (
    <label className="flex flex-col gap-1" style={full ? { gridColumn: '1 / -1' } : undefined}>
      <span className="text-xs font-medium text-gray-500">
        {label}
        {kind === 'hand' && <span className="text-amber-600 font-semibold"> · điền tay</span>}
        {kind === 'preset' && <span className="text-gray-400"> · mặc định</span>}
      </span>
      {children}
    </label>
  )
}

export function Step({ n, title, children }) {
  return (
    <div className="flex flex-col gap-3 border-t border-gray-100 px-4 py-4 first:border-t-0">
      <div className="flex items-center gap-2 font-semibold text-sm text-gray-800">
        <span className="w-6 h-6 rounded-md bg-[#1e3a5f] text-white text-xs grid place-items-center">{n}</span>
        {title}
      </div>
      {children}
    </div>
  )
}
