import { opsStore } from './workspace'
import { PXK_STORE_KEY } from '../utils/pxkReconcile'

// Dữ liệu mục "Đối chiếu sổ sách" theo từng chuyến nhập hàng (id chuyến ở goods_receipt_batches):
// { [batchId]: { phieus: [...], scan: { C, DTP, SO }, checked: [...] } }. Lưu ở ops_settings, tách khỏi dữ liệu tab cũ.
export const emptyPxkSession = () => ({ phieus: [], scan: { C: null, DTP: null, SO: null }, checked: [] })

export function readPxkStore() {
  try {
    const v = JSON.parse(opsStore.getItem(PXK_STORE_KEY) || '{}')
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {}
  } catch { return {} }
}

export function writePxkSession(batchId, session) {
  const all = readPxkStore()
  all[batchId] = session
  opsStore.setItem(PXK_STORE_KEY, JSON.stringify(all))
  return all
}

export function readGoodsBatches() {
  try {
    const list = JSON.parse(opsStore.getItem('goods_receipt_batches') || '[]')
    return Array.isArray(list) ? list.filter(b => b && b.id) : []
  } catch { return [] }
}
