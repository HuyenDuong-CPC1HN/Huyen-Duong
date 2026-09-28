import { opsStore } from './workspace'
import { RETURN_SLIPS_KEY, RETURN_SLIPS_EVENT } from '../utils/returnSlips'

// Phiếu trả hàng theo quy trình mới — lưu ở ops_settings (khoá "return_slips", xem workspace.persist), không
// cần bảng/migration riêng trên Supabase. Mỗi lần ghi báo sự kiện để chuông Nhắc việc cập nhật số đếm.
export function readSlips() {
  try {
    const list = JSON.parse(opsStore.getItem(RETURN_SLIPS_KEY) || '[]')
    return Array.isArray(list) ? list.filter(Boolean) : []
  } catch { return [] }
}

export function writeSlips(list) {
  opsStore.setItem(RETURN_SLIPS_KEY, JSON.stringify(list))
  window.dispatchEvent(new Event(RETURN_SLIPS_EVENT))
}
