// Logic thuần (không đụng DOM/Storage) cho tab "Đổi trả hàng": nhận diện cùng/khác lô và gom đợt đổi trả
// vào "bộ xuất huỷ". Luôn có đúng 1 bộ đang gom; trình ký xong thì bộ khoá lại, đợt mới vào bộ kế tiếp.

export const SWAP_RETURN_ACCOUNTANTS = ['Phạm Thị Tuyết Trinh', 'Trần Thị Ái Lâm', 'Lưu Thị Thuỳ', 'Võ Thị Ly', 'Nguyễn Thị Tú Anh', 'Đỗ Thị Bông']
export const DEFAULT_ACCOUNTANT = 'Lưu Thị Thuỳ'

export function lotStatus(item) {
  const loi = String(item?.loLoi || '').trim()
  const doi = String(item?.loDoi || '').trim()
  if (!loi || !doi) return 'empty'
  return loi === doi ? 'same' : 'diff'
}

export function toIsoDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
export function formatDmy(iso) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function isRealDate(d, m, y) {
  const date = new Date(y, m - 1, d)
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d
}
function dmy(d, m, y) { return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}` }

// Hạn dùng gõ tay hoặc dán từ Excel/PDF về đúng dd/mm/yyyy. Nhận: 26/05/2029, 26-5-2029, 26.05.29,
// 2029-05-26, 26052029, có kèm giờ phía sau. Không đọc được thì trả lại nguyên chữ để người dùng tự sửa.
export function normalizeDateText(text) {
  const raw = String(text ?? '').trim().split(/\s+/)[0] || ''
  if (!raw) return ''
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(raw)
  if (m) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
    return isRealDate(d, mo, y) ? dmy(d, mo, y) : raw
  }
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/.exec(raw) || /^(\d{2})(\d{2})(\d{4})$/.exec(raw)
  if (!m) return raw
  let [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])]
  if (y < 100) y += 2000
  if (mo > 12 && d <= 12) [d, mo] = [mo, d] // dán từ Excel để định dạng Mỹ (tháng/ngày)
  return isRealDate(d, mo, y) ? dmy(d, mo, y) : raw
}
export function isValidDateText(text) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(text || ''))
  return Boolean(m) && isRealDate(Number(m[1]), Number(m[2]), Number(m[3]))
}

// Tình trạng hàng = phần Lý do đứng trước "đổi cho ..." (phần sau chỉ ghi khách/đơn được đổi).
// VD: "Hàng rách, móp vỏ đổi cho DP PLT (DU262/050203)" -> "Hàng rách, móp vỏ".
export function tinhTrangFromLyDo(lyDo) {
  const text = String(lyDo || '').normalize('NFC').trim()
  const cut = text.search(/(^|[\s,;.:–-])đổi\s+cho(\s|$)/iu)
  if (cut < 0) return text
  return text.slice(0, cut).replace(/[\s,;.:–-]+$/u, '').trim()
}

// BB xác minh nhập lại kho chỉ cần cho các dòng khác lô, mỗi khách hàng 1 biên bản.
export function nhapLaiItems(record) {
  return (record?.items || []).filter(item => lotStatus(item) === 'diff')
}

// ---------- Bộ xuất huỷ ----------

export function batchLabel(no) { return `Bộ ${String(no).padStart(2, '0')}` }
export function batchId(entity, no) { return `${entity}_${no}` }

function byDate(a, b) {
  return String(a.date).localeCompare(String(b.date)) || String(a.createdAt || '').localeCompare(String(b.createdAt || ''))
}

// Tách bộ của 1 kho: các bộ đã trình ký + đúng 1 bộ đang gom. Bộ đang gom chưa lưu thì dựng tạm (số kế tiếp,
// kế toán theo bộ ký gần nhất). Đợt không có batchNo (tạo trước khi có tính năng bộ) thuộc bộ đang gom.
export function resolveBatches(entity, batches, records) {
  const own = batches.filter(b => b.entity === entity)
  const signed = own.filter(b => b.signedAt).sort((a, b) => b.no - a.no)
  const nextNo = Math.max(0, ...signed.map(b => b.no)) + 1
  const openBatch = own.find(b => !b.signedAt && b.no === nextNo)
    || { id: batchId(entity, nextNo), entity, no: nextNo, accountant: signed[0]?.accountant || DEFAULT_ACCOUNTANT, exported: {}, signedAt: null }
  const ownRecords = records.filter(r => r.entity === entity)
  const recordsOf = no => ownRecords
    .filter(r => (r.batchNo ?? openBatch.no) === no)
    .sort(byDate)
  return { openBatch, signedBatches: signed, recordsOf }
}

export function batchItems(records) {
  return records.flatMap(r => (r.items || []).map(item => ({ ...item, customerName: r.customerName, date: r.date })))
}

// Dấu vân tay nội dung bộ lúc xuất file — thêm/xoá/sửa mặt hàng sau đó thì khác đi, báo "cần xuất lại".
export function itemsSignature(items) {
  const text = JSON.stringify(items.map(it => [it.maHang, it.tenHang, it.loLoi, it.hanDungLoi, it.dvt, it.soLuong, it.quyCach, it.lyDo]))
  let hash = 5381
  for (let i = 0; i < text.length; i += 1) hash = ((hash * 33) ^ text.charCodeAt(i)) >>> 0
  return `${items.length}:${hash.toString(36)}`
}

// 'none' = chưa xuất, 'ok' = đã xuất đúng nội dung hiện tại, 'stale' = đã xuất nhưng bộ đổi sau đó.
export function exportState(batch, key, items) {
  const exported = batch?.exported?.[key]
  if (!exported) return 'none'
  return exported.signature === itemsSignature(items) ? 'ok' : 'stale'
}
