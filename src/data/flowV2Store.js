import { opsStore } from './workspace'
import { supabase } from '../supabase'
import {
  FLOWV2_BATCHES_KEY, FLOWV2_CASES_KEY, FLOWV2_EVENT, FLOWV2_KT_LINKS_KEY, FLOWV2_KT_QUEUE_KEY, FLOWV2_POOL_KEY, KT_DONE_PREFIX,
  ktQueue, migrateCase,
} from '../utils/flowV2'

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
  if (patch.cases || patch.batches) syncKtQueue()
  window.dispatchEvent(new Event(FLOWV2_EVENT))
}

// ===== Link kế toán (xem utils/flowV2.js, supabase/functions/ke-toan) =====
// So 2 giá trị JSON không tính thứ tự khoá (Postgres jsonb tự xếp lại khoá khi lưu).
const canon = v => (Array.isArray(v) ? v.map(canon) : v && typeof v === 'object'
  ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canon(v[k])])) : v)
const sameJson = (a, b) => { try { return JSON.stringify(canon(JSON.parse(a))) === JSON.stringify(canon(b)) } catch { return false } }

// Ghi lại hàng đợi việc của kế toán khi khác bản đang lưu (trang kế toán đọc khoá này qua hàm ke-toan).
export function syncKtQueue(state = readFlowV2()) {
  const queue = ktQueue(state)
  if (!sameJson(opsStore.getItem(FLOWV2_KT_QUEUE_KEY), queue)) opsStore.setItem(FLOWV2_KT_QUEUE_KEY, JSON.stringify(queue))
}

export function readKtLinks() {
  try {
    const v = JSON.parse(opsStore.getItem(FLOWV2_KT_LINKS_KEY) || '{}')
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {}
  } catch { return {} }
}
export function writeKtLinks(links) { return opsStore.setItem(FLOWV2_KT_LINKS_KEY, JSON.stringify(links)) }

// Các lần kế toán bấm "Đã xong" trên link chưa được app kho áp: [{ key, value: { kind, id, by, at } }].
// Đọc thẳng máy chủ (không lấy bản nạp lúc đăng nhập) vì kế toán bấm lúc kho đang mở app.
export async function fetchKtDone() {
  if (!supabase) return []
  const { data, error } = await supabase.from('ops_settings').select('key,value').like('key', `${KT_DONE_PREFIX}%`)
  if (error) throw new Error(error.message)
  return (data || []).filter(r => r.key.startsWith(KT_DONE_PREFIX) && r.value)
}
export function removeKtDone(keys) { for (const k of keys) opsStore.removeItem(k) }
