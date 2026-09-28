import { Bell } from 'lucide-react'
import { useReturnReminders } from './useReturnReminders'

// Chuông Nhắc việc nhập trả lại trên thanh đầu trang — thấy số việc tồn ở mọi tab, bấm để mở tab Theo dõi
// nhập trả lại (bảng "Việc cần làm hôm nay" ở đầu tab).
export default function ReturnReminderBell({ onOpen }) {
  const reminders = useReturnReminders()
  const count = reminders.length
  return (
    <button
      type="button"
      onClick={onOpen}
      className="relative ml-auto flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-600 hover:border-[#1e3a5f] hover:text-[#1e3a5f]"
      aria-label={count > 0 ? `Nhắc việc: ${count} việc nhập trả lại cần xử lý` : 'Nhắc việc: không có việc tồn'}
      title="Nhắc việc nhập trả lại"
    >
      <Bell size={16} aria-hidden="true" />
      <span className="hidden sm:inline">Nhắc việc</span>
      {count > 0 && (
        <span className="absolute -top-2 -right-2 min-w-5 h-5 px-1 rounded-full bg-red-600 text-white text-[11px] font-bold grid place-items-center">{count}</span>
      )}
    </button>
  )
}
