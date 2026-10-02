import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Printer } from 'lucide-react'

// Khung "Xem trước" + nút In dùng chung (giống tab Theo dõi nhập trả lại): chuyển giữa các biên bản, nhắc chọn
// hướng giấy khi in, in đúng biên bản đang xem qua portal .rsw-print-root (xem index.css). docs: [{ key, label,
// landscape, node }] — node là biên bản đã dựng sẵn.
export default function PreviewPrintPanel({ docs }) {
  const [key, setKey] = useState(docs[0]?.key)
  const doc = docs.find(d => d.key === key) || docs[0]
  if (!doc) return null
  return (
    <>
      <div className="rounded-xl border border-gray-200 bg-white sticky top-3">
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-gray-100">
          <span className="font-semibold text-sm text-gray-800">Xem trước</span>
          {docs.map(d => (
            <button key={d.key} type="button" onClick={() => setKey(d.key)} aria-pressed={doc.key === d.key}
              className={`px-2.5 py-1 rounded-md text-xs border ${doc.key === d.key ? 'border-[#1e3a5f] text-[#1e3a5f] font-semibold' : 'border-gray-200 text-gray-500'}`}>{d.label}</button>
          ))}
          <button type="button" onClick={() => window.print()} className="ml-auto px-2.5 py-1 rounded-md text-xs border border-gray-200 text-gray-600 hover:border-blue-400 hover:text-blue-600 flex items-center gap-1"
            title="In trực tiếp đúng biên bản đang xem (mở hộp thoại in của trình duyệt)">
            <Printer size={12} /> In
          </button>
          <span className="w-full text-[11px] text-amber-700" data-testid="print-hint">
            Khi in: mục <b>Layout</b> chọn <b>{doc.landscape ? 'Landscape (ngang)' : 'Portrait (dọc)'}</b>, <b>Pages per sheet</b> chọn <b>1</b>.
          </span>
          <span className="w-full text-[11px] text-gray-400">
            <span className="bg-yellow-100 border-b-2 border-yellow-500 px-1">vàng</span> kho điền trên app ·{' '}
            <span className="bg-red-50 text-red-700 px-1">đỏ</span> còn thiếu · chữ thường lấy từ dữ liệu đã nhập
          </span>
        </div>
        <div className="bg-gray-100 p-4 rounded-b-xl" style={{ overflowX: 'auto' }}>{doc.node}</div>
      </div>
      {createPortal(<div className="rsw-print-root">{doc.node}</div>, document.body)}
    </>
  )
}
