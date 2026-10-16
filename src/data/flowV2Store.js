import { opsStore } from './workspace'
import { FLOWV2_BATCHES_KEY, FLOWV2_CASES_KEY, FLOWV2_EVENT, FLOWV2_POOL_KEY, migrateCase } from '../utils/flowV2'

// Dữ liệu tab "Hàng trả & huỷ (Demo)" — lưu ở ops_settings (khoá flowv2_*), tách hẳn khỏi dữ liệu các tab cũ.
function readList(key) {
  try {
    const list = JSON.parse(opsStore.getItem(key) || '[]')
    return Array.isArray(list) ? list.filter(Boolean) : []
  } catch { return [] }
}

export function readFlowV2() {
  return { cases: readList(FLOWV2_CASES_KEY).map(migrateCase), pool: readList(FLOWV2_POOL_KEY), batches: readList(FLOWV2_BATCHES_KEY) }
}

// Dữ liệu 3 tab cũ (chỉ đọc) để lấy sang tab Demo — xem utils/flowV2Legacy.js.
export function readLegacySources() {
  return {
    returnSlips: readList('return_slips'),
    swapRecords: readList('swap_return_records'),
    swapBatches: readList('swap_huy_batches'),
    huySlips: readList('huy_slips'),
  }
}

// Chỉ ghi phần thay đổi (cases / pool / batches có mặt trong patch).
export function writeFlowV2(patch) {
  if (patch.cases) opsStore.setItem(FLOWV2_CASES_KEY, JSON.stringify(patch.cases))
  if (patch.pool) opsStore.setItem(FLOWV2_POOL_KEY, JSON.stringify(patch.pool))
  if (patch.batches) opsStore.setItem(FLOWV2_BATCHES_KEY, JSON.stringify(patch.batches))
  window.dispatchEvent(new Event(FLOWV2_EVENT))
}
