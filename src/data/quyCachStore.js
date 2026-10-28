import { opsStore } from './workspace'

// Tab "Quy cách hàng hoá": số lượng (theo ĐVT) trong 1 kiện của từng mã vật tư.
// Lưu ops_settings khoá quycach_hang: { [mã]: { ten, dvt, kien: số | null, note, at } }.
// Danh sách mã lấy từ file nhập – xuất – tồn anh tải lên (ở tab này hoặc tab Dự trù hàng); mã mới thì thêm, mã cũ giữ nguyên số đã nhập.
const KEY = 'quycach_hang'

export function readQuyCach() {
  try {
    const v = JSON.parse(opsStore.getItem(KEY) || 'null')
    return v && typeof v === 'object' ? v : {}
  } catch { return {} }
}
export function writeQuyCach(all) { opsStore.setItem(KEY, JSON.stringify(all)) }

// products: [{ ma, ten, dvt }] → trả về { all, added: số mã mới }. Mã đã có: chỉ cập nhật tên / ĐVT khi đang trống.
export function addQuyCachProducts(products, all = readQuyCach()) {
  const next = { ...all }
  let added = 0
  for (const p of products) {
    const cur = next[p.ma]
    if (!cur) { next[p.ma] = { ten: p.ten || '', dvt: p.dvt || '', kien: null, note: '', at: '' }; added++ }
    else if (!cur.ten || !cur.dvt) next[p.ma] = { ...cur, ten: cur.ten || p.ten || '', dvt: cur.dvt || p.dvt || '' }
  }
  if (added || products.some(p => all[p.ma] && (!all[p.ma].ten || !all[p.ma].dvt))) writeQuyCach(next)
  return { all: next, added }
}
