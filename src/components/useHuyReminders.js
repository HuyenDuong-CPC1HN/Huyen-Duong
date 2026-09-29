import { useEffect, useState } from 'react'
import { readHuyPhieus } from '../data/hangHuyStore'
import { HUY_SLIPS_EVENT, huyReminders } from '../utils/hangHuy'

// Việc hàng huỷ cần nhắc (xem huyReminders) — cập nhật khi phiếu thay đổi và mỗi 10 phút.
export function useHuyReminders() {
  const [reminders, setReminders] = useState(() => huyReminders(readHuyPhieus(), new Date()))
  useEffect(() => {
    const refresh = () => setReminders(huyReminders(readHuyPhieus(), new Date()))
    window.addEventListener(HUY_SLIPS_EVENT, refresh)
    const timer = setInterval(refresh, 10 * 60 * 1000)
    return () => { window.removeEventListener(HUY_SLIPS_EVENT, refresh); clearInterval(timer) }
  }, [])
  return reminders
}
