import { useEffect, useState } from 'react'
import { readSlips } from '../data/returnSlipsStore'
import { RETURN_SLIPS_EVENT, slipReminders } from '../utils/returnSlips'

// Danh sách việc nhập trả lại cần nhắc (xem slipReminders) — cập nhật khi phiếu thay đổi và mỗi 10 phút.
export function useReturnReminders() {
  const [reminders, setReminders] = useState(() => slipReminders(readSlips(), new Date()))
  useEffect(() => {
    const refresh = () => setReminders(slipReminders(readSlips(), new Date()))
    window.addEventListener(RETURN_SLIPS_EVENT, refresh)
    const timer = setInterval(refresh, 10 * 60 * 1000)
    return () => { window.removeEventListener(RETURN_SLIPS_EVENT, refresh); clearInterval(timer) }
  }, [])
  return reminders
}
