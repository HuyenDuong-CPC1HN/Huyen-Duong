import { opsStore } from './workspace'
import { HUY_SLIPS_KEY, HUY_SLIPS_EVENT } from '../utils/hangHuy'

// Phiếu xuất kho hàng huỷ Kho C / Kho DTP — lưu ở ops_settings (khoá "huy_slips"), không cần bảng riêng. Mỗi
// lần ghi báo sự kiện để chuông Nhắc việc cập nhật số đếm.
export function readHuyPhieus() {
  try {
    const list = JSON.parse(opsStore.getItem(HUY_SLIPS_KEY) || '[]')
    return Array.isArray(list) ? list.filter(Boolean) : []
  } catch { return [] }
}

export function writeHuyPhieus(list) {
  opsStore.setItem(HUY_SLIPS_KEY, JSON.stringify(list))
  window.dispatchEvent(new Event(HUY_SLIPS_EVENT))
}
