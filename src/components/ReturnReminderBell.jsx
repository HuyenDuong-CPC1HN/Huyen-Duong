import { useState } from 'react'
import { Bell } from 'lucide-react'
import { useReturnReminders } from './useReturnReminders'
import { useHuyReminders } from './useHuyReminders'

// Chuông Nhắc việc trên thanh đầu trang — thấy số việc tồn (nhập trả lại + hàng huỷ) ở mọi tab. Bấm để mở tab
// có việc (onOpen nhận id tab: 'traHang' hoặc 'hangHuyCD'); nếu cả hai tab đều có việc thì hiện chọn tab.
export default function ReturnReminderBell({ onOpen }) {
  const returnCount = useReturnReminders().length
  const huyCount = useHuyReminders().length
  const [choosing, setChoosing] = useState(false)
  const count = returnCount + huyCount

  const click = () => {
    if (returnCount > 0 && huyCount > 0) setChoosing(c => !c)
    else onOpen(huyCount > 0 ? 'hangHuyCD' : 'traHang')
  }
  const go = (id) => { setChoosing(false); onOpen(id) }

  return (
    <div className="relative ml-auto">
      <button
        type="button"
        onClick={click}
        className="relative flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-600 hover:border-[#1e3a5f] hover:text-[#1e3a5f]"
        aria-label={count > 0 ? `Nhắc việc: ${count} việc cần xử lý` : 'Nhắc việc: không có việc tồn'}
        title="Nhắc việc nhập trả lại và hàng huỷ"
      >
        <Bell size={16} aria-hidden="true" />
        <span className="hidden sm:inline">Nhắc việc</span>
        {count > 0 && (
          <span className="absolute -top-2 -right-2 min-w-5 h-5 px-1 rounded-full bg-red-600 text-white text-[11px] font-bold grid place-items-center">{count}</span>
        )}
      </button>
      {choosing && (
        <div className="absolute right-0 top-full mt-1 z-20 w-56 rounded-lg border border-gray-200 bg-white p-1 shadow-lg">
          <button type="button" onClick={() => go('traHang')} className="flex w-full items-center justify-between rounded px-3 py-2 text-left text-sm hover:bg-gray-50">
            Nhập trả lại <b className="text-red-600">{returnCount}</b>
          </button>
          <button type="button" onClick={() => go('hangHuyCD')} className="flex w-full items-center justify-between rounded px-3 py-2 text-left text-sm hover:bg-gray-50">
            Hàng huỷ Kho C & DTP <b className="text-red-600">{huyCount}</b>
          </button>
        </div>
      )}
    </div>
  )
}
