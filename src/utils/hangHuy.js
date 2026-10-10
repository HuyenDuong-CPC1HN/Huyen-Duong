// Theo dõi hàng huỷ Kho C / Kho DTP theo phiếu xuất kho: kho tải PDF phiếu xuất kho → app đọc dữ liệu →
// điền bộ biên bản (xử lý = Excel, xác minh = Word) → ký đủ, huỷ xong. 1 phiếu xuất kho = 1 bộ biên bản.
// Cột "Tình trạng" luôn để trống cho kho tự diễn giải hàng thực tế. Phiếu lưu ở ops_settings (khoá "huy_slips").

export const HUY_SLIPS_KEY = 'huy_slips'
export const HUY_SLIPS_EVENT = 'huy-slips-changed'

// todo: mới tải phiếu, chưa làm · doing: đang điền · exported: đã xuất file, chờ ký · done: đã ký đủ, huỷ xong
export const HUY_STAGES = {
  todo: { label: 'Chưa làm biên bản', tone: 'todo' },
  doing: { label: 'Đang điền', tone: 'doing' },
  exported: { label: 'Đã xuất, chờ ký', tone: 'doing' },
  done: { label: 'Đã ký, huỷ xong', tone: 'done' },
}

// entity: khoá mẫu trong exportDamagedGoods.js (Kho C = CPC1HN, Kho DTP = UPHARMA).
export const HUY_KHO = {
  C: { label: 'Kho C', entity: 'khoC' },
  DTP: { label: 'Kho DTP', entity: 'khoDTP' },
}

export const HUY_REMINDER_RULES = [
  { kind: 'todo', title: 'Phiếu xuất kho chưa làm xong biên bản quá 1 ngày', hours: 24 },
  { kind: 'sign', title: 'Đã xuất biên bản, chưa ký đủ quá 3 ngày', hours: 72 },
]

const HOUR = 3600000
const DAY = 24 * HOUR

const pad2 = n => String(n).padStart(2, '0')
const toIsoDate = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`

// Số biên bản gợi ý = số lớn nhất đã dùng trong năm + 1 (cả Kho C lẫn Kho DTP cùng đánh "…/2026/BC-CPC1HN").
export function nextSoBienBan(phieus, year) {
  let max = 0
  for (const p of phieus || []) {
    if (String(p?.form?.ngayLap || '').slice(0, 4) !== String(year)) continue
    const n = Number.parseInt(p.form.soBB, 10)
    if (Number.isFinite(n) && n > max) max = n
  }
  return String(max + 1)
}

export function newHuyForm(phieus = [], today = new Date()) {
  const iso = toIsoDate(today)
  return {
    soBB: nextSoBienBan(phieus, today.getFullYear()), ngayLap: iso,
    xlNgay: iso, xlGio: '08:30', diaDiem: 'Kho CN Hồ Chí Minh', phuongPhap: 'Xuất gửi nhà máy xử lý',
    xmNgay: iso, xmGio: '08:30',
  }
}

// parsed: kết quả parsePhieuXuatKhoHuyPdf. "Thực huỷ" mặc định = số lượng trên phiếu; dòng phiếu không có số
// lượng thì để trống cho kho nhập tay.
export function newHuyPhieu(parsed, fileName, existing = [], now = new Date()) {
  const iso = now.toISOString()
  return {
    id: `huy_${now.getTime()}`,
    kho: parsed.kho, soPhieu: parsed.soPhieu, ngayPhieu: parsed.ngayPhieu, khoXuat: parsed.khoXuat, lyDo: parsed.lyDo,
    fileName, importedAt: iso, stage: 'todo',
    items: parsed.items.map(it => ({ ...it, thucHuy: it.soLuong, quyCach: '', tinhTrang: '' })),
    form: newHuyForm(existing, now),
  }
}

// Kho xuất mặc định khi thêm tay (giống trên phiếu xuất kho hàng huỷ của từng kho), sửa được trên màn biên bản.
export const HUY_KHO_XUAT_MAC_DINH = { C: '020102', DTP: '020105' }

export function newHuyItem() {
  // rowId cố định làm key của dòng trên màn biên bản — không dùng mã hàng/số lô (đang gõ đổi liên tục, dòng bị
  // dựng lại và mất con trỏ sau mỗi ký tự).
  return { rowId: `r_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`, maHang: '', tenHang: '', soLo: '', hanDung: '', dvt: '', soLuong: null, thucHuy: null, quyCach: '', tinhTrang: '' }
}

// Phiếu thêm tay (không có PDF phiếu xuất kho): kho tự gõ số phiếu, ngày, lý do và từng dòng hàng.
export function newManualHuyPhieu(kho, existing = [], now = new Date()) {
  return {
    id: `huy_${now.getTime()}`, manual: true,
    kho, soPhieu: '', ngayPhieu: toIsoDate(now), khoXuat: HUY_KHO_XUAT_MAC_DINH[kho] || '', lyDo: '',
    fileName: '', importedAt: now.toISOString(), stage: 'doing',
    items: [newHuyItem()],
    form: newHuyForm(existing, now),
  }
}

// Phiếu thêm tay mà chưa gõ gì (không số phiếu, không dòng hàng nào có mã/tên) — đóng lại thì bỏ luôn.
export function isEmptyManualHuy(phieu) {
  return Boolean(phieu?.manual) && !phieu.soPhieu && !(phieu.items || []).some(it => it.maHang || it.tenHang)
}

// Các chỗ còn thiếu — vẫn cho xuất (Excel/Word để trống chỗ đó), chỉ để nhắc.
export function missingHuyFields(phieu) {
  const f = phieu.form || {}
  const items = phieu.items || []
  const missing = []
  if (!f.soBB) missing.push('số biên bản')
  if (items.some(it => it.thucHuy === null || it.thucHuy === '' || it.thucHuy === undefined)) missing.push('số lượng thực huỷ')
  if (items.some(it => !it.quyCach)) missing.push('quy cách')
  if (items.some(it => !it.tinhTrang)) missing.push('tình trạng')
  return missing
}

// Việc cần nhắc: { slip, kind, since (ISO), days }.
export function huyReminders(phieus, now = new Date()) {
  const nowMs = now.getTime()
  const list = []
  for (const slip of phieus || []) {
    if (!slip) continue
    const push = (kind, since, hours) => {
      if (!since) return
      const age = nowMs - new Date(since).getTime()
      if (age > hours * HOUR) list.push({ slip, kind, since, days: Math.floor(age / DAY) })
    }
    if (slip.stage === 'todo' || slip.stage === 'doing') push('todo', slip.importedAt, 24)
    else if (slip.stage === 'exported') push('sign', slip.exportedAt, 72)
  }
  return list.sort((a, b) => b.days - a.days)
}

export function huyDmy(iso) {
  if (!iso) return [null, null, null]
  const [y, m, d] = String(iso).split('-')
  return [d, m, y]
}
export function huyDateVi(iso) {
  const [d, m, y] = huyDmy(iso)
  return d ? `${d}/${m}/${y}` : ''
}
// "08:30" → "08h30’" (đúng chữ trong file mẫu Word / Excel)
export function huyGioVi(gio) {
  return gio ? `${gio.replace(':', 'h')}’` : ''
}
