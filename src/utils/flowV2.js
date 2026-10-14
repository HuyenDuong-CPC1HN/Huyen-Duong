// Tab "Hàng trả & huỷ (Demo)": 1 luồng việc chung cho hàng sau khi đã xuất kho (Kho C + Kho DTP, chung nguyên tắc).
// - Hồ sơ khách trả (case): "tra" = hàng nguyên vẹn (nhập lại, bán tiếp) · "loi" = hàng lỗi (nhập lại, đổi lô khác cho
//   khách, rồi hàng lỗi vào Chờ huỷ).
// - Khu Huỷ hàng: Chờ huỷ (pool) gồm hàng lỗi khách trả + hàng phát sinh trong kho (cận date / lỗi, kho thêm thủ công)
//   → tick chọn → Tạo đợt huỷ (batch, 1 kho / đợt) → 1 bộ BB xác minh huỷ + BB xử lý → ký → kế toán xuất huỷ → xong.
// Dữ liệu riêng của tab này (khoá flowv2_*), không đụng dữ liệu các tab cũ.

export const FLOWV2_CASES_KEY = 'flowv2_cases'
export const FLOWV2_POOL_KEY = 'flowv2_pool'
export const FLOWV2_BATCHES_KEY = 'flowv2_batches'
export const FLOWV2_EVENT = 'flowv2-changed'

// col: cột trên bảng việc (0 Tiếp nhận · 1 Lập biên bản · 2 Chờ ký · 3 Nhập / đổi / chờ · 4 Hoàn thành)
export const CASE_FLOWS = {
  tra: {
    label: 'Khách trả — hàng nguyên vẹn', short: 'Trả nguyên vẹn',
    steps: [
      { k: 'tiepNhan', t: 'Tiếp nhận + BB trả hàng', col: 0, who: 'Kho', phase: 'Nhập lại kho' },
      { k: 'xmNhap', t: 'BB xác minh tình trạng (nhập lại)', col: 1, who: 'Kho' },
      { k: 'kyNhap', t: 'Ký đủ biên bản', col: 2, who: 'Kho · GĐ chi nhánh' },
      { k: 'ktNhap', t: 'Kế toán nhập trả lại (phiếu + hoá đơn)', col: 3, who: 'Kế toán', kt: true },
      { k: 'banTiep', t: 'Đã nhập kho — bán tiếp', col: 4, who: 'Kho' },
    ],
  },
  loi: {
    label: 'Khách trả — hàng lỗi (đổi hàng)', short: 'Trả lỗi · đổi hàng',
    steps: [
      { k: 'tiepNhan', t: 'Tiếp nhận hàng lỗi', col: 0, who: 'Kho', phase: 'Nhập lại + đổi hàng' },
      { k: 'xmNhap', t: 'BB xác minh tình trạng (nhập lại)', col: 1, who: 'Kho' },
      { k: 'kyNhap', t: 'Ký đủ biên bản', col: 2, who: 'Kho · GĐ chi nhánh' },
      { k: 'phieuNhap', t: 'Nhập lại kho (phiếu nhập lại)', col: 3, who: 'Kho · Kế toán' },
      { k: 'doiHang', t: 'Xuất lô khác đổi cho khách', col: 3, who: 'Kho' },
      { k: 'choHuy', t: 'Chờ huỷ (khu Huỷ hàng)', col: 3, who: 'Kho — gom vào đợt huỷ', phase: 'Xuất huỷ hàng lỗi' },
      { k: 'dangHuy', t: 'Đang huỷ trong đợt', col: 3, who: 'Theo đợt huỷ' },
      { k: 'xong', t: 'Huỷ xong', col: 4, who: '' },
    ],
  },
}

export const BATCH_STEPS = [
  { k: 'bb', t: 'BB xác minh huỷ + BB xử lý', who: 'Kho' },
  { k: 'ky', t: 'Ký đủ biên bản huỷ', who: 'Kho · GĐ chi nhánh' },
  { k: 'kt', t: 'Kế toán xuất huỷ khỏi phần mềm', who: 'Kế toán', kt: true },
  { k: 'xong', t: 'Huỷ xong', who: '' },
]

export const BOARD_COLS = [
  ['Tiếp nhận', 'nhận hàng / file, chưa làm giấy tờ'],
  ['Lập biên bản', 'điền, xem trước, in'],
  ['Chờ ký', 'đã in, chờ ký đủ'],
  ['Nhập / đổi / chờ', 'nhập lại, đổi hàng, chờ kế toán, chờ huỷ'],
  ['Hoàn thành', 'đã xong'],
]

// Màu viền thẻ theo loại trên bảng việc / khu Huỷ hàng.
export const KIND_BORDER = { tra: '#2f855a', loi: '#c05621', ps: '#6b46c1', batch: '#c05621' }

export const PS_LOAI = ['Hàng cận date', 'Hàng lỗi từ nhà máy', 'Hàng lỗi trong kho']
export const DEFAULT_KE_TOAN = 'Lưu Thị Thuỳ'
const DAY = 86400000

const pad2 = n => String(n).padStart(2, '0')
export const toIsoDate = (d = new Date()) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
const rid = (p) => `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`

export const stepOfCase = c => CASE_FLOWS[c.kind].steps[c.step] || CASE_FLOWS[c.kind].steps[0]
export const stepIndex = (kind, k) => CASE_FLOWS[kind].steps.findIndex(s => s.k === k)
export const daysSince = (iso, now = new Date()) => (iso ? Math.max(0, Math.floor((now - new Date(iso)) / DAY)) : 0)
export const isCaseDone = c => stepOfCase(c).col === 4

export function newItem(extra = {}) {
  return { rowId: rid('r'), maHang: '', tenHang: '', soLo: '', hanDung: '', dvt: '', soLuong: null, quyCach: '', tinhTrang: '', ...extra }
}

export function defaultTinhTrang(c) {
  return c.kind === 'tra' ? 'Hàng nguyên vẹn' : (c.loiLyDo || 'Hàng lỗi')
}

// kind: tra | loi · sub (chỉ tra): tuChoi = khách từ chối nhận (BB trả hàng nội bộ) · daNhan = khách đã nhận rồi trả
export function newCase({ kind, sub = 'tuChoi', kho = 'C', khachHang = '', soDon = '', items = [], files = [] }, now = new Date()) {
  const iso = now.toISOString()
  const day = toIsoDate(now)
  const c = {
    id: rid('case'), kind, sub: kind === 'tra' ? sub : null, kho, khachHang, soDon, loiLyDo: '',
    items: items.length ? items : [newItem()], files, photos: [], signedNhap: [],
    form: { xmNgay: day, xmGio: '08:30', keToan: DEFAULT_KE_TOAN },
    phieuNhapLai: '', keToan: DEFAULT_KE_TOAN, ktDone: null, batchId: null,
    step: 0, stepAt: iso, createdAt: iso, history: [{ step: 0, at: iso }],
  }
  c.items = c.items.map(it => ({ ...it, tinhTrang: it.tinhTrang || defaultTinhTrang(c) }))
  return c
}

// Hồ sơ hàng lỗi vừa xong bước "đổi hàng" → tạo mục Chờ huỷ từ dòng hàng của hồ sơ.
export function poolEntryFromCase(c, now = new Date()) {
  return {
    id: rid('pool'), kho: c.kho, src: 'loi', caseId: c.id, who: c.khachHang || 'Khách hàng',
    items: c.items.filter(it => it.maHang || it.tenHang).map(it => ({ ...it, rowId: rid('r'), tinhTrang: it.tinhTrang || defaultTinhTrang(c) })),
    addedAt: now.toISOString(), pxk: null,
  }
}

// Hàng phát sinh trong kho (cận date / lỗi) kho thêm thủ công thẳng vào Chờ huỷ; PXK nếu có chỉ lưu kèm.
export function newPsEntry({ kho, loai = PS_LOAI[0], items = [], pxk = null }, now = new Date()) {
  return {
    id: rid('pool'), kho, src: 'ps', caseId: null, who: loai,
    items: items.filter(it => it.maHang || it.tenHang).map(it => ({ ...newItem(), ...it, tinhTrang: it.tinhTrang || loai })),
    addedAt: now.toISOString(), pxk,
  }
}

// Chuyển hồ sơ sang bước kế. Trả về { cases, pool } mới (không sửa mảng cũ). opts.ktBy: tên người xác nhận bước kế toán.
export function advanceCase(state, caseId, { ktBy = null } = {}, now = new Date()) {
  const iso = now.toISOString()
  let pool = state.pool
  const cases = state.cases.map(c => {
    if (c.id !== caseId) return c
    const steps = CASE_FLOWS[c.kind].steps
    if (c.step >= steps.length - 1) return c
    const next = { ...c, step: c.step + 1, stepAt: iso, history: [...(c.history || []), { step: c.step + 1, at: iso }] }
    if (stepOfCase(c).kt && ktBy) next.ktDone = { by: ktBy, at: iso }
    if (stepOfCase(next).k === 'choHuy' && !pool.some(e => e.caseId === c.id)) pool = [poolEntryFromCase(next, now), ...pool]
    return next
  })
  return { cases, pool }
}

// Lùi 1 bước (sửa nhầm). Hồ sơ hàng lỗi lùi khỏi Chờ huỷ thì rút mục khỏi Chờ huỷ (nếu chưa vào đợt).
export function backCase(state, caseId, now = new Date()) {
  const iso = now.toISOString()
  let pool = state.pool
  const cases = state.cases.map(c => {
    if (c.id !== caseId || c.step === 0) return c
    const k = stepOfCase(c).k
    if (k === 'dangHuy' || k === 'xong') return c // đã vào đợt: lùi ở đợt huỷ
    if (k === 'choHuy') pool = pool.filter(e => e.caseId !== c.id)
    const prev = { ...c, step: c.step - 1, stepAt: iso }
    if (stepOfCase(prev).kt) prev.ktDone = null
    return prev
  })
  return { cases, pool }
}

export function nextBatchNo(batches, kho, now = new Date()) {
  const ym = `${pad2(now.getMonth() + 1)}${String(now.getFullYear()).slice(2)}`
  const prefix = `ĐH-${kho}-${ym}-`
  const used = batches.filter(b => b.no?.startsWith(prefix)).map(b => Number(b.no.slice(prefix.length)) || 0)
  return `${prefix}${pad2((used.length ? Math.max(...used) : 0) + 1)}`
}

// Gom các mục Chờ huỷ (cùng 1 kho) thành 1 đợt huỷ: rút khỏi Chờ huỷ, hồ sơ hàng lỗi liên quan sang "Đang huỷ trong đợt".
export function makeBatch(state, kho, entryIds, now = new Date()) {
  const entries = state.pool.filter(e => entryIds.includes(e.id) && e.kho === kho)
  if (entries.length === 0) return state
  const ids = new Set(entries.map(e => e.id))
  const iso = now.toISOString()
  const day = toIsoDate(now)
  const batch = {
    id: rid('batch'), no: nextBatchNo(state.batches, kho, now), kho, entries,
    items: entries.flatMap(e => e.items.map(it => ({ ...it, rowId: rid('r'), entryId: e.id }))),
    form: { soBB: '', ngayLap: day, xlNgay: day, xlGio: '09:00', xmNgay: day, xmGio: '08:30', diaDiem: 'Kho CN Hồ Chí Minh', phuongPhap: 'Xuất gửi nhà máy xử lý', keToan: DEFAULT_KE_TOAN },
    khoXuat: kho === 'C' ? '020102' : '020105', signedHuy: [], keToan: DEFAULT_KE_TOAN, ktDone: null,
    step: 0, stepAt: iso, createdAt: iso,
  }
  const caseIds = new Set(entries.map(e => e.caseId).filter(Boolean))
  const dangHuy = stepIndex('loi', 'dangHuy')
  return {
    pool: state.pool.filter(e => !ids.has(e.id)),
    batches: [batch, ...state.batches],
    cases: state.cases.map(c => (caseIds.has(c.id) ? { ...c, step: dangHuy, stepAt: iso, batchId: batch.id } : c)),
    batchId: batch.id,
  }
}

// Đợt sang bước kế; xong đợt (bước cuối) thì mọi hồ sơ hàng lỗi trong đợt sang "Huỷ xong".
export function advanceBatch(state, batchId, { ktBy = null } = {}, now = new Date()) {
  const iso = now.toISOString()
  let doneIds = null
  const batches = state.batches.map(b => {
    if (b.id !== batchId || b.step >= BATCH_STEPS.length - 1) return b
    const next = { ...b, step: b.step + 1, stepAt: iso }
    if (BATCH_STEPS[b.step].kt && ktBy) next.ktDone = { by: ktBy, at: iso }
    if (next.step === BATCH_STEPS.length - 1) doneIds = new Set(b.entries.map(e => e.caseId).filter(Boolean))
    return next
  })
  const xong = stepIndex('loi', 'xong')
  const cases = doneIds ? state.cases.map(c => (doneIds.has(c.id) ? { ...c, step: xong, stepAt: iso } : c)) : state.cases
  return { batches, cases }
}

export function backBatch(state, batchId, now = new Date()) {
  const iso = now.toISOString()
  let undoIds = null
  const batches = state.batches.map(b => {
    if (b.id !== batchId || b.step === 0) return b
    if (b.step === BATCH_STEPS.length - 1) undoIds = new Set(b.entries.map(e => e.caseId).filter(Boolean))
    const prev = { ...b, step: b.step - 1, stepAt: iso }
    if (BATCH_STEPS[prev.step].kt) prev.ktDone = null
    return prev
  })
  const dangHuy = stepIndex('loi', 'dangHuy')
  const cases = undoIds ? state.cases.map(c => (undoIds.has(c.id) ? { ...c, step: dangHuy, stepAt: iso } : c)) : state.cases
  return { batches, cases }
}

// Huỷ đợt khi còn ở bước lập biên bản: trả các mục về Chờ huỷ, hồ sơ hàng lỗi về "Chờ huỷ".
export function dissolveBatch(state, batchId, now = new Date()) {
  const b = state.batches.find(x => x.id === batchId)
  if (!b || b.step !== 0) return state
  const iso = now.toISOString()
  const caseIds = new Set(b.entries.map(e => e.caseId).filter(Boolean))
  const choHuy = stepIndex('loi', 'choHuy')
  return {
    batches: state.batches.filter(x => x.id !== batchId),
    pool: [...b.entries, ...state.pool],
    cases: state.cases.map(c => (caseIds.has(c.id) ? { ...c, step: choHuy, stepAt: iso, batchId: null } : c)),
  }
}

// Đối tượng "phiếu" đúng dạng HangHuyPapers / exportHangHuyPhieu cần, dựng từ 1 đợt huỷ.
export function batchAsHuyPhieu(b) {
  return {
    kho: b.kho, soPhieu: b.no, khoXuat: b.khoXuat, form: b.form,
    items: b.items.map(it => ({ ...it, thucHuy: it.soLuong })),
  }
}

// Đối tượng "slip" đúng dạng XacMinhPaper của tab Nhập trả lại cần, dựng từ 1 hồ sơ khách trả.
export function caseAsReturnSlip(c) {
  const f = c.form || {}
  return {
    khachHang: c.khachHang,
    pdf: { mau: c.kho === 'DTP' ? 'UPHARMA' : 'CPC1HN', benMua: { ten: c.khachHang }, items: c.items.map(it => ({ ten: it.tenHang, dvt: it.dvt, soLuong: it.soLuong ?? '' })) },
    form: {
      xmNgay: f.xmNgay, xmGio: f.xmGio, xmKeToan: f.keToan, xmDiaDiem: 'CN.Hồ Chí Minh',
      xmTinhTrang: defaultTinhTrang(c), xmKetQua: 'Kiểm tra hàng đúng lô, đúng hạn dùng, đúng số lượng.',
      items: c.items.map(it => ({ soLo: it.soLo, hanDung: it.hanDung, quyCach: it.quyCach, tinhTrang: it.tinhTrang })),
    },
  }
}

// Việc đang chờ 1 kế toán: hồ sơ ở bước kế toán + đợt huỷ ở bước kế toán.
export function ktPending({ cases, batches }, name) {
  return {
    cases: cases.filter(c => stepOfCase(c).kt && (c.keToan || DEFAULT_KE_TOAN) === name),
    batches: batches.filter(b => BATCH_STEPS[b.step].kt && (b.keToan || DEFAULT_KE_TOAN) === name),
  }
}

// "22/08/2029", "22-08-29", "2029-08-22" → "2029-08-22"; không đọc được → null.
export function parseDateText(text) {
  const t = String(text || '').trim()
  let y, m, d
  let mm = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(t)
  if (mm) [, y, m, d] = mm
  else {
    mm = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/.exec(t)
    if (!mm) return null
    ;[, d, m, y] = mm
    if (y.length === 2) y = `20${y}`
  }
  const dt = new Date(Number(y), Number(m) - 1, Number(d))
  if (dt.getMonth() !== Number(m) - 1 || dt.getDate() !== Number(d)) return null
  return `${y}-${pad2(m)}-${pad2(d)}`
}
export const fmtDateVi = iso => { const [y, m, d] = String(iso || '').slice(0, 10).split('-'); return d ? `${d}/${m}/${y}` : '' }
export const fmtDateTimeVi = iso => { if (!iso) return ''; const d = new Date(iso); return `${pad2(d.getHours())}:${pad2(d.getMinutes())} ${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}` }
