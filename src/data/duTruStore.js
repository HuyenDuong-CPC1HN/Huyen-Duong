import { opsStore } from './workspace'
import { KHO_DEFAULT_C, KHO_NAME_DEFAULT_C } from '../utils/duTru'

// Tab "Dự trù hàng" — chỉ lưu lựa chọn và số chốt (ops_settings, khoá dutru_*), không lưu file nhập – xuất – tồn:
// file đọc ngay trên trình duyệt, mỗi lần dự trù tải file mới. Mỗi kho (C / DTP / SO) một khoá riêng.
const SETTINGS_KEY = branch => `dutru_settings_${branch}`
const ORDERS_KEY = branch => `dutru_orders_${branch}`
const KEEP_WEEKS = 8

function readJson(key, fallback) {
  try {
    const v = JSON.parse(opsStore.getItem(key) || 'null')
    return v && typeof v === 'object' ? v : fallback
  } catch { return fallback }
}

export function readDuTruSettings(branch = 'C') {
  const v = readJson(SETTINGS_KEY(branch), {})
  return {
    kho: Array.isArray(v.kho) ? v.kho : KHO_DEFAULT_C,
    khoName: { ...KHO_NAME_DEFAULT_C, ...(v.khoName || {}) },
    merge: v.merge || {},
    manual: Array.isArray(v.manual) ? v.manual : [],
    jwAlone: Array.isArray(v.jwAlone) ? v.jwAlone : [], // mã J / W anh xác nhận không phải hàng 2 mã: thôi gợi ý mã nhận điều
    Ld: Number.isFinite(v.Ld) ? v.Ld : 5,
    ss: Number.isFinite(v.ss) ? v.ss : 3,
    useSea: v.useSea !== false,
  }
}
export function writeDuTruSettings(settings, branch = 'C') { opsStore.setItem(SETTINGS_KEY(branch), JSON.stringify(settings)) }

// Số chốt theo tuần: { [weekKey]: { chot: { id: số }, add: { id: số }, done: { id: true } } } — giữ 8 tuần gần nhất.
export function readDuTruOrder(week, branch = 'C') {
  const all = readJson(ORDERS_KEY(branch), {})
  const o = all[week] || {}
  return { chot: o.chot || {}, add: o.add || {}, done: o.done || {} }
}
export function writeDuTruOrder(week, order, branch = 'C') {
  const all = readJson(ORDERS_KEY(branch), {})
  all[week] = order
  const keep = Object.keys(all).sort().slice(-KEEP_WEEKS)
  opsStore.setItem(ORDERS_KEY(branch), JSON.stringify(Object.fromEntries(keep.map(k => [k, all[k]]))))
}

// Bảng quy đổi mã C ↔ U của Kho DTP (tải file 1 lần, lưu lại; có mã mới thì tải bản mới thay).
// { name, at, rows: [[mã C, tên, ĐVT C, hệ số, mã U, ĐVT U]] } — dạng mảng cho gọn.
const MAP_KEY = 'dutru_map_cu'
export function readMapCU() {
  const v = readJson(MAP_KEY, null)
  if (!v || !Array.isArray(v.rows)) return null
  return { name: v.name || '', at: v.at || '', rows: v.rows.map(([c, ten, dvt, k, u, dvtU]) => ({ c, ten, dvt, k: Number(k) || 1, u, dvtU })) }
}
export function writeMapCU(name, rows, at = new Date().toISOString()) {
  opsStore.setItem(MAP_KEY, JSON.stringify({ name, at, rows: rows.map(m => [m.c, m.ten, m.dvt, m.k, m.u, m.dvtU]) }))
  return { name, at, rows }
}
